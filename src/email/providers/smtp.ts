import type { EmailSendRecord } from '@kcs-project/pack/models/email/send-record';
import type { EmailProviderConfigs } from '@kcs-project/pack/types/email';
import { createTransport } from 'nodemailer';
import type { Mail } from 'nodemailer';
import type * as SMTPTransport from 'nodemailer/lib/smtp-transport';

import { BaseEmailProvider } from './base';

export class EmailSmtpProvider extends BaseEmailProvider {
    readonly #transport: Mail<SMTPTransport.SMTPSentMessageInfo>;

    constructor(config: EmailProviderConfigs.Smtp) {
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
            requireTLS: config.tls.required,
            secure: config.secure,
            tls: { rejectUnauthorized: config.tls.rejectUnauthorized },
        });
    }

    async sendEmail(emailSendRecord: EmailSendRecord) {
        const sendResult = await this.#transport.sendMail({
            bcc: emailSendRecord.to,
            from: emailSendRecord.from,
            html: emailSendRecord.content,
            subject: emailSendRecord.subject,
        });

        return { transactionId: sendResult.messageId };
    }
}
