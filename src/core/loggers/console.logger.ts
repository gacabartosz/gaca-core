// ConsoleLogger - Default logger implementation using console
// Framework-agnostic, works in any JavaScript environment

import type { GacaLogger, GacaLoggerFactory } from '../interfaces/logger.interface.js';

export class ConsoleLogger implements GacaLogger {
  private context: string;
  private level: 'debug' | 'info' | 'warn' | 'error';

  constructor(context: string = 'GACA', level: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.context = context;
    this.level = level;
  }

  private shouldLog(msgLevel: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(msgLevel) >= levels.indexOf(this.level);
  }

  private formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}${contextStr}`;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  log(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, context));
    }
  }
}

export class ConsoleLoggerFactory implements GacaLoggerFactory {
  private level: 'debug' | 'info' | 'warn' | 'error';

  constructor(level: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.level = level;
  }

  createLogger(context: string): GacaLogger {
    return new ConsoleLogger(context, this.level);
  }
}
