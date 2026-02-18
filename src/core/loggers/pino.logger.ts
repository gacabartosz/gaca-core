// PinoLogger - Logger implementation wrapping pino
// For backwards compatibility with existing Express-based usage

import pino from 'pino';
import type { GacaLogger, GacaLoggerFactory } from '../interfaces/logger.interface.js';

export class PinoLogger implements GacaLogger {
  private logger: pino.Logger;

  constructor(logger: pino.Logger) {
    this.logger = logger;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(context || {}, message);
  }

  log(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context || {}, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context || {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context || {}, message);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logger.error(context || {}, message);
  }
}

export class PinoLoggerFactory implements GacaLoggerFactory {
  private baseLogger: pino.Logger;

  constructor(options?: pino.LoggerOptions) {
    this.baseLogger = pino({
      level: process.env.LOG_LEVEL || 'info',
      ...(process.env.NODE_ENV !== 'production' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
      ...options,
    });
  }

  createLogger(context: string): GacaLogger {
    return new PinoLogger(this.baseLogger.child({ context }));
  }

  getBaseLogger(): pino.Logger {
    return this.baseLogger;
  }
}

// Create default pino logger factory (for backwards compatibility)
export function createDefaultPinoLogger(): GacaLogger {
  const factory = new PinoLoggerFactory();
  return factory.createLogger('GACA');
}
