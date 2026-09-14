import { EmailSendRecordStatus } from '@kcs-project/pack/constants/email';
import { JobType } from '@kcs-project/pack/constants/job';
import { SmsSendRecordStatus } from '@kcs-project/pack/constants/sms';
import { EmailSendRecordModel } from '@kcs-project/pack/models/email/send-record';
import { JobOutboxEventModel } from '@kcs-project/pack/models/job/outbox-event';
import type {
    JobOutboxEvent,
    JobOutboxEventDocument,
} from '@kcs-project/pack/models/job/outbox-event';
import { SmsSendRecordModel } from '@kcs-project/pack/models/sms/send-record';
import { mongooseConnections } from '@kikiutils/mongoose/constants';
import { addSeconds } from 'date-fns';
import type {
    ClientSession,
    GetLeanResultType,
    mongo,
} from 'mongoose';
import { Types } from 'mongoose';
import { nanoid } from 'nanoid';

import { BaseServiceLifecycle } from '@/service/base-lifecycle';
import { getErrorMessage } from '@/utils/error';

import {
    emailSendJobQueue,
    emailSendJobQueueName,
} from './email/send-job/queue';
import type { EmailSendJobData } from './email/send-job/types';
import {
    smsSendJobQueue,
    smsSendJobQueueName,
} from './sms/send-job/queue';
import type { SmsSendJobData } from './sms/send-job/types';

type LeanedJobOutboxEvent = GetLeanResultType<JobOutboxEvent, JobOutboxEventDocument, 'findOne'>;

class JobOutboxEventPublisherModule extends BaseServiceLifecycle {
    #jobOutboxEventDbChangeStream?: mongo.ChangeStream<JobOutboxEventDocument>;
    #publishLoopPromise?: Promise<void>;
    #wakePublishOutboxEventLoopResolver?: () => void;

    constructor() {
        super('[module: job-outbox-event-publisher]');
    }

