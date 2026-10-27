import { writeSync } from 'node:fs';
import { inspect } from 'node:util';

import {
    gracefulExit,
    isShuttingDown,
} from '@/graceful-exit';
import type { MainModule } from '@/modules/main';

// Constants/Variables
let mainModule: MainModule | undefined;

// Functions
function handleFatalError(error: unknown) {
    try {
        writeSync(process.stderr.fd, `Service failed: ${inspect(error)}\n`);
    } finally {
        process.exit(1);
    }
}

// Register events and signals
process.once('SIGINT', () => gracefulExit(mainModule));
process.once('SIGTERM', () => gracefulExit(mainModule));
process.once('SIGUSR2', () => gracefulExit(mainModule));
process.once('uncaughtException', handleFatalError);
process.once('unhandledRejection', handleFatalError);

// Start

// Initialize system startup
await (await import('@kcs-project/pack/init')).initializeSystemStartup();

// Start main module
if (!isShuttingDown()) {
    mainModule = (await import('@/modules/main')).mainModule;
    if (!isShuttingDown()) await mainModule.start();
}
