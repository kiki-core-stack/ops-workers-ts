import { projectRedisKeyPrefix } from '@kcs-project/pack/constants';
import { redisClient } from '@kcs-project/pack/constants/redis';
import { SmsSendRecordStatus } from '@kcs-project/pack/constants/sms';
import type {
    SmsSendRecord,
    SmsSendRecordDocument,
} from '@kcs-project/pack/models/sms/send-record';
import { SmsSendRecordModel } from '@kcs-project/pack/models/sms/send-record';
import { subMinutes } from 'date-fns';
import type { GetLeanResultType } from 'mongoose';

import { BaseServiceLifecycle } from '@/service/base-lifecycle';

import { smsSendJobQueue } from './send-job/queue';

type LeanedSmsSendRecord = GetLeanResultType<SmsSendRecord, SmsSendRecordDocument, 'findOne'>;

export class SmsSendRecordReconciler extends BaseServiceLifecycle {
    #reconciliationCronJob?: Bun.CronJob;
    #reconciliationPromise?: Promise<void>;

    constructor() {
        super('[module: sms-send-record-reconciler]');
    }

    // Private methods
    async #markSendRecordDeliveryUnknown(sendRecord: LeanedSmsSendRecord, reason: string) {
        if (!sendRecord.attemptId) {
            this.logger.warn(
                'Cannot reconcile sms send record without attempt ID',
                { recordId: sendRecord._id },
            );

            return;
        }

        await SmsSendRecordModel.assertUpdateSuccess(
            {
                _id: sendRecord._id,
                attemptId: sendRecord.attemptId,
                status: SmsSendRecordStatus.Processing,
            },
            {
                $set: {
                    failureReason: reason,
                    status: SmsSendRecordStatus.DeliveryUnknown,
                },
                $unset: { attemptId: true },
            },
        );
    }

    async #reconcileSendRecord(sendRecord: LeanedSmsSendRecord) {
        this.lifecycleCancellationSignal.throwIfAborted();

        const sendRecordId = sendRecord._id.toString();
        const job = await smsSendJobQueue.getJob(sendRecordId);
        if (!job) {
            // A removed job does not prove whether the provider was called,
            // so re-enqueuing could duplicate the SMS.
            await this.#markSendRecordDeliveryUnknown(sendRecord, 'Sms send job is no longer available');
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
                    'Sms send job completed without a confirmed record result',
                );

                return;
            case 'failed':
            default:
                // A failed/stalled queue job does not prove that the provider was never reached.
                await this.#markSendRecordDeliveryUnknown(
                    sendRecord,
                    'Sms send job ended without a confirmed delivery result',
                );
        }
    }

    async #reconcileBatch() {
        this.lifecycleCancellationSignal.throwIfAborted();

        const lockResult = await redisClient.set(
            `${projectRedisKeyPrefix}:sms:sendJob:reconciler:lock`,
            '1',
            'EX',
            '120',
            'NX',
        );

        if (lockResult !== 'OK') return;

        const sendRecords = await SmsSendRecordModel
            .find({
                status: SmsSendRecordStatus.Processing,
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
                    'Sms send record reconciliation failed',
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
                    this.logger.error('Sms send record reconciliation failed', error);
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

export const smsSendRecordReconciler = new SmsSendRecordReconciler();
