import { closeSmsProviderInstances } from '@kcs-project/pack/providers/sms';

import { BullMqWorkerGroup } from '@/libs/bullmq/worker-group';
import { BaseServiceLifecycle } from '@/service/base-lifecycle';

import { smsSendJobQueue } from './send-job/queue';
import { createSmsSendJobBullMqWorker } from './send-job/worker';
import { smsSendRecordReconciler } from './send-record-reconciler';

class SmsModule extends BaseServiceLifecycle {
    #sendJobWorkerGroup: BullMqWorkerGroup;

    constructor() {
        super('[module: sms]');

        this.#sendJobWorkerGroup = new BullMqWorkerGroup(this.logger);
    }

    // Private methods
    async #setupSendJobQueueAndWorker() {
        this.#sendJobWorkerGroup.add(createSmsSendJobBullMqWorker(this.logger));
        await Promise.race([
            smsSendJobQueue.waitUntilReady(),
            this.lifecycleCancellationPromise,
        ]);
    }

    // Protected methods
    protected async cleanupResources() {
        await this.tryCleanup(async () => await smsSendRecordReconciler.stop());
        await this.tryCleanup(async () => await this.#sendJobWorkerGroup.close());
        await this.tryCleanup(closeSmsProviderInstances);
        await this.tryCleanup(async () => await smsSendJobQueue.close());
    }

    // Public methods
    async start() {
        return await this.executeStart(async () => {
            await smsSendRecordReconciler.start();
            await this.#setupSendJobQueueAndWorker();

            // Start workers
            await this.#sendJobWorkerGroup.start(this.lifecycleCancellationSignal);
        });
    }
}

export const smsModule = new SmsModule();
