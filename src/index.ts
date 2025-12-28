import {
    emailSendJobRestorer,
    emailSendJobWorkerManager,
} from '@/email';
import { gracefulExit } from '@/graceful-exit';

// Register exit signals
process.on('SIGINT', () => gracefulExit());
process.on('SIGTERM', () => gracefulExit());

// Email
await emailSendJobRestorer.start();
await emailSendJobWorkerManager.start();
