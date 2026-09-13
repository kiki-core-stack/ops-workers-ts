import type { EmailSendRecord } from '@kcs-project/pack/models/email/send-record';
import type { EmailProviderConfigs } from '@kcs-project/pack/types/email';
import { createTransport } from 'nodemailer';
import type { Mail } from 'nodemailer';
import type * as SMTPTransport from 'nodemailer/lib/smtp-transport';

import { BaseEmailProvider } from './base';
import { EmailProviderError } from './error';

import type { LeanedEmailProvider } from './';

export class EmailSmtpProvider extends BaseEmailProvider<EmailProviderConfigs.Smtp> {
    readonly #transport: Mail<SMTPTransport.SMTPSentMessageInfo>;

    constructor(provider: LeanedEmailProvider) {
        super(provider);
        this.#transport = createTransport({
            auth: this.config.username && this.config.password
                ? {
                    pass: this.config.password,
                    user: this.config.username,
                }
                : undefined,
            connectionTimeout: 10000,
            disableFileAccess: true,
            disableUrlAccess: true,
            dnsTimeout: 10000,
            greetingTimeout: 10000,
            host: this.config.host,
            port: this.config.port,
            requireTLS: this.config.tls.required,
            secure: this.config.secure,
            socketTimeout: 60000,
            tls: { rejectUnauthorized: this.config.tls.rejectUnauthorized },
        });
    }

    // Private methods
    #deliveryFailure(error: unknown) {
        const details = error instanceof Error
            ? error as Error & { code?: string; command?: string; responseCode?: number }
            : undefined;

        const code = details?.code;
        const responseCode = details?.responseCode;
        const negativeReply = typeof responseCode === 'number' && responseCode >= 400 && responseCode < 600;
        const rejectedSend =
            negativeReply
            && [
                'DATA',
                'MAIL FROM',
                'RCPT TO',
            ].includes(details?.command ?? '');

        const beforeDelivery =
            code === 'EDNS'
            || code === 'EAUTH'
            || code === 'ETLS'
            || code === 'EREQUIRETLS';

        // Nodemailer also reports mid-transaction socket failures as CONN.
        // Without explicit rejection evidence, timeout/disconnect remains unknown.
        const invalidEnvelope = code === 'EENVELOPE' && details?.command === 'API';
        const notAccepted = rejectedSend || beforeDelivery || invalidEnvelope;

        return new EmailProviderError(
            details?.message ?? String(error),
            notAccepted ? 'not-accepted' : 'unknown',
            notAccepted && !invalidEnvelope && (negativeReply ? responseCode < 500 : code === 'EDNS'),
            { cause: error },
        );
    }

    // Public methods
    close() {
        this.#transport.close();
    }

    async sendEmail(sendRecord: EmailSendRecord, signal?: AbortSignal) {
        if (signal?.aborted) throw new EmailProviderError('Delivery cancelled before SMTP call', 'not-accepted', true);
        try {
            // Once started, await the real SMTP outcome even if the queue lock is lost.
            // Do not close the transport early to simulate cancellation.
            const result = await this.#transport.sendMail({
                bcc: sendRecord.to,
                from: sendRecord.from,
                html: sendRecord.content,
                subject: sendRecord.subject,
            });

            if (!result.accepted.length) {
                throw new EmailProviderError('SMTP returned no confirmed recipient acceptance', 'unknown');
            }

            return { transactionId: result.messageId };
        } catch (error) {
            throw error instanceof EmailProviderError ? error : this.#deliveryFailure(error);
        }
    }
}
