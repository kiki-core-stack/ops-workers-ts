export type SmsProviderErrorOutcome = 'not-accepted' | 'unknown';

export class SmsProviderError extends Error {
    readonly outcome: SmsProviderErrorOutcome;
    readonly retryable: boolean;

    constructor(
        message: string,
        outcome: SmsProviderErrorOutcome,
        retryable: boolean = false,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = 'SmsProviderError';
        this.outcome = outcome;
        this.retryable = retryable;
    }
}
