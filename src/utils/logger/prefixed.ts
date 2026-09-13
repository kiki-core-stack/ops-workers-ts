import logger from 'consola';

export class PrefixedLogger {
    readonly #prefix: string;

    constructor(prefix: string) {
        this.#prefix = prefix;
    }

    // Public methods
    error(...args: any[]) {
        logger.error(this.#prefix, ...args);
    }

    info(...args: any[]) {
        logger.info(this.#prefix, ...args);
    }

    success(...args: any[]) {
        logger.success(this.#prefix, ...args);
    }

    warn(...args: any[]) {
        logger.warn(this.#prefix, ...args);
    }
}
