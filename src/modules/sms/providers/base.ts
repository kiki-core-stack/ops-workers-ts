import type { SmsSendRecord } from '@kcs-project/pack/models/sms/send-record';
import type { SmsProviderConfigs } from '@kcs-project/pack/types/sms';
import axios from 'axios';
import type { AxiosInstance } from 'axios';

import type { AxiosProxyAgents } from '@/utils/axios';
import { createAxiosProxyAgentOptions } from '@/utils/axios';

import type { LeanedSmsProvider } from './';

export abstract class BaseSmsProvider<C extends SmsProviderConfigs.Mitake | SmsProviderConfigs.TwSms> {
    readonly #axiosProxyAgents: AxiosProxyAgents;

    protected readonly axiosInstance: AxiosInstance;
    protected readonly config: C;

    constructor(provider: LeanedSmsProvider) {
        this.config = provider.config as C;
        this.#axiosProxyAgents = createAxiosProxyAgentOptions(provider.apiProxyUrl);
        this.axiosInstance = axios.create({
            baseURL: this.config.apiUrl,
            proxy: false,
            ...this.#axiosProxyAgents,
        });
    }

    // Public methods
    close() {
        this.#axiosProxyAgents.httpAgent?.destroy();
        this.#axiosProxyAgents.httpsAgent?.destroy();
    }

    abstract sendSms(sendRecord: SmsSendRecord, signal?: AbortSignal): Promise<{ transactionId?: string }>;
}
