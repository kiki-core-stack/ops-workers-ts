import { SmsProviderCode } from '@kcs-project/pack/constants/sms';
import type { SmsProvider } from '@kcs-project/pack/models/sms/provider';
import type { SmsProviderConfigs } from '@kcs-project/pack/types/sms';

import type { BaseSmsProvider } from './base';
import { SmsProviderError } from './error';
import { SmsMitakeProvider } from './mitake';
import { SmsTwSmsProvider } from './tw-sms';

const instances = new Map<string, BaseSmsProvider>();

export async function closeSmsProviderInstances() {
    const results = await Promise.allSettled([...instances.values()].map(async (instance) => {
        await instance.close();
    }));

    instances.clear();
    const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Sms provider cleanup failed');
}

export function getOrCreateSmsProviderInstance(provider: SmsProvider) {
    const key = `${provider.providerCode}:${provider.configHash}`;
    let instance = instances.get(key);
    if (instance) return instance;
    switch (provider.providerCode) {
        case SmsProviderCode.Mitake:
            instance = new SmsMitakeProvider(provider.config as SmsProviderConfigs.Mitake);
            break;
        case SmsProviderCode.TwSms:
            instance = new SmsTwSmsProvider(provider.config as SmsProviderConfigs.TwSms);
            break;
        default: throw new SmsProviderError('Unsupported Sms provider', 'not-accepted');
    }

    instances.set(key, instance);
    return instance;
}
