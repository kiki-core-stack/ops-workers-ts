import { EnhancedDate } from '@kikiutils/shared/classes/enhanced-date';
import { createConsola } from 'consola';

// Constants
const consola = createConsola({ formatOptions: { date: false } });
const createLogDateTimePrefix = () => `[${new EnhancedDate().format('yyyy-MM-dd HH:mm:ss.SSS')}]`;

// Functions
export const error = (...args: any[]) => consola.error(createLogDateTimePrefix(), ...args);
export const info = (...args: any[]) => consola.info(createLogDateTimePrefix(), ...args);
export const success = (...args: any[]) => consola.success(createLogDateTimePrefix(), ...args);
export const warn = (...args: any[]) => consola.warn(createLogDateTimePrefix(), ...args);
