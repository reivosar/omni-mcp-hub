import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  ProcessErrorHandler, 
  ProcessErrorConfig, 
  IProcessAdapter, 
  ITimerAdapter, 
  IConsoleAdapter 
} from '../../src/utils/process-error-handler.js';
import { ILogger } from '../../src/utils/logger.js';

describe('ProcessErrorHandler', () => {
  let mockLogger: ILogger;
  let mockProcess: IProcessAdapter;
  let mockTimer: ITimerAdapter;
  let mockConsole: IConsoleAdapter;
  let handler: ProcessErrorHandler;

  const mockMemoryUsage = (): NodeJS.MemoryUsage => ({
    rss: 1000000,
    heapTotal: 2000000,
    heapUsed: 1500000,
    external: 500000,
    arrayBuffers: 100000
  });

  const mockCpuUsage = (): NodeJS.CpuUsage => ({
    user: 100000,
    system: 50000
  });

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockProcess = {
      on: vi.fn(),
      exit: vi.fn(),
      emit: vi.fn(),
      memoryUsage: vi.fn().mockReturnValue(mockMemoryUsage()),
      cpuUsage: vi.fn().mockReturnValue(mockCpuUsage()),
      uptime: vi.fn().mockReturnValue(12345),
      pid: 1234
    };

    mockTimer = {
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn()
    };

    mockConsole = {
      error: vi.fn()
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create instance with default config', () => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
      
      expect(handler).toBeInstanceOf(ProcessErrorHandler);
      expect(handler.shuttingDown).toBe(false);
    });

    it('should apply custom config', () => {
      const config: ProcessErrorConfig = {
        enableGracefulShutdown: false,
        shutdownTimeoutMs: 10000,
        enableHealthCheck: false,
        logUncaughtExceptions: false
      };

      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole, config);
      
      expect(handler).toBeInstanceOf(ProcessErrorHandler);
    });

    it('should use default adapters when not provided', () => {
      // This tests the default parameter values
      handler = new ProcessErrorHandler(mockLogger, mockProcess);
      
      expect(handler).toBeInstanceOf(ProcessErrorHandler);
    });
  });

  describe('Global Error Handler Setup', () => {
    beforeEach(() => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
    });

    it('should setup all error handlers', () => {
      handler.setupGlobalErrorHandlers();

      expect(mockProcess.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('warning', expect.any(Function));
      
      expect(mockLogger.info).toHaveBeenCalledWith('[PROCESS-ERROR] Setting up global error handlers');
      expect(mockLogger.info).toHaveBeenCalledWith('[PROCESS-ERROR] Global error handlers setup complete');
    });

    it('should handle warning events', () => {
      handler.setupGlobalErrorHandlers();
      
      // Get the warning handler
      const warningHandler = (mockProcess.on as any).mock.calls.find(
        call => call[0] === 'warning'
      )[1];
      
      const warning = {
        name: 'MaxListenersExceededWarning',
        message: 'Possible EventEmitter memory leak detected',
        stack: 'Error stack'
      };
      
      warningHandler(warning);
      
      expect(mockLogger.warn).toHaveBeenCalledWith('[PROCESS-WARNING]', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
      handler.setupGlobalErrorHandlers();
    });

    it('should handle uncaught exceptions', async () => {
      const error = new Error('Test uncaught exception');
      const timeoutId = Symbol('timeout') as any;
      mockTimer.setTimeout = vi.fn().mockReturnValue(timeoutId);
      
      // Get the uncaught exception handler
      const exceptionHandler = (mockProcess.on as any).mock.calls.find(
        call => call[0] === 'uncaughtException'
      )[1];
      
      const cleanupPromise = Promise.resolve();
      vi.spyOn(handler as any, 'performCleanup').mockReturnValue(cleanupPromise);
      
      exceptionHandler(error);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[UNCAUGHT-EXCEPTION]',
        expect.stringContaining('uncaught_exception')
      );
      expect(mockConsole.error).toHaveBeenCalledWith('[CRITICAL] Uncaught Exception:', error);
      expect(handler.shuttingDown).toBe(true);
    });

    it('should handle unhandled rejections', () => {
      const reason = new Error('Test unhandled rejection');
      const timeoutId = Symbol('timeout') as any;
      mockTimer.setTimeout = vi.fn().mockReturnValue(timeoutId);
      
      // Get the unhandled rejection handler
      const rejectionHandler = (mockProcess.on as any).mock.calls.find(
        call => call[0] === 'unhandledRejection'
      )[1];
      
      vi.spyOn(handler as any, 'performCleanup').mockReturnValue(Promise.resolve());
      
      rejectionHandler(reason, Promise.resolve());
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[UNHANDLED-REJECTION]',
        expect.stringContaining('unhandled_rejection')
      );
      expect(mockConsole.error).toHaveBeenCalledWith('[CRITICAL] Unhandled Rejection:', reason);
    });

    it('should handle non-Error rejection reasons', () => {
      const reason = 'String rejection reason';
      mockTimer.setTimeout = vi.fn().mockReturnValue(Symbol('timeout') as any);
      
      const rejectionHandler = (mockProcess.on as any).mock.calls.find(
        call => call[0] === 'unhandledRejection'
      )[1];
      
      vi.spyOn(handler as any, 'performCleanup').mockReturnValue(Promise.resolve());
      
      rejectionHandler(reason, Promise.resolve());
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[UNHANDLED-REJECTION]',
        expect.stringContaining(reason)
      );
    });

    it('should not log to console when logUncaughtExceptions is false', () => {
      const config: ProcessErrorConfig = { logUncaughtExceptions: false };
      // Clear the previous mock calls
      vi.clearAllMocks();
      
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole, config);
      handler.setupGlobalErrorHandlers();
      
      const error = new Error('Test error');
      mockTimer.setTimeout = vi.fn().mockReturnValue(Symbol('timeout') as any);
      
      // Get the handler from the new instance
      const exceptionHandler = (mockProcess.on as any).mock.calls.find(
        call => call[0] === 'uncaughtException'
      )[1];
      
      vi.spyOn(handler as any, 'performCleanup').mockReturnValue(Promise.resolve());
      
      exceptionHandler(error);
      
      expect(mockConsole.error).not.toHaveBeenCalled();
    });
  });

  describe('Signal Handling', () => {
    beforeEach(() => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
      handler.setupGlobalErrorHandlers();
    });

    it('should handle SIGTERM signal', () => {
      mockTimer.setTimeout = vi.fn().mockReturnValue(Symbol('timeout') as any);
      
      const sigtermHandler = (mockProcess.on as any).mock.calls.find(
        call => call[0] === 'SIGTERM'
      )[1];
      
      vi.spyOn(handler as any, 'performCleanup').mockReturnValue(Promise.resolve());
      
      sigtermHandler();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[PROCESS-SIGNAL] Received SIGTERM, initiating graceful shutdown'
      );
    });

    it('should handle SIGINT signal', () => {
      mockTimer.setTimeout = vi.fn().mockReturnValue(Symbol('timeout') as any);
      
      const sigintHandler = (mockProcess.on as any).mock.calls.find(
        call => call[0] === 'SIGINT'
      )[1];
      
      vi.spyOn(handler as any, 'performCleanup').mockReturnValue(Promise.resolve());
      
      sigintHandler();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[PROCESS-SIGNAL] Received SIGINT, initiating graceful shutdown'
      );
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(() => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
    });

    it('should perform graceful shutdown successfully', async () => {
      const timeoutId = Symbol('timeout') as any;
      mockTimer.setTimeout = vi.fn().mockReturnValue(timeoutId);
      
      const cleanupSpy = vi.spyOn(handler as any, 'performCleanup').mockResolvedValue(undefined);
      
      await (handler as any).performGracefulShutdown('test', 0);
      
      expect(mockLogger.info).toHaveBeenCalledWith('[SHUTDOWN] Starting graceful shutdown (reason: test)');
      expect(cleanupSpy).toHaveBeenCalled();
      expect(mockTimer.clearTimeout).toHaveBeenCalledWith(timeoutId);
      expect(mockLogger.info).toHaveBeenCalledWith('[SHUTDOWN] Graceful shutdown complete');
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it('should handle cleanup errors during shutdown', async () => {
      const timeoutId = Symbol('timeout') as any;
      mockTimer.setTimeout = vi.fn().mockReturnValue(timeoutId);
      
      const cleanupError = new Error('Cleanup failed');
      vi.spyOn(handler as any, 'performCleanup').mockRejectedValue(cleanupError);
      
      // We need to await the promise rejection properly
      const shutdownPromise = (handler as any).performGracefulShutdown('test', 1);
      
      // Wait a bit for the async operations to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockTimer.clearTimeout).toHaveBeenCalledWith(timeoutId);
      expect(mockLogger.error).toHaveBeenCalledWith('[SHUTDOWN] Error during cleanup:', cleanupError);
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });

    it('should force exit if already shutting down', () => {
      // Set shutting down state
      (handler as any).isShuttingDown = true;
      
      (handler as any).performGracefulShutdown('test', 1);
      
      expect(mockLogger.warn).toHaveBeenCalledWith('[SHUTDOWN] Already shutting down, forcing exit');
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });

    it('should timeout and force exit if cleanup takes too long', () => {
      const timeoutCallback = vi.fn();
      mockTimer.setTimeout = vi.fn().mockImplementation((callback) => {
        timeoutCallback.mockImplementation(callback);
        return Symbol('timeout') as any;
      });
      
      // Mock cleanup that never resolves
      vi.spyOn(handler as any, 'performCleanup').mockReturnValue(new Promise(() => {}));
      
      (handler as any).performGracefulShutdown('test', 1);
      
      // Trigger timeout
      timeoutCallback();
      
      expect(mockLogger.error).toHaveBeenCalledWith('[SHUTDOWN] Graceful shutdown timeout, forcing exit');
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Cleanup Process', () => {
    beforeEach(() => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
    });

    it('should perform cleanup successfully', async () => {
      const intervalId = Symbol('interval') as any;
      (handler as any).metricsInterval = intervalId;
      
      mockTimer.setTimeout = vi.fn().mockImplementation((callback) => {
        callback(); // Immediately resolve the cleanup delay
        return Symbol('timeout') as any;
      });
      
      await (handler as any).performCleanup();
      
      expect(mockLogger.info).toHaveBeenCalledWith('[CLEANUP] Starting server cleanup...');
      expect(mockTimer.clearInterval).toHaveBeenCalledWith(intervalId);
      expect(mockProcess.emit).toHaveBeenCalledWith('beforeExit', 0);
      expect(mockLogger.info).toHaveBeenCalledWith('[CLEANUP] Server cleanup completed');
    });

    it('should handle cleanup errors', async () => {
      const cleanupError = new Error('Cleanup error');
      mockProcess.emit = vi.fn().mockImplementation(() => {
        throw cleanupError;
      });
      
      await expect((handler as any).performCleanup()).rejects.toThrow(cleanupError);
      
      expect(mockLogger.error).toHaveBeenCalledWith('[CLEANUP] Cleanup error:', cleanupError);
    });
  });

  describe('Health Check Endpoint', () => {
    beforeEach(() => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
    });

    it('should return healthy status when not shutting down', () => {
      const healthCheck = handler.createHealthCheckEndpoint();
      const result = healthCheck();
      
      expect(result.status).toBe('healthy');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.uptime).toBe(12345);
      expect(mockProcess.uptime).toHaveBeenCalled();
    });

    it('should return shutting_down status when shutting down', () => {
      (handler as any).isShuttingDown = true;
      
      const healthCheck = handler.createHealthCheckEndpoint();
      const result = healthCheck();
      
      expect(result.status).toBe('shutting_down');
    });
  });

  describe('Metrics Collection', () => {
    beforeEach(() => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
    });

    it('should log process metrics', () => {
      handler.logProcessMetrics();
      
      expect(mockProcess.memoryUsage).toHaveBeenCalled();
      expect(mockProcess.cpuUsage).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[PROCESS-METRICS]',
        expect.stringContaining('process_metrics')
      );
    });

    it('should start metrics collection', () => {
      const intervalId = Symbol('interval') as any;
      mockTimer.setInterval = vi.fn().mockReturnValue(intervalId);
      
      const result = handler.startMetricsCollection(5000);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[PROCESS-METRICS] Starting metrics collection (interval: 5000ms)'
      );
      expect(mockTimer.setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
      expect(result).toBe(intervalId);
    });

    it('should use default interval for metrics collection', () => {
      const intervalId = Symbol('interval') as any;
      mockTimer.setInterval = vi.fn().mockReturnValue(intervalId);
      
      handler.startMetricsCollection();
      
      expect(mockTimer.setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    it('should stop metrics collection', () => {
      const intervalId = Symbol('interval') as any;
      (handler as any).metricsInterval = intervalId;
      
      handler.stopMetricsCollection();
      
      expect(mockTimer.clearInterval).toHaveBeenCalledWith(intervalId);
      expect(mockLogger.info).toHaveBeenCalledWith('[PROCESS-METRICS] Metrics collection stopped');
    });

    it('should not crash when stopping metrics that are not running', () => {
      handler.stopMetricsCollection();
      
      expect(mockTimer.clearInterval).not.toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
    });

    it('should reset state correctly', () => {
      const intervalId = Symbol('interval') as any;
      (handler as any).isShuttingDown = true;
      (handler as any).metricsInterval = intervalId;
      
      handler.reset();
      
      expect(handler.shuttingDown).toBe(false);
      expect(mockTimer.clearInterval).toHaveBeenCalledWith(intervalId);
    });

    it('should provide shuttingDown getter', () => {
      expect(handler.shuttingDown).toBe(false);
      
      (handler as any).isShuttingDown = true;
      expect(handler.shuttingDown).toBe(true);
    });
  });

  describe('Integration', () => {
    beforeEach(() => {
      handler = new ProcessErrorHandler(mockLogger, mockProcess, mockTimer, mockConsole);
    });

    it('should handle full error flow', () => {
      handler.setupGlobalErrorHandlers();
      
      const error = new Error('Integration test error');
      const timeoutId = Symbol('timeout') as any;
      mockTimer.setTimeout = vi.fn().mockReturnValue(timeoutId);
      
      const exceptionHandler = (mockProcess.on as any).mock.calls.find(
        call => call[0] === 'uncaughtException'
      )[1];
      
      vi.spyOn(handler as any, 'performCleanup').mockResolvedValue(undefined);
      
      exceptionHandler(error);
      
      expect(handler.shuttingDown).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[UNCAUGHT-EXCEPTION]',
        expect.stringContaining(error.message)
      );
    });
  });
});