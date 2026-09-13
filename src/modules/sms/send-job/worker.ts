import { SmsSendRecordStatus } from '@kcs-project/pack/constants/sms';
import { SmsProviderModel } from '@kcs-project/pack/models/sms/provider';
import type { SmsSendRecord } from '@kcs-project/pack/models/sms/send-record';
import { SmsSendRecordModel } from '@kcs-project/pack/models/sms/send-record';
import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { UpdateQuery } from 'mongoose';
import { Types } from 'mongoose';
import { nanoid } from 'nanoid';

import { bullMqOptions } from '@/constants/bullmq';
import { getErrorMessage } from '@/utils/error';
import type { PrefixedLogger } from '@/utils/logger/prefixed';

import { getOrCreateSmsProviderInstance } from '../providers';
import type { LeanedSmsProvider } from '../providers';
import { SmsProviderError } from '../providers/error';

import { smsSendJobQueueName } from './queue';
import type { SmsSendJobData } from './types';

type SmsSendJob = Job<SmsSendJobData, void>;

export function createSmsSendJobBullMqWorker(logger: PrefixedLogger) {
    // Functions
    const hasRetryRemaining = (job: SmsSendJob) => job.attemptsMade + 1 < (job.opts.attempts ?? 1);

    async function processSendJob(job: SmsSendJob, signal?: AbortSignal) {
        const attemptId = nanoid();
        const smsSendRecord = await SmsSendRecordModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(job.data.recordId),
                status: SmsSendRecordStatus.Pending,
            },
            {
                $set: {
                    attemptId,
                    status: SmsSendRecordStatus.Processing,
                },
            },
            { returnDocument: 'after' },
        );

        if (!smsSendRecord) return;
        // TODO: caches
        let smsProviders: LeanedSmsProvider[];
        try {
            smsProviders = await SmsProviderModel
                .find({ enabled: true })
                .sort({ priority: -1 })
                .select([
                    'apiProxyUrl',
                    'cacheKey',
                    'code',
                    'config',
                ])
                .lean();
        } catch (error) {
            const status = hasRetryRemaining(job) ? SmsSendRecordStatus.Pending : SmsSendRecordStatus.Failed;
            await SmsSendRecordModel.assertUpdateSuccess(
                {
                    _id: smsSendRecord._id,
                    attemptId,
                    status: SmsSendRecordStatus.Processing,
                },
                {
                    $set: {
                        failureReason: getErrorMessage(error),
                        status,
                    },
                    $unset: { attemptId: true },
                },
            );

            if (status === SmsSendRecordStatus.Pending) throw error;
            return;
        }

        const $set: NonNullable<UpdateQuery<SmsSendRecord>['$set']> = { status: SmsSendRecordStatus.Failed };
        const $unset: NonNullable<UpdateQuery<SmsSendRecord>['$unset']> = { attemptId: true };
        let retryableError: Error | undefined;
        if (!smsProviders.length) $set.failureReason = '沒有可用的服務商';
        else {
            for (const smsProvider of smsProviders) {
                $set.provider = smsProvider._id;
                try {
                    const smsProviderInstance = getOrCreateSmsProviderInstance(smsProvider);
                    const sendResult = await smsProviderInstance.sendSms(smsSendRecord, signal);
                    $set.providerTransactionId = sendResult.transactionId;
                    $set.status = SmsSendRecordStatus.Succeeded;
                    $unset.failureReason = true;
                    break;
                } catch (error) {
                    $set.failureReason = getErrorMessage(error);
                    if (!(error instanceof SmsProviderError) || error.outcome === 'unknown') {
                        $set.status = SmsSendRecordStatus.DeliveryUnknown;
                        break;
                    }

                    if (error.retryable) retryableError ??= error;
                }
            }

            if ($set.status === SmsSendRecordStatus.Failed && retryableError && hasRetryRemaining(job)) {
                $set.status = SmsSendRecordStatus.Pending;
            }
        }

        await SmsSendRecordModel.assertUpdateSuccess(
            {
                _id: smsSendRecord._id,
                attemptId,
                status: SmsSendRecordStatus.Processing,
            },
            {
                $set,
                $unset,
            },
        );

        if ($set.status === SmsSendRecordStatus.Failed) {
            logger.error(
                'Sms send job failed',
                {
                    error: $set.failureReason,
                    recordId: smsSendRecord._id,
                },
            );
        } else if ($set.status === SmsSendRecordStatus.DeliveryUnknown) {
            logger.warn(
                'Sms send delivery is unknown',
                {
                    error: $set.failureReason,
                    recordId: smsSendRecord._id,
                },
            );
        }

        if ($set.status === SmsSendRecordStatus.Pending) throw retryableError;
    }

    return new Worker<SmsSendJobData, void>(
        smsSendJobQueueName,
        (job, _token, signal) => processSendJob(job, signal),
        {
            autorun: false,
            concurrency: Math.abs(Number(process.env.SMS_SEND_JOB_WORKER_CONCURRENCY)) || 4,
            maxStalledCount: 1,
            ...bullMqOptions,
        },
    );
}
