import type { RedisClient } from 'bun';

import { EmailSendRecordStatus } from '@kiki-core-stack/pack/constants/email';
import { redisClient as globalRedisClient } from '@kiki-core-stack/pack/constants/redis';
import { EmailPlatformModel } from '@kiki-core-stack/pack/models/email/platform';
import { EmailSendRecordModel } from '@kiki-core-stack/pack/models/email/send-record';
import type { EmailSendRecordDocument } from '@kiki-core-stack/pack/models/email/send-record';
import { Types } from 'mongoose';
import type { UpdateQuery } from 'mongoose';

import { BaseServiceLifecycle } from '@/base-service-lifecycle';

import { createEmailServiceProviderInstance } from './service-providers';

export class EmailSendJobWorkerManager extends BaseServiceLifecycle {
    // Private properties
    readonly #concurrency = Math.abs(Number(process.env.EMAIL_SEND_JOB_WORKER_CONCURRENCY)) || 4;
    readonly #workers: { promise: Promise<void>; redisClient: RedisClient }[] = [];

    constructor() {
        super('[EmailSendJobWorkerManager]');
    }

    // Private methods
    async #processJob(emailSendRecordId: string) {
        if (!Types.ObjectId.isValid(emailSendRecordId)) return;
        const emailSendRecord = await EmailSendRecordModel.findOneAndUpdate(
            {
                _id: emailSendRecordId,
                status: EmailSendRecordStatus.Pending,
            },
            { status: EmailSendRecordStatus.Processing },
            { new: true },
        );

        if (!emailSendRecord) return;

        const emailPlatforms = await EmailPlatformModel
            .find({ enabled: true })
            .sort({ priority: -1 })
            .select([
                'config',
                'configMd5',
                'serviceProvider',
            ]);

        const updateQuery: UpdateQuery<EmailSendRecordDocument> = { status: EmailSendRecordStatus.Failed };
        if (!emailPlatforms.length) updateQuery.failureReason = '沒有可用的平台';
        else {
            for (const emailPlatform of emailPlatforms) {
                try {
                    const emailServiceProviderInstance = createEmailServiceProviderInstance(emailPlatform);
                    updateQuery.platform = emailPlatform;
                    const sendResult = await emailServiceProviderInstance.sendEmail(emailSendRecord);
                    updateQuery.serviceProviderTransactionId = sendResult.transactionId;
                    updateQuery.status = EmailSendRecordStatus.Success;
                    break;
                } catch (error) {
                    updateQuery.failureReason = (error as Error).message;
                }
            }
        }

        await emailSendRecord.assertUpdateSuccess(updateQuery);
    }

    async #runLoop(redisClient: RedisClient) {
        while (this.status === 'running') {
            let emailSendRecordId: string | undefined;
            try {
                const response = await redisClient.brpop('email:send:queue', 0);
                if (!response) continue;
                emailSendRecordId = response[1];
                await this.#processJob(emailSendRecordId);
            } catch (error) {
                if (!(error as Error).message.includes('Connection closed')) {
                    this.logger.error(this.loggerPrefix, error);
                }

                if (emailSendRecordId) await globalRedisClient.lpush('email:send:queue', emailSendRecordId);
            }
        }
    }

    // Public methods
    override start() {
        return super.start(async () => {
            for (let i = 0; i < this.#concurrency; i++) {
                const redisClient = await globalRedisClient.duplicate();
                this.#workers.push({
                    promise: this.#runLoop(redisClient),
                    redisClient,
                });
            }
        });
    }

    override stop() {
        return super.stop(async () => {
            this.#workers.forEach((worker) => worker.redisClient.close());
            await Promise.allSettled(this.#workers.map((worker) => worker.promise));
        });
    }
}
