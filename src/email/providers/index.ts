import { EmailProviderCode } from '@kiki-core-stack/pack/constants/email';
import type { EmailProvider } from '@kiki-core-stack/pack/models/email/provider';

import type { BaseEmailProvider } from './base';
import { EmailSmtpProvider } from './smtp';

const emailProviderInstances: Record<string, BaseEmailProvider> = {};

export function createEmailProviderInstance(emailProvider: EmailProvider): BaseEmailProvider {
    const key = `${emailProvider.providerCode}:${emailProvider.configHash}`;
    if (emailProviderInstances[key]) return emailProviderInstances[key];
    const emailProviderInstance = (() => {
        switch (emailProvider.providerCode) {
            case EmailProviderCode.Smtp: return new EmailSmtpProvider(emailProvider.config as any);
            default: throw new Error('unreachable');
        }
    })();

    return emailProviderInstances[key] = emailProviderInstance;
}
