// Legacy logger - exports a default pino logger for backwards compatibility
// New code should use GacaLogger interface and dependency injection

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});

// Re-export interfaces for convenience
export type { GacaLogger, GacaLoggerFactory } from './interfaces/logger.interface.js';
export { ConsoleLogger, ConsoleLoggerFactory } from './loggers/console.logger.js';
export { PinoLogger, PinoLoggerFactory, createDefaultPinoLogger } from './loggers/pino.logger.js';
