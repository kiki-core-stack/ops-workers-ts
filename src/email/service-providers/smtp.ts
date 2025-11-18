import type { EmailSendRecordDocument } from '@kiki-core-stack/pack/models/email/send-record';
import type { EmailPlatformConfigs } from '@kiki-core-stack/pack/types/email';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type * as SMTPTransport from 'nodemailer/lib/smtp-transport';

import { BaseEmailServiceProvider } from './base';

export class EmailSmtpServiceProvider extends BaseEmailServiceProvider {
    readonly #transport: Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>;

    constructor(config: EmailPlatformConfigs.Smtp) {
        super();
        this.#transport = createTransport({
            auth: config.username && config.password
                ? {
                    pass: config.password,
                    user: config.username,
                }
                : undefined,
            host: config.host,
            port: config.port,
            requireTLS: config.requireTls,
            secure: config.secure,
        });
    }

    async sendEmail(emailSendRecord: EmailSendRecordDocument) {
        const sendResult = await this.#transport.sendMail({
            bcc: emailSendRecord.to,
            from: emailSendRecord.from,
            html: emailSendRecord.content,
            subject: emailSendRecord.subject,
        });

        return { transactionId: sendResult.messageId };
    }
}
