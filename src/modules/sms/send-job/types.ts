import type { JobType } from '@kcs-project/pack/constants/job';
import type { JobPayloadByType } from '@kcs-project/pack/types/job';

export type SmsSendJobData = JobPayloadByType[JobType.SendSms];
