import { EmailProviderCode } from '@kcs-project/pack/constants/email';
import type { EmailProvider } from '@kcs-project/pack/models/email/provider';
import type { EmailProviderConfigs } from '@kcs-project/pack/types/email';

import type { BaseEmailProvider } from './base';
import { EmailProviderError } from './error';
import { EmailSmtpProvider } from './smtp';

const instances = new Map<string, BaseEmailProvider>();

export async function closeEmailProviderInstances() {
    const results = await Promise.allSettled([...instances.values()].map(async (instance) => {
        await instance.close();
    }));

    instances.clear();
    const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Email provider cleanup failed');
}

export function getOrCreateEmailProviderInstance(provider: EmailProvider) {
    const key = `${provider.providerCode}:${provider.configHash}`;
    let instance = instances.get(key);
    if (instance) return instance;
    switch (provider.providerCode) {
        case EmailProviderCode.Smtp:
            instance = new EmailSmtpProvider(provider.config as EmailProviderConfigs.Smtp);
            break;
        default: throw new EmailProviderError('Unsupported Email provider', 'not-accepted');
    }

    instances.set(key, instance);
    return instance;
}
