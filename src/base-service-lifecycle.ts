import { consola as logger } from 'consola';
import Mutex from 'p-mutex';
import type { Promisable } from 'type-fest';

export class BaseServiceLifecycle {
    // Protected properties
    protected readonly logger = logger;
    protected readonly loggerPrefix;
    protected readonly operateLock = new Mutex();
    protected status: 'running' | 'stopped' | 'stopping' = 'stopped';

    constructor(loggerPrefix: string) {
        this.loggerPrefix = loggerPrefix;
    }

    // Protected methods
    protected async start(callback: () => Promisable<any>) {
        await this.operateLock.withLock(async () => {
            switch (this.status) {
                case 'running': return;
                case 'stopped':
                    this.status = 'running';
                    break;
                default: throw new Error('unreachable');
            }

            logger.info(`${this.loggerPrefix} Starting...`);
            await callback();
            logger.success(`${this.loggerPrefix} Started`);
        });
    }

    protected async stop(callback: () => Promisable<any>) {
        await this.operateLock.withLock(async () => {
            switch (this.status) {
                case 'running':
                    this.status = 'stopping';
                    break;
                case 'stopped': return;
                default: throw new Error('unreachable');
            }

            logger.info(`${this.loggerPrefix} Stopping...`);
            await callback();
            logger.success(`${this.loggerPrefix} Stopped`);
        });
    }
}
