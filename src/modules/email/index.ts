import { BullMqWorkerGroup } from '@/libs/bullmq-worker-group';
import { BaseServiceLifecycle } from '@/service/base-lifecycle';

import { closeEmailProviderInstances } from './providers';
import { emailSendJobQueue } from './send-job/queue';
import { createEmailSendJobBullMqWorker } from './send-job/worker';
import { emailSendRecordReconciler } from './send-record-reconciler';

class EmailModule extends BaseServiceLifecycle {
    #sendJobWorkerGroup: BullMqWorkerGroup;

    constructor() {
        super('[module: email]');

        this.#sendJobWorkerGroup = new BullMqWorkerGroup(this.logger);
    }

    // Private methods
    async #setupSendJobQueueAndWorker() {
        this.#sendJobWorkerGroup.add(createEmailSendJobBullMqWorker(this.logger));
        await Promise.race([
            emailSendJobQueue.waitUntilReady(),
            this.lifecycleCancellationPromise,
        ]);
    }

    // Protected methods
    protected async cleanupResources() {
        await this.tryCleanup(() => emailSendRecordReconciler.stop());
        await this.tryCleanup(() => this.#sendJobWorkerGroup.close());
        await this.tryCleanup(() => closeEmailProviderInstances());
        await this.tryCleanup(() => emailSendJobQueue.close());
    }

    // Public methods
    start() {
        return this.executeStart(async () => {
            await emailSendRecordReconciler.start();
            await this.#setupSendJobQueueAndWorker();

            // Start workers
            await this.#sendJobWorkerGroup.start(this.lifecycleCancellationSignal);
        });
    }
}

export const emailModule = new EmailModule();
