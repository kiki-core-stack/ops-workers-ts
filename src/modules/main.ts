import { BaseServiceLifecycle } from '@/service/base-lifecycle';

import { emailModule } from './email';
import { jobOutboxEventPublisherModule } from './job-outbox-event-publisher';

class MainModule extends BaseServiceLifecycle {
    readonly #startedModules: BaseServiceLifecycle[] = [];

    constructor() {
        super('[module: main]');
    }

    // Private methods
    async #startChildModule(childModule: BaseServiceLifecycle) {
        const cancelModuleLifecycle = () => childModule.cancelLifecycle();
        this.lifecycleCancellationSignal.addEventListener('abort', cancelModuleLifecycle, { once: true });
        try {
            await childModule.start();
            this.#startedModules.push(childModule);
        } finally {
            this.lifecycleCancellationSignal.removeEventListener('abort', cancelModuleLifecycle);
        }
    }

    // Protected methods
    protected async cleanupResources() {
        for (const module of [...this.#startedModules].reverse()) await this.tryCleanup(() => module.stop());
        this.#startedModules.length = 0;
    }

    // Public methods
    start() {
        return this.executeStart(async () => {
            await this.#startChildModule(emailModule);
            await this.#startChildModule(jobOutboxEventPublisherModule);
        });
    }
}

export const mainModule = new MainModule();
