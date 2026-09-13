import type { EmailSendRecord } from '@kcs-project/pack/models/email/send-record';
import type { Promisable } from 'type-fest';

export abstract class BaseEmailProvider {
    abstract close(): Promisable<void>;
    abstract sendEmail(sendRecord: EmailSendRecord, signal?: AbortSignal): Promise<{ transactionId?: string }>;
}
