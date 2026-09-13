import type { SmsSendRecord } from '@kcs-project/pack/models/sms/send-record';
import type { SmsProviderConfigs } from '@kcs-project/pack/types/sms';
import type { ReadonlyRecord } from '@kikiutils/shared/types';
import type { AxiosResponse } from 'axios';
import { AxiosError } from 'axios';

import { getErrorMessage } from '@/utils/error';

import { BaseSmsProvider } from './base';
import { SmsProviderError } from './error';

import type { LeanedSmsProvider } from './';

interface SendSmsResponseData {
    accountPoint?: string;
    message?: string;
    raw: string;
    statusCode?: string;
    transactionId?: string;
}

// Constants/Variables
const apiErrorResponseCodeToMessageMap: ReadonlyRecord<string, string> = {
    '-9': '系統錯誤',
    '-8': '預約時間格式錯誤',
    '-7': '帳號停用',
    '-6': 'IP 未授權',
    '-5': 'API 參數錯誤',
    '-4': '內容空白或格式錯誤',
    '-3': '目標門號錯誤',
    '-2': '帳號餘額不足',
    '-1': '帳號或密碼錯誤',
};

const retryableApiErrorResponseCodes = new Set(['-9']);

export class SmsMitakeProvider extends BaseSmsProvider<SmsProviderConfigs.Mitake> {
    constructor(provider: LeanedSmsProvider) {
        super(provider);
    }

    // Private methods
    #parseSendSmsResponse(raw: string): SendSmsResponseData {
        const data: Record<string, string> = {};
        for (const line of raw.split(/\r?\n/)) {
            const trimmedLine = line.trim();
            if (!trimmedLine || /^\[.+\]$/.test(trimmedLine)) continue;
            const separatorIndex = trimmedLine.indexOf('=');
            if (separatorIndex < 0) continue;
            data[trimmedLine.slice(0, separatorIndex).trim().toLowerCase()] = trimmedLine
                .slice(separatorIndex + 1)
                .trim();
        }

        return {
            accountPoint: data.accountpoint,
            message: data.statusstr ?? data.errmsg,
            raw,
            statusCode: data.statuscode,
            transactionId: data.msgid,
        };
    }

    // Private methods
    #deliveryFailure(error: unknown) {
        const responseStatus = error instanceof AxiosError ? error.response?.status : undefined;
        const notAccepted = typeof responseStatus === 'number'
          && responseStatus >= 400
          && responseStatus < 500
          && responseStatus !== 408;

        return new SmsProviderError(
            getErrorMessage(error),
            notAccepted ? 'not-accepted' : 'unknown',
            responseStatus === 429,
            { cause: error },
        );
    }

    // Public methods
    async sendSms(smsSendRecord: SmsSendRecord, signal?: AbortSignal) {
        if (signal?.aborted) throw new SmsProviderError('Delivery cancelled before SMS call', 'not-accepted', true);

        let response: AxiosResponse | undefined;
        let responseError: unknown;
        try {
            response = await this.axiosInstance.post(
                '/b2c/mtk/SmSend',
                {
                    dstaddr: smsSendRecord.to,
                    password: this.config.password,
                    smbody: smsSendRecord.content.replace(/\r?\n/g, String.fromCharCode(6)),
                    username: this.config.username,
                },
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    params: { CharsetURL: 'UTF-8' },
                    responseType: 'text',
                    signal,
                    transformRequest: (data) => new URLSearchParams(data).toString(),
                },
            );
        } catch (error) {
            if (!(error instanceof AxiosError) || !error.response) throw this.#deliveryFailure(error);
            else {
                response = error.response;
                responseError = error;
            }
        }

        const parsedResponse = this.#parseSendSmsResponse(String(response?.data ?? ''));
        if (!parsedResponse.statusCode) {
            if (responseError) throw this.#deliveryFailure(responseError);
            throw new SmsProviderError(`回應格式錯誤：${parsedResponse.raw}`, 'unknown');
        }

        if (parsedResponse.statusCode !== '0' && parsedResponse.statusCode !== '1') {
            throw new SmsProviderError(
                parsedResponse.message
                ?? apiErrorResponseCodeToMessageMap[parsedResponse.statusCode]
                ?? `發送失敗：${parsedResponse.statusCode}`,
                'not-accepted',
                retryableApiErrorResponseCodes.has(parsedResponse.statusCode),
            );
        }

        return { transactionId: parsedResponse.transactionId };
    }
}
