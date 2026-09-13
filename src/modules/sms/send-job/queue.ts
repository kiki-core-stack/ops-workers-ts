import { Queue } from 'bullmq';

import { createBullMqOptions } from '@/libs/bullmq';

import { smsModule } from '../';

import type { SmsSendJobData } from './types';

// Constants/Variables
export const smsSendJobQueueName = 'smsSendJob';
export const smsSendJobQueue = new Queue<SmsSendJobData, void, typeof smsSendJobQueueName>(
    smsSendJobQueueName,
    {
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                delay: 250,
                type: 'fixed',
            },
            removeOnComplete: {
                age: 60 * 60 * 24,
                count: 1000,
            },
            removeOnFail: {
                age: 60 * 60 * 24 * 7,
                count: 1000,
            },
        },
        ...createBullMqOptions(smsSendJobQueueName),
    },
);

smsSendJobQueue.on('error', (error) => smsModule.logger.error('send job queue error:', error));
