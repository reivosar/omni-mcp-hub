import { ILogger } from './logger.js';

export interface ProcessErrorConfig {
  enableGracefulShutdown?: boolean;
  shutdownTimeoutMs?: number;
  enableHealthCheck?: boolean;
  logUncaughtExceptions?: boolean;
}

export interface IProcessAdapter {
  on(event: 'uncaughtException', listener: (error: Error) => void): void;
  on(event: 'unhandledRejection', listener: (reason: unknown, promise: Promise<unknown>) => void): void;
  on(event: 'warning', listener: (warning: { name: string; message: string; stack?: string }) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  exit(code: number): void;
  emit(event: string, ...args: unknown[]): void;
  memoryUsage(): NodeJS.MemoryUsage;
  cpuUsage(): NodeJS.CpuUsage;
  uptime(): number;
  pid: number;
}

export interface ITimerAdapter {
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
  clearTimeout(timeout: NodeJS.Timeout): void;
  setInterval(callback: () => void, ms: number): NodeJS.Timeout;
  clearInterval(interval: NodeJS.Timeout): void;
}

export interface IConsoleAdapter {
  error(...args: unknown[]): void;
}

export class ProcessErrorHandler {
  private logger: ILogger;
  private config: ProcessErrorConfig;
  private processAdapter: IProcessAdapter;
  private timerAdapter: ITimerAdapter;
  private consoleAdapter: IConsoleAdapter;
  private isShuttingDown = false;
  private metricsInterval?: NodeJS.Timeout;

  constructor(
    logger: ILogger,
    processAdapter: IProcessAdapter,
    timerAdapter: ITimerAdapter = {
      setTimeout: (cb, ms) => setTimeout(cb, ms),
      clearTimeout: (t) => clearTimeout(t),
      setInterval: (cb, ms) => setInterval(cb, ms),
      clearInterval: (t) => clearInterval(t),
    },
    consoleAdapter: IConsoleAdapter = console,
    config: ProcessErrorConfig = {}
  ) {
    this.logger = logger;
    this.processAdapter = processAdapter;
    this.timerAdapter = timerAdapter;
    this.consoleAdapter = consoleAdapter;
    this.config = {
      enableGracefulShutdown: true,
      shutdownTimeoutMs: 5000,
      enableHealthCheck: true,
      logUncaughtExceptions: true,
      ...config,
    };
  }

  setupGlobalErrorHandlers(): void {
    this.logger.info('[PROCESS-ERROR] Setting up global error handlers');

    this.processAdapter.on('uncaughtException', (error: Error) => {
      this.handleUncaughtException(error);
    });

    this.processAdapter.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
      this.handleUnhandledRejection(reason, _promise);
    });

    this.processAdapter.on('SIGTERM', () => {
      this.handleSignal('SIGTERM');
    });

    this.processAdapter.on('SIGINT', () => {
      this.handleSignal('SIGINT');
    });

