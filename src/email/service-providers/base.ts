import type { EmailSendRecord } from '@kiki-core-stack/pack/models/email/send-record';

export abstract class BaseEmailServiceProvider {
    abstract sendEmail(emailSendRecord: EmailSendRecord): Promise<{ transactionId?: string }>;
}
