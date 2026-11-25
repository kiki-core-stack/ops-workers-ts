import { writeSync } from 'node:fs';
import { inspect } from 'node:util';

import { wsIoClient } from '@/constants/ws.io-client';
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
process.once('SIGINT', () => void gracefulExit(mainModule));
process.once('SIGTERM', () => void gracefulExit(mainModule));
process.once('SIGUSR2', () => void gracefulExit(mainModule));
process.once('uncaughtException', handleFatalError);
process.once('unhandledRejection', handleFatalError);

// Start
await (async () => {
    if (isShuttingDown()) return;
    await wsIoClient.connect();
    if (isShuttingDown()) return;
    mainModule = (await import('@/modules/main')).mainModule;
    if (isShuttingDown()) return;
    await mainModule.start();
})();
