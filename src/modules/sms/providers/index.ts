import { SmsProviderCode } from '@kcs-project/pack/constants/sms';
import type {
    SmsProvider,
    SmsProviderDocument,
} from '@kcs-project/pack/models/sms/provider';
import type { GetLeanResultType } from 'mongoose';

import type { BaseSmsProvider } from './base';
import { SmsProviderError } from './error';
import { SmsMitakeProvider } from './mitake';
import { SmsTwSmsProvider } from './tw-sms';

export type LeanedSmsProvider = GetLeanResultType<SmsProvider, SmsProviderDocument, 'findOne'>;

// Constants/Variables
const instances = new Map<string, BaseSmsProvider<any>>();

// Functions
export async function closeSmsProviderInstances() {
    const results = await Promise.allSettled([...instances.values()].map(async (instance) => {
        await instance.close();
    }));

    instances.clear();
    const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Sms provider cleanup failed');
}

export function getOrCreateSmsProviderInstance(provider: LeanedSmsProvider) {
    let instance = instances.get(provider.cacheKey);
    if (instance) return instance;
    switch (provider.code) {
        case SmsProviderCode.Mitake:
            instance = new SmsMitakeProvider(provider);
            break;
        case SmsProviderCode.TwSms:
            instance = new SmsTwSmsProvider(provider);
            break;
        default: throw new SmsProviderError('Unsupported Sms provider', 'not-accepted');
    }

    instances.set(provider.cacheKey, instance);
    return instance;
}
