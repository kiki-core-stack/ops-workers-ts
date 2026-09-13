import { Queue } from 'bullmq';

import { bullMqOptions } from '@/constants/bullmq';

import { emailModule } from '../';

import type { EmailSendJobData } from './types';

// Constants/Variables
export const emailSendJobQueueName = 'emailSendJob';
export const emailSendJobQueue = new Queue<EmailSendJobData, void, typeof emailSendJobQueueName>(
    emailSendJobQueueName,
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
        ...bullMqOptions,
    },
);

emailSendJobQueue.on('error', (error) => emailModule.logger.error('send job queue error:', error));