    // Private methods
    async #claimNextOutboxEvent() {
        const now = new Date();
        const publishLeaseUntil = addSeconds(now, 30);
        return await JobOutboxEventModel
            .findOneAndUpdate(
                {
                    $or: [
                        { publishLeaseUntil: { $exists: false } },
                        { publishLeaseUntil: { $lte: now } },
                    ],
                    nextPublishAt: { $lte: now },
                },
                {
                    $inc: { publishAttempts: 1 },
                    $set: {
                        publishClaimId: nanoid(),
                        publishLeaseUntil,
                    },
                },
                { returnDocument: 'after' },
            )
            .sort({
                /* eslint-disable perfectionist/sort-objects */
                nextPublishAt: 1,
                _id: 1,
                /* eslint-enable perfectionist/sort-objects */
            })
            .lean();
    }

    async #deletePublishedOutboxEvent(outboxEvent: LeanedJobOutboxEvent) {
        const deleteResult = await JobOutboxEventModel.deleteOne({
            _id: outboxEvent._id,
            publishClaimId: outboxEvent.publishClaimId,
        });

        if (!deleteResult.deletedCount) {
            this.logger.warn('Job outbox event was not deleted after publishing', { eventId: outboxEvent._id });
        }
    }

    async #handlePublishOutboxEventFailure(outboxEvent: LeanedJobOutboxEvent, error: unknown) {
        if (outboxEvent.publishAttempts >= 10) {
            await this.#finalizeOutboxEventFailure(outboxEvent, error);
            return;
        }

        const nextPublishAt = addSeconds(new Date(), 5);
        try {
            const updateResult = await JobOutboxEventModel.updateOne(
                {
                    _id: outboxEvent._id,
                    publishClaimId: outboxEvent.publishClaimId,
                },
                {
                    $set: { nextPublishAt },
                    $unset: {
                        publishClaimId: 1,
                        publishLeaseUntil: 1,
                    },
                },
            );

            if (!updateResult.matchedCount) {
                this.logger.warn(
                    'Job outbox event was not rescheduled because its claim changed',
                    { eventId: outboxEvent._id },
                );
            }
        } catch (retryError) {
            // If this update fails, the existing lease will expire and repair will retry it.
            this.logger.error(
                'Failed to reschedule job outbox event after publish failure',
                {
                    error: retryError,
                    eventId: outboxEvent._id,
                    publishError: error,
                },
            );
        }
    }

    async #finalizeOutboxEventFailure(outboxEvent: LeanedJobOutboxEvent, error: unknown) {
        this.logger.error(
            'Job outbox event publish failed',
            {
                error,
                eventId: outboxEvent._id,
                publishAttempts: outboxEvent.publishAttempts,
                type: outboxEvent.type,
            },
        );

        const finalized = await mongooseConnections.default!.transaction(async (session) => {
            const deleteResult = await JobOutboxEventModel.deleteOne(
                {
                    _id: outboxEvent._id,
                    publishClaimId: outboxEvent.publishClaimId,
                },
                { session },
            );

            if (!deleteResult.deletedCount) return false;

            await this.#finalizeOutboxEventTarget(outboxEvent, getErrorMessage(error), session);
            return true;
        });

        if (finalized) {
            this.logger.warn('Job outbox event and related send record finalized', { eventId: outboxEvent._id });
        } else {
            this.logger.warn(
                'Job outbox event was not finalized because its claim changed',
                { eventId: outboxEvent._id },
            );
        }
    }

    async #finalizeOutboxEventTarget(outboxEvent: LeanedJobOutboxEvent, failureReason: string, session: ClientSession) {
        switch (outboxEvent.type) {
            case JobType.SendEmail: {
                const recordId = new Types.ObjectId(outboxEvent.payload.recordId);
                const pendingUpdateResult = await EmailSendRecordModel.updateOne(
                    {
                        _id: new Types.ObjectId(recordId),
                        status: EmailSendRecordStatus.Pending,
                    },
                    {
                        $set: {
                            failureReason,
                            status: EmailSendRecordStatus.Failed,
                        },
                        $unset: { attemptId: 1 },
                    },
                    { session },
                );

                if (pendingUpdateResult.matchedCount) return;

                const processingUpdateResult = await EmailSendRecordModel.updateOne(
                    {
                        _id: recordId,
                        status: EmailSendRecordStatus.Processing,
                    },
                    {
                        $set: {
                            failureReason,
                            status: EmailSendRecordStatus.DeliveryUnknown,
                        },
                        $unset: { attemptId: 1 },
                    },
                    { session },
                );

                if (!processingUpdateResult.matchedCount) {
                    this.logger.warn(
                        'Related email send record was already finalized or not found',
                        {
                            eventId: outboxEvent._id,
                            recordId,
                        },
                    );
                }

                return;
            }
            case JobType.SendSms: {
                const recordId = new Types.ObjectId(outboxEvent.payload.recordId);
                const pendingUpdateResult = await SmsSendRecordModel.updateOne(
                    {
                        _id: recordId,
                        status: SmsSendRecordStatus.Pending,
                    },
                    {
                        $set: {
                            failureReason,
                            status: SmsSendRecordStatus.Failed,
                        },
                        $unset: { attemptId: 1 },
                    },
                    { session },
                );

                if (pendingUpdateResult.matchedCount) return;

                const processingUpdateResult = await SmsSendRecordModel.updateOne(
                    {
                        _id: recordId,
                        status: SmsSendRecordStatus.Processing,
                    },
                    {
                        $set: {
                            failureReason,
                            status: SmsSendRecordStatus.DeliveryUnknown,
                        },
                        $unset: { attemptId: 1 },
                    },
                    { session },
                );

                if (!processingUpdateResult.matchedCount) {
                    this.logger.warn(
                        'Related SMS send record was already finalized or not found',
                        {
                            eventId: outboxEvent._id,
                            recordId,
                        },
                    );
                }

                return;
            }
            default:
                this.logger.warn(
                    'Unsupported job outbox event type has no outbox event target handler',
                    {
                        eventId: outboxEvent._id,
                        type: outboxEvent.type,
                    },
                );
        }
    }

    async #processOutboxEvent(outboxEvent: LeanedJobOutboxEvent) {
        try {
            if (!await this.#publishOutboxEvent(outboxEvent)) return;
            await this.#deletePublishedOutboxEvent(outboxEvent);
        } catch (error) {
            this.logger.error('process outbox event error:', error);
            if (!this.lifecycleCancellationSignal.aborted) {
                await this.#handlePublishOutboxEventFailure(outboxEvent, error);
            }
        }
    }

    async #publishOutboxEvent(outboxEvent: LeanedJobOutboxEvent) {
        this.lifecycleCancellationSignal.throwIfAborted();

        switch (outboxEvent.type) {
            case JobType.SendEmail: {
                const emailSendJobData = outboxEvent.payload as EmailSendJobData;
                await emailSendJobQueue.add(
                    emailSendJobQueueName,
                    emailSendJobData,
                    { jobId: emailSendJobData.recordId },
                );

                return true;
            }
            case JobType.SendSms: {
                const smsSendJobData = outboxEvent.payload as SmsSendJobData;
                await smsSendJobQueue.add(smsSendJobQueueName, smsSendJobData, { jobId: smsSendJobData.recordId });
                return true;
            }
            default:
                await this.#finalizeOutboxEventFailure(
                    outboxEvent,
                    new Error(`Unsupported job outbox event type: ${outboxEvent.type}`),
                );

                return false;
        }
    }

    async #runPublishOutboxEventLoop() {
        while (!this.lifecycleCancellationSignal.aborted) {
            try {
                const claimedOutboxEvent = await this.#claimNextOutboxEvent();
                if (!claimedOutboxEvent) {
                    await this.#waitForPublishOutboxEventLoopWakeup();
                    continue;
                }

                await this.#processOutboxEvent(claimedOutboxEvent);
            } catch (error) {
                if (this.lifecycleCancellationSignal.aborted) break;
                this.logger.error('Job outbox publisher loop error', error);
                await this.delayWithLifecycleCancellation(1000);
            }
        }
    }

    #wakePublishOutboxEventLoop() {
        this.#wakePublishOutboxEventLoopResolver?.();
    }

    #waitForPublishOutboxEventLoopWakeup() {
        const signal = this.lifecycleCancellationSignal;
        signal.throwIfAborted();
        const promiseResolvers = Promise.withResolvers<void>();
        let timer: ReturnType<typeof setTimeout>;

        const finish = (settle: () => void) => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            if (this.#wakePublishOutboxEventLoopResolver === wake) {
                this.#wakePublishOutboxEventLoopResolver = undefined;
            }

            settle();
        };

        function onAbort() {
            finish(() => promiseResolvers.reject(signal.reason));
        }

        function wake() {
            finish(promiseResolvers.resolve);
        }

        this.#wakePublishOutboxEventLoopResolver = wake;
        timer = setTimeout(wake, 60 * 1000);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();

        return promiseResolvers.promise;
    }

    // Protected methods
    protected async cleanupResources() {
        await this.tryCleanup(() => this.#publishLoopPromise);
        this.#publishLoopPromise = undefined;

        await this.tryCleanup(() => this.#jobOutboxEventDbChangeStream?.close());
        this.#jobOutboxEventDbChangeStream = undefined;
    }

    // Public methods
    start() {
        return this.executeStart(() => {
            // Create change stream
            this.#jobOutboxEventDbChangeStream = JobOutboxEventModel.watch([{ $match: { operationType: 'insert' } }]);
            this.#jobOutboxEventDbChangeStream.on('change', () => this.#wakePublishOutboxEventLoop());
            this.#jobOutboxEventDbChangeStream.on('error', (error) => {
                this.logger.error('Job outbox change stream error', error);
                this.#wakePublishOutboxEventLoop();
            });

            // Run loop
            this.#publishLoopPromise = this.#runPublishOutboxEventLoop();
        });
    }
}

export const jobOutboxEventPublisherModule = new JobOutboxEventPublisherModule();
