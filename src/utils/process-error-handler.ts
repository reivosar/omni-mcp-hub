import { ILogger } from './logger.js';

export interface ProcessErrorConfig {
  enableGracefulShutdown?: boolean;
  shutdownTimeoutMs?: number;
  enableHealthCheck?: boolean;
  logUncaughtExceptions?: boolean;
}

export class ProcessErrorHandler {
  private static instance: ProcessErrorHandler;
  private logger: ILogger;
  private config: ProcessErrorConfig;
  private isShuttingDown = false;

  constructor(logger: ILogger, config: ProcessErrorConfig = {}) {
    this.logger = logger;
    this.config = {
      enableGracefulShutdown: true,
      shutdownTimeoutMs: 5000,
      enableHealthCheck: true,
      logUncaughtExceptions: true,
      ...config,
    };
  }

  static getInstance(logger: ILogger, config?: ProcessErrorConfig): ProcessErrorHandler {
    if (!ProcessErrorHandler.instance) {
      ProcessErrorHandler.instance = new ProcessErrorHandler(logger, config);
    }
    return ProcessErrorHandler.instance;
  }

  setupGlobalErrorHandlers(): void {
    this.logger.info('[PROCESS-ERROR] Setting up global error handlers');

    process.on('uncaughtException', (error: Error) => {
      this.handleUncaughtException(error);
    });

    process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
      this.handleUnhandledRejection(reason, _promise);
    });

    process.on('SIGTERM', () => {
      this.handleSignal('SIGTERM');
    });

    process.on('SIGINT', () => {
      this.handleSignal('SIGINT');
    });

    // Handle memory warnings
    process.on('warning', (warning) => {
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
      pid: process.pid,
      memory: process.memoryUsage(),
    };

    this.logger.error('[UNCAUGHT-EXCEPTION]', JSON.stringify(errorInfo, null, 2));

    if (this.config.logUncaughtExceptions) {
      console.error('[CRITICAL] Uncaught Exception:', error);
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
      pid: process.pid,
      memory: process.memoryUsage(),
    };

    this.logger.error('[UNHANDLED-REJECTION]', JSON.stringify(errorInfo, null, 2));

    if (this.config.logUncaughtExceptions) {
      console.error('[CRITICAL] Unhandled Rejection:', reason);
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
      process.exit(exitCode);
      return;
    }

    this.isShuttingDown = true;
    this.logger.info(`[SHUTDOWN] Starting graceful shutdown (reason: ${reason})`);

    const shutdownTimeout = setTimeout(() => {
      this.logger.error('[SHUTDOWN] Graceful shutdown timeout, forcing exit');
      process.exit(exitCode);
    }, this.config.shutdownTimeoutMs);

    // Clean shutdown logic
    this.performCleanup()
      .then(() => {
        clearTimeout(shutdownTimeout);
        this.logger.info('[SHUTDOWN] Graceful shutdown complete');
        process.exit(exitCode);
      })
      .catch((error) => {
        clearTimeout(shutdownTimeout);
        this.logger.error('[SHUTDOWN] Error during cleanup:', error);
        process.exit(exitCode);
      });
  }

  private async performCleanup(): Promise<void> {
    try {
      // Emit shutdown event for components to clean up
      process.emit('beforeExit' as never, 0);
      
      // Give time for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.logger.info('[SHUTDOWN] Cleanup completed');
    } catch (error) {
      this.logger.error('[SHUTDOWN] Cleanup error:', error);
      throw error;
    }
  }

  createHealthCheckEndpoint(): () => { status: string; timestamp: string; uptime: number } {
    return () => ({
      status: this.isShuttingDown ? 'shutting_down' : 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  logProcessMetrics(): void {
    const metrics = {
      type: 'process_metrics',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    };

    this.logger.info('[PROCESS-METRICS]', JSON.stringify(metrics));
  }

  startMetricsCollection(intervalMs: number = 60000): NodeJS.Timeout {
    this.logger.info(`[PROCESS-METRICS] Starting metrics collection (interval: ${intervalMs}ms)`);
    
    return setInterval(() => {
      this.logProcessMetrics();
    }, intervalMs);
  }
}