export type EmailProviderErrorOutcome = 'not-accepted' | 'unknown';

export class EmailProviderError extends Error {
    readonly outcome: EmailProviderErrorOutcome;
    readonly retryable: boolean;

    constructor(
        message: string,
        outcome: EmailProviderErrorOutcome,
        retryable: boolean = false,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = 'EmailProviderError';
        this.outcome = outcome;
        this.retryable = retryable;
    }
}
