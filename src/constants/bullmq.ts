import { RedisClient } from 'bun';

import { createBunRedisClient } from 'bullmq';
import logger from 'consola';

const { REDIS_URL } = process.env;
export const bullMqRedisConnection = createBunRedisClient(
    new RedisClient(
        REDIS_URL || 'redis://127.0.0.1:6379',
        {
            enableOfflineQueue: false,
            maxRetries: 4294967295,
        },
    ),
    { lazyConnect: true },
);

bullMqRedisConnection.on('error', (error) => logger.error('BullMQ redis connection error:', error));
