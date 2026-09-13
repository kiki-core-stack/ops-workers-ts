import { projectRedisKeyPrefix } from '@kcs-project/pack/constants';
import { EmailSendRecordStatus } from '@kcs-project/pack/constants/email';
import { redisClient } from '@kcs-project/pack/constants/redis';
import type {
    EmailSendRecord,
    EmailSendRecordDocument,
} from '@kcs-project/pack/models/email/send-record';
import { EmailSendRecordModel } from '@kcs-project/pack/models/email/send-record';
import { subMinutes } from 'date-fns';
import type { GetLeanResultType } from 'mongoose';

import { BaseServiceLifecycle } from '@/service/base-lifecycle';

import { emailSendJobQueue } from './send-job/queue';

type LeanedEmailSendRecord = GetLeanResultType<EmailSendRecord, EmailSendRecordDocument, 'findOne'>;

export class EmailSendRecordReconciler extends BaseServiceLifecycle {
    #reconciliationCronJob?: Bun.CronJob;
    #reconciliationPromise?: Promise<void>;

    constructor() {
        super('[module: email-send-record-reconciler]');
    }

    // Private methods
    async #markSendRecordDeliveryUnknown(sendRecord: LeanedEmailSendRecord, reason: string) {
        if (!sendRecord.attemptId) {
            this.logger.warn(
                'Cannot reconcile email send record without attempt ID',
                { recordId: sendRecord._id },
            );

            return;
        }

        await EmailSendRecordModel.assertUpdateSuccess(
            {
                _id: sendRecord._id,
                attemptId: sendRecord.attemptId,
                status: EmailSendRecordStatus.Processing,
            },
            {
                $set: {
                    failureReason: reason,
                    status: EmailSendRecordStatus.DeliveryUnknown,
                },
                $unset: { attemptId: true },
            },
        );
    }

    async #reconcileSendRecord(sendRecord: LeanedEmailSendRecord) {
        this.lifecycleCancellationSignal.throwIfAborted();

        const sendRecordId = sendRecord._id.toString();
        const job = await emailSendJobQueue.getJob(sendRecordId);
        if (!job) {
            // A removed job does not prove whether the provider was called,
            // so re-enqueuing could duplicate the email.
            await this.#markSendRecordDeliveryUnknown(sendRecord, 'Email send job is no longer available');
            return;
        }

        const jobState = await job.getState();
        switch (jobState) {
            case 'active':
            case 'delayed':
            case 'prioritized':
            case 'waiting':
            case 'waiting-children':
                return;
            case 'completed':
                await this.#markSendRecordDeliveryUnknown(
                    sendRecord,
                    'Email send job completed without a confirmed record result',
                );

                return;
            case 'failed':
            default:
                // A failed/stalled queue job does not prove that the provider was never reached.
                await this.#markSendRecordDeliveryUnknown(
                    sendRecord,
                    'Email send job ended without a confirmed delivery result',
                );
        }
    }

    async #reconcileBatch() {
        this.lifecycleCancellationSignal.throwIfAborted();

        const lockResult = await redisClient.set(
            `${projectRedisKeyPrefix}:email:sendJob:reconciler:lock`,
            '1',
            'EX',
            '120',
            'NX',
        );

        if (lockResult !== 'OK') return;

        const sendRecords = await EmailSendRecordModel
            .find({
                status: EmailSendRecordStatus.Processing,
                updatedAt: { $lt: subMinutes(new Date(), 5) },
            })
            .select([
                '_id',
                'attemptId',
            ])
            .sort({
                /* eslint-disable perfectionist/sort-objects */
                updatedAt: 1,
                _id: 1,
                /* eslint-enable perfectionist/sort-objects */
            })
            .limit(100)
            .lean();

        for (const sendRecord of sendRecords) {
            try {
                await this.#reconcileSendRecord(sendRecord);
            } catch (error) {
                if (this.lifecycleCancellationSignal.aborted) throw error;
                this.logger.error(
                    'Email send record reconciliation failed',
                    {
                        error,
                        recordId: sendRecord._id,
                    },
                );
            }
        }
    }

    #scheduleReconciliation() {
        if (this.#reconciliationPromise) return;
        this.#reconciliationPromise = this.#reconcileBatch()
            .catch((error) => {
                if (!this.lifecycleCancellationSignal.aborted) {
                    this.logger.error('Email send record reconciliation failed', error);
                }
            })
            .finally(() => void (this.#reconciliationPromise = undefined));
    }

    // Protected methods
    protected async cleanupResources() {
        this.#reconciliationCronJob?.stop();
        this.#reconciliationCronJob = undefined;
        await this.#reconciliationPromise;
    }

    // Public methods
    start() {
        return this.executeStart(() => {
            this.#reconciliationCronJob = Bun.cron('* * * * *', () => this.#scheduleReconciliation());
        });
    }
}

export const emailSendRecordReconciler = new EmailSendRecordReconciler();
