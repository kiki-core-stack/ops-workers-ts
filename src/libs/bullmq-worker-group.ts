import type { Worker } from 'bullmq';

import type { PrefixedLogger } from '@/utils/logger/prefixed';

interface OwnedWorker {
    close: () => Promise<boolean>;
    ready: () => Promise<unknown>;
    run: () => void;
}

// Resource ownership only. BullMQ still owns fetching, locks, retries and stalled recovery.
export class BullMqWorkerGroup {
    readonly #logger: PrefixedLogger;
    readonly #workers: OwnedWorker[] = [];
    #closePromise?: Promise<boolean>;

    constructor(logger: PrefixedLogger) {
        this.#logger = logger;
    }

    // Public methods
    add<D>(worker: Worker<D>) {
        let closing = false;
        let closeFailed = false;
        let runPromise: Promise<void> | undefined;

        worker.on('error', (error) => {
            // close() can report cleanup failures through events rather than rejection.
            if (closing) closeFailed = true;
            this.#logger.error(
                'Worker error',
                {
                    error,
                    queue: worker.name,
                },
            );
        });

        worker.on('failed', (job, error) => {
            this.#logger.warn(
                'Queue job attempt failed',
                {
                    attemptsMade: job?.attemptsMade,
                    error,
                    jobId: job?.id,
                    queue: worker.name,
                },
            );
        });

        worker.on('lockRenewalFailed', (jobIds) => {
            for (const id of jobIds) worker.cancelJob(id, 'Queue lock renewal failed');
            this.#logger.warn(
                'Worker lock renewal failed',
                {
                    jobIds,
                    queue: worker.name,
                },
            );
        });

        this.#workers.push({
            async close() {
                closing = true;
                // Before run() there are no processors; normal shutdown always drains.
                await worker.close(!runPromise);
                await runPromise;
                return !closeFailed;
            },
            ready: () => worker.waitUntilReady(),
            run: () => {
                runPromise = worker.run().then(
                    () => {
                        if (!closing) {
                            closeFailed = true;
                            this.#logger.error(
                                'Worker stopped unexpectedly',
                                { queue: worker.name },
                            );

                            throw new Error(`Worker stopped unexpectedly: ${worker.name}`);
                        }
                    },
                    (error) => {
                        if (!closing) {
                            closeFailed = true;
                            this.#logger.error(
                                'Worker run failed',
                                {
                                    error,
                                    queue: worker.name,
                                },
                            );

                            throw new Error(`Worker run failed: ${worker.name}`, { cause: error });
                        }

                        closeFailed = true;
                    },
                );
            },
        });

        return worker;
    }

    close() {
        return this.#closePromise ??= (async () => {
            const results = await Promise.allSettled(this.#workers.map((worker) => worker.close()));
            this.#workers.length = 0;
            for (const result of results) {
                if (result.status === 'rejected') this.#logger.error('Worker cleanup failed', result.reason);
            }

            return results.every((result) => result.status === 'fulfilled' && result.value);
        })();
    }

    async start(lifecycleCancellationSignal: AbortSignal) {
        const cancelLifecycleReadiness = () => this.close();
        lifecycleCancellationSignal.addEventListener('abort', cancelLifecycleReadiness, { once: true });
        try {
            lifecycleCancellationSignal.throwIfAborted();
            await Promise.all(this.#workers.map((worker) => worker.ready()));
            lifecycleCancellationSignal.throwIfAborted();
            for (const worker of this.#workers) worker.run();
        } finally {
            lifecycleCancellationSignal.removeEventListener('abort', cancelLifecycleReadiness);
            await this.#closePromise;
        }
    }
}
