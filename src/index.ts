import {
    emailSendJobRestorer,
    emailSendJobWorkerManager,
} from '@/email';
import { gracefulExit } from '@/graceful-exit';

// Register exit signals
process.on('SIGINT', () => gracefulExit());
process.on('SIGTERM', () => gracefulExit());

// Run job restorers
await emailSendJobRestorer.start();

// Run worker managers
await emailSendJobWorkerManager.start();
