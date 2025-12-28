import type { Server } from 'bun';

import { redisClient } from '@kiki-core-stack/pack/constants/redis';
import { mongooseConnections } from '@kikiutils/mongoose/constants';
import { logger } from '@kikiutils/shared/consola';

import {
    emailSendJobRestorer,
    emailSendJobWorkerManager,
} from '@/email';

let isGracefulExitStarted = false;

export async function gracefulExit(server?: Server<any>) {
    if (isGracefulExitStarted) return;
    isGracefulExitStarted = true;
    logger.info('Starting graceful shutdown...');
    await server?.stop();

    // Perform operations such as closing the database connection here.

    // Email
    await emailSendJobWorkerManager.stop();
    await emailSendJobRestorer.stop();

    redisClient.close();
    await mongooseConnections.default?.close();

    logger.success('Graceful shutdown completed');
    process.exit(0);
}
