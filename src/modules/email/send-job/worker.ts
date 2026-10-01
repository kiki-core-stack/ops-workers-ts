import { EmailSendRecordStatus } from '@kcs-project/pack/constants/email';
import { JobType } from '@kcs-project/pack/constants/job';
import { safeParseJobPayload } from '@kcs-project/pack/libs/job';
import { EmailProviderModel } from '@kcs-project/pack/models/email/provider';
import type { EmailSendRecord } from '@kcs-project/pack/models/email/send-record';
import { EmailSendRecordModel } from '@kcs-project/pack/models/email/send-record';
import type { LeanedEmailProvider } from '@kcs-project/pack/providers/email';
import { getOrCreateEmailProviderInstance } from '@kcs-project/pack/providers/email';
import { EmailProviderError } from '@kcs-project/pack/providers/email/error';
import {
    UnrecoverableError,
    Worker,
} from 'bullmq';
import type { Job } from 'bullmq';
import type { UpdateQuery } from 'mongoose';
import { Types } from 'mongoose';
import { nanoid } from 'nanoid';

import { createBullMqOptions } from '@/libs/bullmq';
import { getErrorMessage } from '@/utils/error';
import type { PrefixedLogger } from '@/utils/logger/prefixed';

import { emailSendJobQueueName } from './queue';
import type { EmailSendJobData } from './types';

type EmailSendJob = Job<EmailSendJobData, void>;

export function createEmailSendJobBullMqWorker(logger: PrefixedLogger) {
    // Functions
    const hasRetryRemaining = (job: EmailSendJob) => job.attemptsMade + 1 < (job.opts.attempts ?? 1);

    async function processSendJob(job: EmailSendJob, signal?: AbortSignal) {
        const payloadParseResult = safeParseJobPayload(JobType.SendEmail, job.data);
        if (!payloadParseResult.success) {
            throw new UnrecoverableError(`Invalid email send job payload: ${payloadParseResult.error.message}`);
        }

        const attemptId = nanoid();
        const emailSendRecord = await EmailSendRecordModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(payloadParseResult.data.recordId),
                status: EmailSendRecordStatus.Pending,
            },
            {
                $set: {
                    attemptId,
                    status: EmailSendRecordStatus.Processing,
                },
            },
            { returnDocument: 'after' },
        );

        if (!emailSendRecord) return;
        // TODO: caches
        let emailProviders: LeanedEmailProvider[];
        try {
            emailProviders = await EmailProviderModel
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
            const status = hasRetryRemaining(job) ? EmailSendRecordStatus.Pending : EmailSendRecordStatus.Failed;
            await EmailSendRecordModel.assertUpdateSuccess(
                {
                    _id: emailSendRecord._id,
                    attemptId,
                    status: EmailSendRecordStatus.Processing,
                },
                {
                    $set: {
                        failureReason: getErrorMessage(error),
                        status,
                    },
                    $unset: { attemptId: true },
                },
            );

            if (status === EmailSendRecordStatus.Pending) throw error;
            return;
        }

        const $set: NonNullable<UpdateQuery<EmailSendRecord>['$set']> = { status: EmailSendRecordStatus.Failed };
        const $unset: NonNullable<UpdateQuery<EmailSendRecord>['$unset']> = { attemptId: true };
        let retryableError: Error | undefined;
        if (!emailProviders.length) $set.failureReason = '沒有可用的服務商';
        else {
            for (const emailProvider of emailProviders) {
                $set.provider = emailProvider._id;
                try {
                    const emailProviderInstance = getOrCreateEmailProviderInstance(emailProvider);
                    const sendResult = await emailProviderInstance.sendEmail(emailSendRecord, signal);
                    $set.providerTransactionId = sendResult.transactionId;
                    $set.status = EmailSendRecordStatus.Succeeded;
                    $unset.failureReason = true;
                    break;
                } catch (error) {
                    $set.failureReason = getErrorMessage(error);
                    if (!(error instanceof EmailProviderError) || error.outcome === 'unknown') {
                        $set.status = EmailSendRecordStatus.DeliveryUnknown;
                        break;
                    }

                    if (error.retryable) retryableError ??= error;
                }
            }

            if ($set.status === EmailSendRecordStatus.Failed && retryableError && hasRetryRemaining(job)) {
                $set.status = EmailSendRecordStatus.Pending;
            }
        }

        await EmailSendRecordModel.assertUpdateSuccess(
            {
                _id: emailSendRecord._id,
                attemptId,
                status: EmailSendRecordStatus.Processing,
            },
            {
                $set,
                $unset,
            },
        );

        if ($set.status === EmailSendRecordStatus.Failed) {
            logger.error(
                'Email send job failed',
                {
                    error: $set.failureReason,
                    recordId: emailSendRecord._id,
                },
            );
        } else if ($set.status === EmailSendRecordStatus.DeliveryUnknown) {
            logger.warn(
                'Email send delivery is unknown',
                {
                    error: $set.failureReason,
                    recordId: emailSendRecord._id,
                },
            );
        }

        if ($set.status === EmailSendRecordStatus.Pending) throw retryableError;
    }

    return new Worker<EmailSendJobData, void>(
        emailSendJobQueueName,
        (job, _token, signal) => processSendJob(job, signal),
        {
            autorun: false,
            concurrency: Math.abs(Number(process.env.EMAIL_SEND_JOB_WORKER_CONCURRENCY)) || 4,
            maxStalledCount: 1,
            ...createBullMqOptions(emailSendJobQueueName),
        },
    );
}
