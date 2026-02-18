// GacaLogger - Framework-agnostic logger interface
// Allows integration with NestJS Logger, pino, winston, console, etc.

export interface GacaLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  log(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

// Factory type for creating child loggers with context
export interface GacaLoggerFactory {
  createLogger(context: string): GacaLogger;
}
