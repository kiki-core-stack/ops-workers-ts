import consola from 'consola';
import Mutex from 'p-mutex';
import type { Promisable } from 'type-fest';

export class BaseServiceLifecycle {
    // Protected properties
    protected readonly logger: {
        error: (...args: any[]) => void;
        info: (...args: any[]) => void;
        success: (...args: any[]) => void;
        warn: (...args: any[]) => void;
    };

    protected readonly operateLock = new Mutex();
    protected status: 'running' | 'stopped' | 'stopping' = 'stopped';

    constructor(loggerPrefix: string) {
        this.logger = {
            error: (...args: any[]) => consola.error(loggerPrefix, ...args),
            info: (...args: any[]) => consola.info(loggerPrefix, ...args),
            success: (...args: any[]) => consola.success(loggerPrefix, ...args),
            warn: (...args: any[]) => consola.warn(loggerPrefix, ...args),
        };
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

            this.logger.info(`Starting...`);
            try {
                await callback();
                this.logger.success(`Started`);
            } catch (error) {
                this.logger.error(`Failed to start: `, error);
            }
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

            this.logger.info('Stopping...');
            try {
                await callback();
                this.logger.success('Stopped');
            } catch (error) {
                this.logger.error(`Failed to stop: `, error);
            } finally {
                this.status = 'stopped';
            }
        });
    }
}
