import { redisClient } from '@kcs-project/pack/constants/redis';
import { mongooseConnections } from '@kikiutils/mongoose/constants';

import { bullMqRedisConnection } from '@/constants/bullmq';
import { mainModule } from '@/modules/main';
import * as logger from '@/utils/logger';

// Constants/Variables
let isGracefulExitStarted = false;

// Functions
export async function gracefulExit() {
    if (isGracefulExitStarted) return;
    isGracefulExitStarted = true;
    logger.info('Starting graceful shutdown...');

    const errors: unknown[] = [];

    if (!await mainModule.stop()) errors.push(new Error('Module cleanup failed'));

    bullMqRedisConnection.disconnect();
    redisClient.close();
    await mongooseConnections.default?.close().catch((error) => errors.push(error));

    if (!errors.length) logger.success('Graceful shutdown completed');
    else {
        process.exitCode = 1;
        logger.error('Graceful shutdown failed', new AggregateError(errors, 'Graceful shutdown failed'));
    }
}
