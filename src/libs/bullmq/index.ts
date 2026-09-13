import { projectRedisKeyPrefix } from '@kcs-project/pack/constants';

import { bullMqRedisConnection } from '@/constants/bullmq';

export function createBullMqOptions(queueName: string) {
    return {
        connection: bullMqRedisConnection,
        prefix: `${projectRedisKeyPrefix}:bull:{${queueName}}`,
    } as const;
}
