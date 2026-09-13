import logger from 'consola';

import { gracefulExit } from '@/graceful-exit';
import { mainModule } from '@/modules/main';

// Register events and signals
process.once('SIGINT', gracefulExit);
process.once('SIGTERM', gracefulExit);
process.once('SIGUSR2', gracefulExit);
process.once('uncaughtException', handleFatalError);
process.once('unhandledRejection', handleFatalError);

// Functions
function handleFatalError(error: unknown) {
    process.exitCode = 1;
    logger.error('Service failed', error);
    gracefulExit().catch((shutdownError) => logger.error('Graceful shutdown handler failed', shutdownError));
}

// Initialize system startup
await (await import('@kcs-project/pack/init')).initializeSystemStartup();

// Start main module
await mainModule.start();
