import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createFileLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}));

// Import after mocking
import { ErrorHandler, ErrorContext, ErrorSeverity, ErrorHandleResult } from '../../src/utils/error-handler.js';
import { ILogger } from '../../src/utils/logger.js';

describe('ErrorHandler Coverage Tests', () => {
  let errorHandler: ErrorHandler;
  let mockLogger: ILogger;

  beforeEach(async () => {
    const { createFileLogger } = await import('../../src/utils/logger.js');
    mockLogger = vi.mocked(createFileLogger)();
    // Create fresh instance instead of singleton
    errorHandler = new ErrorHandler(mockLogger);
    errorHandler.clearErrorHistory();
    errorHandler.setErrorFilter(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with logger', () => {
      expect(errorHandler).toBeDefined();
      expect(errorHandler).toBeInstanceOf(ErrorHandler);
    });

    it('should create instance without logger', () => {
      const handler = new ErrorHandler();
      expect(handler).toBeDefined();
    });
  });

  describe('handleError', () => {
    it('should handle basic errors', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        operation: 'test-operation',
        component: 'test-component'
      };

      const result = errorHandler.handleError(error, context);
      
      expect(result).toBeDefined();
      expect(result.handled).toBe(true);
      expect(result.errorId).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle errors with different severities', () => {
      const error = new Error('Critical error');
      const context: ErrorContext = {
        operation: 'critical-operation',
        severity: ErrorSeverity.CRITICAL
      };

      const result = errorHandler.handleError(error, context);
      expect(result.severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should handle errors with user information', () => {
      const error = new Error('User error');
      const context: ErrorContext = {
        operation: 'user-operation',
        userId: 'user123',
        userAction: 'save-profile'
      };

      const result = errorHandler.handleError(error, context);
      expect(result.context.userId).toBe('user123');
      expect(result.context.userAction).toBe('save-profile');
    });

    it('should handle errors with additional metadata', () => {
      const error = new Error('Metadata error');
      const context: ErrorContext = {
        operation: 'metadata-operation',
        metadata: {
          filename: 'test.md',
          size: 1024,
          timestamp: new Date().toISOString()
        }
      };

      const result = errorHandler.handleError(error, context);
      expect(result.context.metadata).toEqual(context.metadata);
    });

    it('should handle string errors', () => {
      const result = errorHandler.handleError('String error message');
      
      expect(result.handled).toBe(true);
      expect(result.error.message).toBe('String error message');
    });

    it('should handle null/undefined errors', () => {
      const nullResult = errorHandler.handleError(null as never);
      const undefinedResult = errorHandler.handleError(undefined as never);
      
      expect(nullResult.handled).toBe(true);
      expect(undefinedResult.handled).toBe(true);
    });

    it('should generate unique error IDs', () => {
      const error = new Error('Test');
      const result1 = errorHandler.handleError(error);
      const result2 = errorHandler.handleError(error);
      
      expect(result1.errorId).not.toBe(result2.errorId);
    });
  });

  describe('handleAsyncError', () => {
    it('should handle async errors', async () => {
      const asyncError = Promise.reject(new Error('Async error'));
      const context: ErrorContext = {
        operation: 'async-operation'
      };

      const result = await errorHandler.handleAsyncError(asyncError, context);
      
      expect(result.handled).toBe(true);
      expect(result.error.message).toBe('Async error');
    });

    it('should handle resolved promises', async () => {
      const resolvedPromise = Promise.resolve('Success');
      
      const result = await errorHandler.handleAsyncError(resolvedPromise);
      expect(result).toBe('Success');
    });

    it('should handle async timeouts', async () => {
      const timeoutPromise = new Promise(() => {}); // Never resolves
      const context: ErrorContext = {
        operation: 'timeout-test',
        timeout: 100
      };

      const result = await errorHandler.handleAsyncError(timeoutPromise, context);
      expect(result.error.message).toContain('timeout');
    });
  });

  describe('wrapFunction', () => {
    it('should wrap synchronous functions', () => {
      const testFunc = (x: number) => x * 2;
      const wrappedFunc = errorHandler.wrapFunction(testFunc, {
        operation: 'multiply'
      });

      const result = wrappedFunc(5);
      expect(result).toBe(10);
    });

    it('should handle errors in wrapped functions', () => {
      const errorFunc = () => {
        throw new Error('Function error');
      };

      const wrappedFunc = errorHandler.wrapFunction(errorFunc, {
        operation: 'error-function'
      });

      const result = wrappedFunc();
      expect(result).toBeUndefined(); // Error was handled
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should wrap async functions', async () => {
      const asyncFunc = async (x: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return x * 3;
      };

      const wrappedFunc = errorHandler.wrapAsyncFunction(asyncFunc, {
        operation: 'async-multiply'
      });

      const result = await wrappedFunc(4);
      expect(result).toBe(12);
    });

    it('should handle errors in wrapped async functions', async () => {
      const asyncErrorFunc = async () => {
        throw new Error('Async function error');
      };

      const wrappedFunc = errorHandler.wrapAsyncFunction(asyncErrorFunc, {
        operation: 'async-error-function'
      });

      const result = await wrappedFunc();
      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createErrorContext', () => {
    it('should create basic error context', () => {
      const context = errorHandler.createErrorContext('test-operation');
      
      expect(context.operation).toBe('test-operation');
      expect(context.timestamp).toBeDefined();
      expect(context.severity).toBe(ErrorSeverity.ERROR);
    });

    it('should create context with all fields', () => {
      const context = errorHandler.createErrorContext(
        'full-operation',
        'test-component',
        ErrorSeverity.WARNING,
        'user123',
        'test-action',
        { key: 'value' }
      );

      expect(context.operation).toBe('full-operation');
      expect(context.component).toBe('test-component');
      expect(context.severity).toBe(ErrorSeverity.WARNING);
      expect(context.userId).toBe('user123');
      expect(context.userAction).toBe('test-action');
      expect(context.metadata).toEqual({ key: 'value' });
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      const networkError = new Error('ECONNREFUSED');
      const timeoutError = new Error('ETIMEDOUT');
      const genericError = new Error('Generic error');

      expect(errorHandler.isRetryableError(networkError)).toBe(true);
      expect(errorHandler.isRetryableError(timeoutError)).toBe(true);
      expect(errorHandler.isRetryableError(genericError)).toBe(false);
    });

    it('should handle error codes', () => {
      const error = new Error('Network error') as Error & { code: string };
      error.code = 'ENOTFOUND';

      expect(errorHandler.isRetryableError(error)).toBe(true);
    });

    it('should handle status codes', () => {
      const error = new Error('HTTP error') as Error & { status: number };
      error.status = 503;

      expect(errorHandler.isRetryableError(error)).toBe(true);
    });
  });

  describe('formatError', () => {
    it('should format basic errors', () => {
      const error = new Error('Test error');
      const formatted = errorHandler.formatError(error);

      expect(formatted).toContain('Test error');
      expect(formatted).toContain('Error');
    });

    it('should format errors with stack traces', () => {
      const error = new Error('Stack error');
      error.stack = 'Error: Stack error\n    at test.js:1:1';

      const formatted = errorHandler.formatError(error, true);
      expect(formatted).toContain('Stack error');
      expect(formatted).toContain('at test.js:1:1');
    });

    it('should format errors without stack traces', () => {
      const error = new Error('No stack error');
      const formatted = errorHandler.formatError(error, false);

      expect(formatted).toContain('No stack error');
      expect(formatted).not.toContain('at ');
    });

    it('should format custom error properties', () => {
      const error = new Error('Custom error') as Error & { details: unknown };
      error.code = 'CUSTOM_ERROR';
      error.statusCode = 400;

      const formatted = errorHandler.formatError(error);
      expect(formatted).toContain('CUSTOM_ERROR');
      expect(formatted).toContain('400');
    });
  });

  describe('getErrorStatistics', () => {
    it('should return error statistics', () => {
      // Generate some errors
      errorHandler.handleError(new Error('Error 1'));
      errorHandler.handleError(new Error('Error 2'));
      errorHandler.handleError(new Error('Error 3'), {
        operation: 'test',
        severity: ErrorSeverity.WARNING
      });

      const stats = errorHandler.getErrorStatistics();
      
      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsBySeverity[ErrorSeverity.ERROR]).toBe(2);
      expect(stats.errorsBySeverity[ErrorSeverity.WARNING]).toBe(1);
    });

    it('should track errors by operation', () => {
      errorHandler.handleError(new Error('Op1'), { operation: 'operation1' });
      errorHandler.handleError(new Error('Op1 again'), { operation: 'operation1' });
      errorHandler.handleError(new Error('Op2'), { operation: 'operation2' });

      const stats = errorHandler.getErrorStatistics();
      
      expect(stats.errorsByOperation['operation1']).toBe(2);
      expect(stats.errorsByOperation['operation2']).toBe(1);
    });

    it('should track recent errors', () => {
      errorHandler.handleError(new Error('Recent error'));
      
      const stats = errorHandler.getErrorStatistics();
      expect(stats.recentErrors.length).toBeGreaterThan(0);
      expect(stats.recentErrors[0].error.message).toBe('Recent error');
    });
  });

  describe('clearErrorHistory', () => {
    it('should clear error history', () => {
      errorHandler.handleError(new Error('Error 1'));
      errorHandler.handleError(new Error('Error 2'));

      let stats = errorHandler.getErrorStatistics();
      expect(stats.totalErrors).toBe(2);

      errorHandler.clearErrorHistory();

      stats = errorHandler.getErrorStatistics();
      expect(stats.totalErrors).toBe(0);
      expect(stats.recentErrors).toHaveLength(0);
    });
  });

  describe('setErrorFilter', () => {
    it('should filter errors based on custom logic', () => {
      // Create fresh instance to avoid singleton issues
      const freshHandler = new ErrorHandler();
      freshHandler.clearErrorHistory(); // Ensure clean state
      
      const filter = (errorResult: ErrorHandleResult) => {
        return errorResult.error.message.includes('critical');
      };

      freshHandler.setErrorFilter(filter);

      freshHandler.handleError(new Error('critical error'));
      freshHandler.handleError(new Error('minor error'));

      const stats = freshHandler.getErrorStatistics();
      expect(stats.totalErrors).toBe(1);
    });

    it('should allow all errors when filter is removed', () => {
      const filter = () => false; // Block all errors
      errorHandler.setErrorFilter(filter);

      errorHandler.handleError(new Error('blocked error'));
      expect(errorHandler.getErrorStatistics().totalErrors).toBe(0);

      errorHandler.setErrorFilter(null);
      errorHandler.handleError(new Error('allowed error'));
      expect(errorHandler.getErrorStatistics().totalErrors).toBe(1);
    });
  });

  describe('addErrorHandler', () => {
    it('should add custom error handlers', () => {
      const customHandler = vi.fn();
      errorHandler.addErrorHandler('custom', customHandler);

      errorHandler.handleError(new Error('Test error'));

      expect(customHandler).toHaveBeenCalled();
    });

    it('should call multiple error handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      errorHandler.addErrorHandler('handler1', handler1);
      errorHandler.addErrorHandler('handler2', handler2);

      errorHandler.handleError(new Error('Multiple handlers'));

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should remove error handlers', () => {
      const handler = vi.fn();
      errorHandler.addErrorHandler('removable', handler);

      errorHandler.handleError(new Error('Before removal'));
      expect(handler).toHaveBeenCalledTimes(1);

      errorHandler.removeErrorHandler('removable');
      errorHandler.handleError(new Error('After removal'));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Recovery', () => {
    it('should attempt error recovery', () => {
      const recoveryFunc = vi.fn().mockReturnValue(true);
      errorHandler.setRecoveryFunction(recoveryFunc);

      const result = errorHandler.handleError(new Error('Recoverable error'), {
        operation: 'recoverable-op',
        recoverable: true
      });

      expect(recoveryFunc).toHaveBeenCalled();
      expect(result.recovered).toBe(true);
    });

    it('should handle failed recovery', () => {
      const recoveryFunc = vi.fn().mockImplementation(() => {
        throw new Error('Recovery failed');
      });
      errorHandler.setRecoveryFunction(recoveryFunc);

      const result = errorHandler.handleError(new Error('Recovery error'), {
        operation: 'recovery-op',
        recoverable: true
      });

      expect(result.recovered).toBe(false);
    });
  });

  describe('Error Reporting', () => {
    it('should generate error reports', () => {
      // Create fresh instance to avoid state issues
      const freshHandler = new ErrorHandler();
      freshHandler.clearErrorHistory(); // Ensure clean state
      
      freshHandler.handleError(new Error('Report error 1'));
      freshHandler.handleError(new Error('Report error 2'), {
        operation: 'reporting',
        severity: ErrorSeverity.CRITICAL
      });

      const report = freshHandler.generateErrorReport();
      
      expect(report).toContain('Error Report');
      expect(report).toContain('Report error 1');
      expect(report).toContain('Report error 2');
      expect(report).toContain('critical');
    });

    it('should export errors to JSON', () => {
      errorHandler.handleError(new Error('Export error'));

      const exported = errorHandler.exportErrors();
      const parsed = JSON.parse(exported);
      
      expect(parsed.errors).toHaveLength(1);
      expect(parsed.errors[0].error.message).toBe('Export error');
    });
  });

  describe('Integration with Process Events', () => {
    it('should handle uncaught exceptions', () => {
      const originalListeners = process.listeners('uncaughtException');
      
      errorHandler.setupGlobalErrorHandling();

      // Verify handler was added
      const newListeners = process.listeners('uncaughtException');
      expect(newListeners.length).toBeGreaterThan(originalListeners.length);

      // Clean up
      errorHandler.removeGlobalErrorHandling();
    });

    it('should handle unhandled promise rejections', () => {
      const originalListeners = process.listeners('unhandledRejection');
      
      errorHandler.setupGlobalErrorHandling();

      const newListeners = process.listeners('unhandledRejection');
      expect(newListeners.length).toBeGreaterThan(originalListeners.length);

      errorHandler.removeGlobalErrorHandling();
    });
  });

  describe('Performance and Memory', () => {
    it('should limit error history size', () => {
      // Generate many errors
      for (let i = 0; i < 1000; i++) {
        errorHandler.handleError(new Error(`Error ${i}`));
      }

      const stats = errorHandler.getErrorStatistics();
      expect(stats.recentErrors.length).toBeLessThanOrEqual(100); // Default limit
    });

    it('should handle high error volumes efficiently', () => {
      const start = Date.now();

      // Generate many errors quickly
      for (let i = 0; i < 1000; i++) {
        errorHandler.handleError(new Error(`Bulk error ${i}`));
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should clean up resources properly', () => {
      errorHandler.handleError(new Error('Resource test'));
      
      // Simulate cleanup
      errorHandler.clearErrorHistory();
      
      const stats = errorHandler.getErrorStatistics();
      expect(stats.totalErrors).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle circular reference errors', () => {
      const circularError = new Error('Circular error') as Error & { circular: unknown };
      circularError.self = circularError;

      const result = errorHandler.handleError(circularError);
      expect(result.handled).toBe(true);
    });

    it('should handle errors with complex metadata', () => {
      const complexError = new Error('Complex error');
      const complexContext: ErrorContext = {
        operation: 'complex-op',
        metadata: {
          nested: {
            deep: {
              value: 'test'
            }
          },
          array: [1, 2, 3],
          date: new Date(),
          func: () => 'test'
        }
      };

      const result = errorHandler.handleError(complexError, complexContext);
      expect(result.handled).toBe(true);
    });

    it('should handle very long error messages', () => {
      const longMessage = 'x'.repeat(10000);
      const longError = new Error(longMessage);

      const result = errorHandler.handleError(longError);
      expect(result.handled).toBe(true);
      expect(result.error.message.length).toBe(10000);
    });

    it('should handle errors during error handling', () => {
      // Mock logger to throw
      mockLogger.error.mockImplementation(() => {
        throw new Error('Logger error');
      });

      const result = errorHandler.handleError(new Error('Original error'));
      // Should still handle the original error despite logger issues
      expect(result.handled).toBe(true);
    });
  });
});