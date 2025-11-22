import { EmailServiceProvider } from '@kiki-core-stack/pack/constants/email';
import type { EmailPlatform } from '@kiki-core-stack/pack/models/email/platform';

import type { BaseEmailServiceProvider } from './base';
import { EmailSmtpServiceProvider } from './smtp';

const emailServiceProviderInstances: Record<string, BaseEmailServiceProvider> = {};

export function createEmailServiceProviderInstance(emailPlatform: EmailPlatform): BaseEmailServiceProvider {
    const key = `${emailPlatform.serviceProvider}${emailPlatform.configMd5}`;
    if (emailServiceProviderInstances[key]) return emailServiceProviderInstances[key];
    const emailServiceProviderInstance = (() => {
        switch (emailPlatform.serviceProvider) {
            case EmailServiceProvider.Smtp: return new EmailSmtpServiceProvider(emailPlatform.config as any);
            default: throw new Error('unreachable');
        }
    })();

    return emailServiceProviderInstances[key] = emailServiceProviderInstance;
}
