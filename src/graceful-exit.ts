import { redisClient } from '@kcs-project/pack/connections/redis';
import { withTimeout } from 'es-toolkit/promise';
import mongoose from 'mongoose';

import { bullMqRedisConnection } from '@/constants/bullmq';
import { logger } from '@/libs/logger';
import type { MainModule } from '@/modules/main';

// Constants/Variables
let shutdownPromise: Promise<void> | undefined;

// Functions
export const isShuttingDown = () => !!shutdownPromise;

export function gracefulExit(mainModule?: MainModule) {
    return shutdownPromise ??= Promise
        .resolve()
        .then(async () => {
            const timeoutController = new AbortController();
            logger.info('Starting graceful shutdown...');

            try {
                await withTimeout(
                    async () => {
                        const errors: unknown[] = [];

                        if (mainModule) {
                            try {
                                if (!await mainModule.stop()) errors.push(new Error('Module cleanup failed'));
                            } catch (error) {
                                errors.push(error);
                            }
                        }

                        bullMqRedisConnection.disconnect();
                        redisClient.close();
                        await mongoose.disconnect().catch((error) => errors.push(error));

                        if (errors.length) throw new AggregateError(errors, 'Resource cleanup failed');
                    },
                    30 * 1000,
                    { signal: timeoutController.signal },
                );
            } finally {
                timeoutController.abort();
            }

            logger.success('Graceful shutdown completed');
        })
        .catch((error) => {
            logger.error('Graceful shutdown failed', error);
            process.exit(1);
        });
}
