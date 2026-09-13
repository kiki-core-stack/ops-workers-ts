import type { EmailSendRecord } from '@kcs-project/pack/models/email/send-record';
import type { EmailProviderConfigs } from '@kcs-project/pack/types/email';
import type { Promisable } from 'type-fest';

import type { LeanedEmailProvider } from './';

export abstract class BaseEmailProvider<C extends EmailProviderConfigs.Smtp> {
    protected readonly apiProxyUrl?: string;
    protected readonly config: C;

    constructor(provider: LeanedEmailProvider) {
        this.apiProxyUrl = provider.apiProxyUrl;
        this.config = provider.config as C;
    }

    // Public methods
    abstract close(): Promisable<void>;
    abstract sendEmail(sendRecord: EmailSendRecord, signal?: AbortSignal): Promise<{ transactionId?: string }>;
}
