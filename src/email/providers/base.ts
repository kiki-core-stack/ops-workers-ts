import type { EmailSendRecord } from '@kcs-project/pack/models/email/send-record';

export abstract class BaseEmailProvider {
    abstract sendEmail(emailSendRecord: EmailSendRecord): Promise<{ transactionId?: string }>;
}
