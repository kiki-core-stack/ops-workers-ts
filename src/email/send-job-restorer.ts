import { EmailSendRecordStatus } from '@kiki-core-stack/pack/constants/email';
import { redisClient } from '@kiki-core-stack/pack/constants/redis';
import { enqueueEmailSendRecordIds } from '@kiki-core-stack/pack/libs/email';
import { EmailSendRecordModel } from '@kiki-core-stack/pack/models/email/send-record';
import { abortableDelay } from '@kikiutils/shared/time';
import {
    subMinutes,
    subSeconds,
} from 'date-fns';

import { BaseServiceLifecycle } from '@/base-service-lifecycle';

export class EmailSendJobRestorer extends BaseServiceLifecycle {
    // Private properties
    #loopAbortController?: AbortController;
    #loopPromise?: Promise<void>;

    constructor() {
        super('[EmailSendJobRestorer]');
    }

    // Private methods
    async #restoreOnce() {
        const emailSendRecords = await EmailSendRecordModel
            .find({
                $or: [
                    {
                        status: EmailSendRecordStatus.Pending,
                        updatedAt: { $lt: subMinutes(new Date(), 1) },
                    },
                    {
                        status: EmailSendRecordStatus.Processing,
                        updatedAt: { $lt: subSeconds(new Date(), 30) },
                    },
                ],
            })
            .select(['_id'])
            .lean();

        const emailSendRecordIds = emailSendRecords.map((emailSendRecord) => emailSendRecord._id);
        await EmailSendRecordModel.updateMany(
            { _id: emailSendRecordIds },
            { status: EmailSendRecordStatus.Pending },
        );

        await enqueueEmailSendRecordIds(emailSendRecordIds, redisClient);
    }

    async #runLoop() {
        while (this.status === 'running') {
            const locked = await redisClient.send(
                'SET',
                [
                    'email:send:queue:restore:lock',
                    '1',
                    'EX',
                    '60',
                    'NX',
                ],
            );

            if (locked) await this.#restoreOnce();
            this.#loopAbortController = new AbortController();
            await abortableDelay(60 * 1000, this.#loopAbortController.signal);
        }
    }

    // Public methods
    override start() {
        return super.start(() => void (this.#loopPromise = this.#runLoop()));
    }

    override stop() {
        return super.stop(async () => {
            this.#loopAbortController?.abort();
            await this.#loopPromise;
        });
    }
}
