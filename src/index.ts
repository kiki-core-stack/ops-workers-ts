import { writeSync } from 'node:fs';
import { inspect } from 'node:util';

import {
    gracefulExit,
    isShuttingDown,
} from '@/graceful-exit';

// Functions
function handleFatalError(error: unknown) {
    try {
        writeSync(process.stderr.fd, `Service failed: ${inspect(error)}\n`);
    } finally {
        process.exit(1);
    }
}

// Register events and signals
process.once('SIGINT', gracefulExit);
process.once('SIGTERM', gracefulExit);
process.once('SIGUSR2', gracefulExit);
process.once('uncaughtException', handleFatalError);
process.once('unhandledRejection', handleFatalError);

// Start

// Initialize system startup
await (await import('@kcs-project/pack/init')).initializeSystemStartup();

// Start main module
const { mainModule } = await import('@/modules/main');
if (!isShuttingDown()) await mainModule.start();
