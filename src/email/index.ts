import { EmailSendJobRestorer } from './send-job-restorer';
import { EmailSendJobWorkerManager } from './send-job-worker-manager';

export const emailSendJobRestorer = new EmailSendJobRestorer();
export const emailSendJobWorkerManager = new EmailSendJobWorkerManager();
