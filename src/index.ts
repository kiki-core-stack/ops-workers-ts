import { gracefulExit } from '@/graceful-exit';
import { emailSendJobRestorer } from '@/job-restorers';
import { emailSendJobWorkerManager } from '@/worker-managers';

// Register exit signals
process.on('SIGINT', () => gracefulExit());
process.on('SIGTERM', () => gracefulExit());

// Run job restorers
await emailSendJobRestorer.start();

// Run worker managers
await emailSendJobWorkerManager.start();
