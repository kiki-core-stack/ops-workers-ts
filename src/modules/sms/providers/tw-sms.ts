import type { SmsSendRecord } from '@kcs-project/pack/models/sms/send-record';
import type { SmsProviderConfigs } from '@kcs-project/pack/types/sms';
import type { ReadonlyRecord } from '@kikiutils/shared/types';
import type { AxiosResponse } from 'axios';
import { AxiosError } from 'axios';

import { getErrorMessage } from '@/utils/error';

import { BaseSmsProvider } from './base';
import { SmsProviderError } from './error';

import type { LeanedSmsProvider } from './';

// Constants/Variables
const apiErrorResponseCodeToMessageMap: ReadonlyRecord<string, string> = {
    '00001': '狀態尚未回復',
    '00010': '帳號或密碼格式錯誤',
    '00011': '帳號錯誤',
    '00012': '密碼錯誤',
    '00020': '通數不足',
    '00030': 'IP 無使用權限',
    '00031': '限制發送國際門號',
    '00040': '帳號已停用',
    '00041': 'API 未啟用(請登入平台後至帳號設定內的 API 設定中啟用)',
    '00050': 'sendtime 格式錯誤',
    '00060': 'expirytime 格式錯誤',
    '00100': '手機號碼格式錯誤',
    '00110': '沒有簡訊內容',
    '00120': '長簡訊不支援國際門號',
    '00130': '簡訊內容超過長度',
    '00140': 'drurl 格式錯誤',
    '00150': 'sendtime 預約的時間已經超過',
    '00170': 'drurl 帶入的網址無法連線(http code 必須為 200)',
    '00180': '簡訊內容帶有 Emoji 圖形',
    '00300': '找不到 msgid',
    '00310': '預約尚未送出',
    '00400': '找不到 snumber 辨識碼',
    '00410': '沒有任何 mo 資料',
    '00420': 'smsQuery 指定查詢的格式錯誤',
    '00430': 'moQuery 指定查詢的格式錯誤',
    '99998': '資料處理異常，請重新發送',
    '99999': '系統錯誤，請通知系統廠商',
};

const retryableApiErrorResponseCodes = new Set([
    '00001',
    '99998',
    '99999',
]);

export class SmsTwSmsProvider extends BaseSmsProvider<SmsProviderConfigs.TwSms> {
    constructor(provider: LeanedSmsProvider) {
        super(provider);
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
    override async sendSms(smsSendRecord: SmsSendRecord, signal?: AbortSignal) {
        if (signal?.aborted) throw new SmsProviderError('Delivery cancelled before SMS call', 'not-accepted', true);

        let response: AxiosResponse | undefined;
        let responseError: unknown;
        try {
            response = await this.axiosInstance.post(
                '/json/sms_send.php',
                {},
                {
                    params: {
                        message: smsSendRecord.content,
                        mobile: smsSendRecord.to.replace(/^\+/, ''),
                        password: this.config.password,
                        username: this.config.username,
                    },
                    signal,
                },
            );
        } catch (error) {
            if (!(error instanceof AxiosError) || !error.response) throw this.#deliveryFailure(error);
            else {
                response = error.response;
                responseError = error;
            }
        }

        const responseCode = response?.data?.code;
        if (!responseCode) {
            if (responseError) throw this.#deliveryFailure(responseError);
            throw new SmsProviderError('回應格式錯誤', 'unknown');
        }

        if (responseCode !== '00000') {
            throw new SmsProviderError(
                apiErrorResponseCodeToMessageMap[responseCode] ?? `發送失敗：${responseCode}`,
                'not-accepted',
                retryableApiErrorResponseCodes.has(responseCode),
            );
        }

        return { transactionId: response?.data?.msgid?.toString() };
    }
}
