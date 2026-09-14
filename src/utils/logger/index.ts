import { createConsola } from 'consola';

// Constants
const consola = createConsola({ formatOptions: { date: false } });
const createLogDateTimePrefix = () => `[${formatDate(new Date())}]`;

// Functions
export const error = (...args: any[]) => consola.error(createLogDateTimePrefix(), ...args);
export const info = (...args: any[]) => consola.info(createLogDateTimePrefix(), ...args);
export const success = (...args: any[]) => consola.success(createLogDateTimePrefix(), ...args);
export const warn = (...args: any[]) => consola.warn(createLogDateTimePrefix(), ...args);

function formatDate(date: Date) {
    const p = (n: number, d: number = 2) => n.toString().padStart(d, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} `
      + `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}`;
}
