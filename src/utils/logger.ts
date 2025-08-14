export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  log(level: LogLevel, message: string, ...args: unknown[]): void;
  setLevel(level: LogLevel): void;
  isEnabled(level: LogLevel): boolean;
}

export class Logger implements ILogger {
  private static instance: Logger;
  private currentLevel: LogLevel = 'info';
  private enabled = true;

  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  static createLogger(level: LogLevel = 'info', enabled = true): Logger {
    const logger = new Logger();
    logger.setLevel(level);
    logger.setEnabled(enabled);
    return logger;
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(level: LogLevel): boolean {
    return this.enabled && this.levels[level] >= this.levels[this.currentLevel];
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.isEnabled(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    switch (level) {
      case 'debug':
      case 'info':
        console.error(prefix, message, ...args);
        break;
      case 'warn':
        console.error(prefix, message, ...args);
        break;
      case 'error':
        console.error(prefix, message, ...args);
        break;
    }
  }
}

// Silent logger implementation for testing/production
export class SilentLogger implements ILogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  log(): void {}
  setLevel(): void {}
  isEnabled(): boolean {
    return false;
  }
}

// Default logger instance
export const logger = Logger.getInstance();