    this.processAdapter.on('warning', (warning: { name: string; message: string; stack?: string }) => {
      this.logger.warn('[PROCESS-WARNING]', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      });
    });

    this.logger.info('[PROCESS-ERROR] Global error handlers setup complete');
  }

  private handleUncaughtException(error: Error): void {
    const errorInfo = {
      type: 'uncaught_exception',
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      pid: this.processAdapter.pid,
      memory: this.processAdapter.memoryUsage(),
    };

    this.logger.error('[UNCAUGHT-EXCEPTION]', JSON.stringify(errorInfo, null, 2));

    if (this.config.logUncaughtExceptions) {
      this.consoleAdapter.error('[CRITICAL] Uncaught Exception:', error);
    }

    this.performGracefulShutdown('uncaught_exception', 1);
  }

  private handleUnhandledRejection(reason: unknown, _promise: Promise<unknown>): void {
    const errorInfo = {
      type: 'unhandled_rejection',
      reason: reason instanceof Error ? {
        message: reason.message,
        stack: reason.stack,
      } : String(reason),
      timestamp: new Date().toISOString(),
      pid: this.processAdapter.pid,
      memory: this.processAdapter.memoryUsage(),
    };

    this.logger.error('[UNHANDLED-REJECTION]', JSON.stringify(errorInfo, null, 2));

    if (this.config.logUncaughtExceptions) {
      this.consoleAdapter.error('[CRITICAL] Unhandled Rejection:', reason);
    }

    this.performGracefulShutdown('unhandled_rejection', 1);
  }

  private handleSignal(signal: string): void {
    this.logger.info(`[PROCESS-SIGNAL] Received ${signal}, initiating graceful shutdown`);
    this.performGracefulShutdown(signal, 0);
  }

  private performGracefulShutdown(reason: string, exitCode: number): void {
    if (this.isShuttingDown) {
      this.logger.warn('[SHUTDOWN] Already shutting down, forcing exit');
      this.processAdapter.exit(exitCode);
      return;
    }

    this.isShuttingDown = true;
    this.logger.info(`[SHUTDOWN] Starting graceful shutdown (reason: ${reason})`);

    const shutdownTimeout = this.timerAdapter.setTimeout(() => {
      this.logger.error('[SHUTDOWN] Graceful shutdown timeout, forcing exit');
      this.processAdapter.exit(exitCode);
    }, this.config.shutdownTimeoutMs!);

    this.performCleanup()
      .then(() => {
        this.timerAdapter.clearTimeout(shutdownTimeout);
        this.logger.info('[SHUTDOWN] Graceful shutdown complete');
        this.processAdapter.exit(exitCode);
      })
      .catch((error) => {
        this.timerAdapter.clearTimeout(shutdownTimeout);
        this.logger.error('[SHUTDOWN] Error during cleanup:', error);
        this.processAdapter.exit(exitCode);
      });
  }

  private async performCleanup(): Promise<void> {
    try {
      this.logger.info('[CLEANUP] Starting server cleanup...');
      
      // Stop metrics collection
      if (this.metricsInterval) {
        this.timerAdapter.clearInterval(this.metricsInterval);
        this.metricsInterval = undefined;
      }
      
      // Emit cleanup events
      this.processAdapter.emit('beforeExit', 0);
      
      // Give time for cleanup
      await new Promise(resolve => this.timerAdapter.setTimeout(() => resolve(undefined), 100));
      
      this.logger.info('[CLEANUP] Server cleanup completed');
    } catch (error) {
      this.logger.error('[CLEANUP] Cleanup error:', error);
      throw error;
    }
  }

  createHealthCheckEndpoint(): () => { status: string; timestamp: string; uptime: number } {
    return () => ({
      status: this.isShuttingDown ? 'shutting_down' : 'healthy',
      timestamp: new Date().toISOString(),
      uptime: this.processAdapter.uptime(),
    });
  }

  logProcessMetrics(): void {
    const metrics = {
      type: 'process_metrics',
      timestamp: new Date().toISOString(),
      pid: this.processAdapter.pid,
      uptime: this.processAdapter.uptime(),
      memory: this.processAdapter.memoryUsage(),
      cpu: this.processAdapter.cpuUsage(),
    };

    this.logger.info('[PROCESS-METRICS]', JSON.stringify(metrics));
  }

  startMetricsCollection(intervalMs: number = 60000): NodeJS.Timeout {
    this.logger.info(`[PROCESS-METRICS] Starting metrics collection (interval: ${intervalMs}ms)`);
    
    this.metricsInterval = this.timerAdapter.setInterval(() => {
      this.logProcessMetrics();
    }, intervalMs);
    
    return this.metricsInterval;
  }

  stopMetricsCollection(): void {
    if (this.metricsInterval) {
      this.timerAdapter.clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
      this.logger.info('[PROCESS-METRICS] Metrics collection stopped');
    }
  }

  // For testing: reset internal state
  reset(): void {
    this.isShuttingDown = false;
    if (this.metricsInterval) {
      this.timerAdapter.clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }

  // Getters for testing
  get shuttingDown(): boolean {
    return this.isShuttingDown;
  }
}