import type { RedisClient } from 'bun';

import { EmailSendRecordStatus } from '@kcs-project/pack/constants/email';
import { redisClient as globalRedisClient } from '@kcs-project/pack/constants/redis';
import { EmailProviderModel } from '@kcs-project/pack/models/email/provider';
import { EmailSendRecordModel } from '@kcs-project/pack/models/email/send-record';
import type { EmailSendRecordDocument } from '@kcs-project/pack/models/email/send-record';
import { Types } from 'mongoose';
import type { UpdateQuery } from 'mongoose';

import { BaseServiceLifecycle } from '@/base-service-lifecycle';

import { createEmailProviderInstance } from './providers';

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
            { returnDocument: 'after' },
        );

        if (!emailSendRecord) return;

        const emailProviders = await EmailProviderModel
            .find({ enabled: true })
            .sort({ priority: -1 })
            .select([
                'config',
                'configHash',
                'providerCode',
            ])
            .lean();

        const updateQuery: UpdateQuery<EmailSendRecordDocument> = { status: EmailSendRecordStatus.Failed };
        if (!emailProviders.length) updateQuery.failureReason = '沒有可用的服務商';
        else {
            for (const emailProvider of emailProviders) {
                try {
                    const emailProviderInstance = createEmailProviderInstance(emailProvider);
                    updateQuery.provider = emailProvider;
                    const sendResult = await emailProviderInstance.sendEmail(emailSendRecord);
                    updateQuery.providerTransactionId = sendResult.transactionId;
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
                    this.logger.error(error);
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
