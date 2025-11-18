import type { EmailSendRecordDocument } from '@kiki-core-stack/pack/models/email/send-record';

export abstract class BaseEmailServiceProvider {
    abstract sendEmail(emailSendRecord: EmailSendRecordDocument): Promise<{ transactionId?: string }>;
}
