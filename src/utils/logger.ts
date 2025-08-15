import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as path from 'path';
import * as fs from 'fs';

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

export interface LoggerConfig {
  level?: LogLevel;
  logDir?: string;
  maxSize?: string;
  maxFiles?: string;
  datePattern?: string;
  zippedArchive?: boolean;
  consoleOutput?: boolean;
}

export class Logger implements ILogger {
  private static instance: Logger;
  private winstonLogger!: winston.Logger;
  private currentLevel: LogLevel = 'info';
  private enabled = true;
  private config: LoggerConfig;

  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: 'info',
      logDir: 'logs',
      maxSize: '20m',
      maxFiles: '14d',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      consoleOutput: false,
      ...config
    };

    this.currentLevel = this.config.level!;
    this.initializeWinston();
  }

  private initializeWinston(): void {
    // Ensure log directory exists
    const logDir = path.resolve(this.config.logDir!);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const transports: winston.transport[] = [];

    // Daily rotate file transport for all logs
    transports.push(new DailyRotateFile({
      filename: path.join(logDir, 'omni-mcp-hub-%DATE%.log'),
      datePattern: this.config.datePattern,
      zippedArchive: this.config.zippedArchive,
      maxSize: this.config.maxSize,
      maxFiles: this.config.maxFiles,
      auditFile: false as any,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    }));

    // Separate error log file
    transports.push(new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: this.config.datePattern,
      zippedArchive: this.config.zippedArchive,
      maxSize: this.config.maxSize,
      maxFiles: this.config.maxFiles,
      level: 'error',
      auditFile: false as any,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    }));

    // Console output (only if enabled)
    if (this.config.consoleOutput) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `[${timestamp}] [${level}] ${message} ${metaStr}`;
          })
        )
      }));
    }

    this.winstonLogger = winston.createLogger({
      level: this.currentLevel,
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
      },
      transports,
      exitOnError: false
    });
  }

  static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  static createLogger(level: LogLevel = 'info', enabled = true, config: LoggerConfig = {}): Logger {
    const logger = new Logger({ level, ...config });
    logger.setEnabled(enabled);
    return logger;
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
    this.winstonLogger.level = level;
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
    if (!this.enabled) {
      return;
    }

    // Format message with args
    let formattedMessage = message;
    if (args.length > 0) {
      const argsStr = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      formattedMessage = `${message} ${argsStr}`;
    }

    this.winstonLogger.log(level, formattedMessage);
  }

  // Method to get winston logger instance for advanced usage
  getWinstonLogger(): winston.Logger {
    return this.winstonLogger;
  }

  // Method to update configuration
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeWinston();
  }
}

// Silent logger implementation for testing
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

// Create file logger configuration
export const createFileLogger = (config: LoggerConfig = {}): Logger => {
  return new Logger({
    level: 'debug',
    logDir: 'logs',
    maxSize: '20m',
    maxFiles: '14d',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    consoleOutput: false,
    ...config
  });
};

// Default logger instance (file-based)
export const logger = createFileLogger();