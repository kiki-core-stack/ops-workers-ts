import {
    emailSendJobRestorer,
    emailSendJobWorkerManager,
} from '@/email';
import { gracefulExit } from '@/graceful-exit';

// Register exit signals
process.on('SIGINT', () => gracefulExit());
process.on('SIGTERM', () => gracefulExit());

// Email
emailSendJobRestorer.start();
emailSendJobWorkerManager.start();
