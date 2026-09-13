import type { SmsSendRecord } from '@kcs-project/pack/models/sms/send-record';
import type { Promisable } from 'type-fest';

export abstract class BaseSmsProvider {
    abstract close(): Promisable<void>;
    abstract sendSms(sendRecord: SmsSendRecord, signal?: AbortSignal): Promise<{ transactionId?: string }>;
}
