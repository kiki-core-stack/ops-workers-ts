import type { JobType } from '@kcs-project/pack/constants/job';
import type { JobOutboxEventPayloadByType } from '@kcs-project/pack/types/job';

export type EmailSendJobData = JobOutboxEventPayloadByType[JobType.SendEmail];
