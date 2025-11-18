import { gracefulExit } from '@/graceful-exit';
import { emailSendJobWorkerManager } from '@/worker-managers';

// Register exit signals
process.on('SIGINT', () => gracefulExit());
process.on('SIGTERM', () => gracefulExit());

// Run worker managers
await emailSendJobWorkerManager.start();
