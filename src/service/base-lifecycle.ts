import { delay } from '@kikiutils/shared/time';
import Mutex from 'p-mutex';
import type { Promisable } from 'type-fest';

import { PrefixedLogger } from '@/utils/logger/prefixed';

import { ServiceState } from './state';

type ResourceCleanup = () => Promisable<boolean | void>;

export abstract class BaseServiceLifecycle {
    readonly #lifecycleCancellationController = new AbortController();
    readonly #lifecycleCancellationPromiseResolvers = Promise.withResolvers<void>();
    #state = ServiceState.Stopped;

    protected readonly cleanupErrors: unknown[] = [];
    protected readonly lifecycleLock = new Mutex();

    readonly logger: PrefixedLogger;

    constructor(loggerPrefix: string) {
        this.logger = new PrefixedLogger(loggerPrefix);
    }

    // Private methods
    async #cleanupResources() {
        this.cleanupErrors.length = 0;
        await this.tryCleanup(() => this.cleanupResources());
        return !this.cleanupErrors.length;
    }

    // Protected getters
    protected get lifecycleCancellationSignal(): AbortSignal {
        return this.#lifecycleCancellationController.signal;
    }

    protected get lifecycleCancellationPromise(): Promise<void> {
        return this.#lifecycleCancellationPromiseResolvers.promise;
    }

    // Protected methods
    protected abstract cleanupResources(): Promisable<void>;

    protected delayWithLifecycleCancellation(ms: number) {
        return delay(ms, this.lifecycleCancellationSignal);
    }

    protected executeStart(task: () => Promisable<void>) {
        return this.lifecycleLock.withLock(async () => {
            if (this.#state === ServiceState.Running) return;
            if (this.#state === ServiceState.CleanupFailed) throw new Error('Cannot start after cleanup failed');
            this.#state = ServiceState.Starting;
            this.logger.info('Starting service');

            try {
                this.lifecycleCancellationSignal.throwIfAborted();
                await task();
                this.lifecycleCancellationSignal.throwIfAborted();
                this.#state = ServiceState.Running;
                this.logger.success('Service started');
            } catch (error) {
                this.cancelLifecycle();
                const cleanedUp = await this.#cleanupResources();
                this.#state = cleanedUp ? ServiceState.Stopped : ServiceState.CleanupFailed;
                if (!cleanedUp) this.logger.error('Startup rollback failed');
                throw error;
            }
        });
    }

    protected async tryCleanup(cleanup: ResourceCleanup) {
        try {
            if (await cleanup() === false) this.cleanupErrors.push(new Error('Resource cleanup returned false'));
        } catch (error) {
            this.cleanupErrors.push(error);
            this.logger.error('Resource cleanup failed', error);
        }
    }

    // Public getters
    get state() {
        return this.#state;
    }

    // Public methods
    cancelLifecycle() {
        this.#lifecycleCancellationController.abort(new Error('Service lifecycle cancelled'));
        this.#lifecycleCancellationPromiseResolvers.resolve();
    }

    abstract start(): Promisable<void>;

    stop() {
        this.cancelLifecycle();
        return this.lifecycleLock.withLock(async () => {
            if (this.#state === ServiceState.Stopped) return true;
            if (this.#state === ServiceState.CleanupFailed) return false;
            this.#state = ServiceState.Stopping;
            this.logger.info('Stopping service');

            const succeeded = await this.#cleanupResources();
            this.#state = succeeded ? ServiceState.Stopped : ServiceState.CleanupFailed;
            if (succeeded) this.logger.success('Service stopped');
            else this.logger.error('Service cleanup failed');
            return succeeded;
        });
    }
}
