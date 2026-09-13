import {
    JobOutboxEventStatus,
    JobType,
} from '@kcs-project/pack/constants/job';
import { JobOutboxEventModel } from '@kcs-project/pack/models/job/outbox-event';
import type {
    JobOutboxEvent,
    JobOutboxEventDocument,
} from '@kcs-project/pack/models/job/outbox-event';
import { addSeconds } from 'date-fns';
import type {
    GetLeanResultType,
    mongo,
} from 'mongoose';
import { nanoid } from 'nanoid';

import { BaseServiceLifecycle } from '@/service/base-lifecycle';

import {
    emailSendJobQueue,
    emailSendJobQueueName,
} from './email/send-job/queue';
import type { EmailSendJobData } from './email/send-job/queue';

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
                    status: JobOutboxEventStatus.Pending,
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
            status: JobOutboxEventStatus.Pending,
        });

        if (!deleteResult.deletedCount) {
            this.logger.warn('Job outbox event was not deleted after publishing', { eventId: outboxEvent._id });
        }
    }

    async #handlePublishOutboxEventFailure(outboxEvent: LeanedJobOutboxEvent, error: unknown) {
        if (outboxEvent.publishAttempts >= 10) {
            await this.#markOutboxEventDeadLettered(outboxEvent, error);
            return;
        }

        const nextPublishAt = addSeconds(new Date(), 5);
        try {
            const updateResult = await JobOutboxEventModel.updateOne(
                {
                    _id: outboxEvent._id,
                    publishClaimId: outboxEvent.publishClaimId,
                    status: JobOutboxEventStatus.Pending,
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

    async #markOutboxEventDeadLettered(outboxEvent: LeanedJobOutboxEvent, error: unknown) {
        this.logger.error(
            'Job outbox event publish failed',
            {
                error,
                eventId: outboxEvent._id,
                publishAttempts: outboxEvent.publishAttempts,
                type: outboxEvent.type,
            },
        );

        const updateResult = await JobOutboxEventModel.updateOne(
            {
                _id: outboxEvent._id,
                publishClaimId: outboxEvent.publishClaimId,
                status: JobOutboxEventStatus.Pending,
            },
            {
                $set: { status: JobOutboxEventStatus.DeadLettered },
                $unset: {
                    publishClaimId: 1,
                    publishLeaseUntil: 1,
                },
            },
        );

        if (updateResult.matchedCount) {
            this.logger.warn('Job outbox event moved to dead-letter', { eventId: outboxEvent._id });
        } else {
            this.logger.warn(
                'Job outbox event was not marked dead-lettered because its claim changed',
                { eventId: outboxEvent._id },
            );
        }
    }

    async #processOutboxEvent(outboxEvent: LeanedJobOutboxEvent) {
        try {
            if (!await this.#publishOutboxEvent(outboxEvent)) return;
            await this.#deletePublishedOutboxEvent(outboxEvent);
        } catch (error) {
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
            default:
                await this.#markOutboxEventDeadLettered(
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
