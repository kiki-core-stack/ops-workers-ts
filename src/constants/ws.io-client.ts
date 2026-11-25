import { createWsIoClient } from '@kcs-project/pack/libs/ws.io';
import type { WsIoEvents } from '@kcs-project/pack/types/ws.io-events';
import { getRequiredEnv } from '@kikiutils/shared/env';

export const wsIoClient = createWsIoClient<WsIoEvents.ToServer, WsIoEvents.ToOpsWorkersTs>(
    `${getRequiredEnv('WS_IO_SERVER_BASE_URL')}/ops-workers-ts`,
    { initHandler: () => getRequiredEnv('WS_IO_AUTH_KEY') },
);
