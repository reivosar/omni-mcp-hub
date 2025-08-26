import { ILogger } from "./logger.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface MCPErrorContext {
  operation: string;
  toolName?: string;
  resourceUri?: string;
  serverName?: string;
  args?: unknown;
}

export interface ErrorContext {
  operation: string;
  component?: string;
  severity?: ErrorSeverity;
  userId?: string;
  userAction?: string;
  metadata?: Record<string, unknown>;
  timeout?: number;
  timestamp?: string;
  recoverable?: boolean;
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
}

export interface ErrorHandleResult {
  handled: boolean;
  errorId: string;
  error: Error;
  context?: ErrorContext;
  severity?: ErrorSeverity;
  timestamp: string;
  recovered?: boolean;
}

export interface ErrorStatistics {
  totalErrors: number;
  errorsByOperation: Record<string, number>;
  errorsByComponent: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  recentErrors: ErrorHandleResult[];
  lastErrorTime?: string;
}

export type ErrorFilter = (error: ErrorHandleResult) => boolean;
export type CustomErrorHandler = (error: ErrorHandleResult) => void;
export type RecoveryFunction = (error: Error, context: ErrorContext) => boolean;

export class MCPError extends Error {
  public readonly context: MCPErrorContext;
  public readonly timestamp: string;
  public readonly stack?: string;

  constructor(
    message: string,
    context: MCPErrorContext,
    originalError?: Error,
  ) {
    super(message);
    this.name = "MCPError";
    this.context = context;
    this.timestamp = new Date().toISOString();

    if (originalError) {
      this.stack = originalError.stack;
      this.cause = originalError;
    }
  }
}

export type MCPOperation<T> = () => Promise<T>;

export class ErrorHandler {
  private static instance: ErrorHandler;
  private logger?: ILogger;
  private errorHistory: ErrorHandleResult[] = [];
  private errorFilter?: ErrorFilter;
  private customErrorHandlers: Map<string, CustomErrorHandler> = new Map();
  private recoveryFunction?: RecoveryFunction;
  private uncaughtExceptionHandler?: (error: Error) => void;
  private unhandledRejectionHandler?: (reason: unknown) => void;

  constructor(logger?: ILogger) {
    this.logger = logger;
    // Initialize fresh arrays for each instance
    this.errorHistory = [];
    this.customErrorHandlers = new Map();

    // Reset static instance when creating a new one for testing
    if (process.env.NODE_ENV === "test") {
      ErrorHandler.instance = this;
    }
  }

  static getInstance(logger?: ILogger): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler(logger);
    }
    return ErrorHandler.instance;
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === "string") {
      return new Error(error);
    }
    if (error === null || error === undefined) {
      return new Error("Unknown error occurred");
    }
    return new Error(String(error));
  }

  handleError(error: unknown, context?: ErrorContext): ErrorHandleResult {
    const normalizedError = this.normalizeError(error);
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();
    const severity = context?.severity ?? ErrorSeverity.ERROR;

    let recovered = false;

    // Attempt recovery if context allows and recovery function is set
    if (context?.recoverable && this.recoveryFunction) {
      try {
        recovered = this.recoveryFunction(normalizedError, context);
      } catch (recoveryError) {
        console.error("Recovery function failed:", recoveryError);
      }
    }

    const result: ErrorHandleResult = {
      handled: true,
      errorId,
      error: normalizedError,
      context,
      severity,
      timestamp,
      recovered,
    };

    // Apply error filter if set - if filter returns false, don't add to history
    if (this.errorFilter && !this.errorFilter(result)) {
      // Return result but don't add to history or call handlers
      return { ...result, handled: false };
    }

    // Add to error history
    this.errorHistory.push(result);

    // Keep history limited to 1000 entries
    if (this.errorHistory.length > 1000) {
      this.errorHistory = this.errorHistory.slice(-1000);
    }

    // Call custom error handlers
    this.customErrorHandlers.forEach((handler) => {
      try {
        handler(result);
      } catch (handlerError) {
        // Don't let handler errors break the main error handling
        console.error("Custom error handler failed:", handlerError);
      }
    });

    // Log the error
    if (this.logger) {
      try {
        const logData = {
          errorId,
          operation: context?.operation ?? "unknown",
          message: normalizedError.message,
          severity,
          context,
          timestamp,
          stack: normalizedError.stack,
          recovered,
        };
        this.logger.error("[ERROR-HANDLER]", JSON.stringify(logData, null, 2));
      } catch (_loggerError) {
        // Don't let logger errors break the main error handling
        console.error("Logger error during error handling:", _loggerError);
      }
    }

    return result;
  }

  async handleAsyncError<T>(
    promise: Promise<T>,
    context?: ErrorContext,
  ): Promise<T | ErrorHandleResult> {
    try {
      if (context?.timeout) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(new Error(`Operation timeout after ${context.timeout}ms`)),
            context.timeout,
          );
        });
        return await Promise.race([promise, timeoutPromise]);
      }
      return await promise;
    } catch (error) {
      return this.handleError(error, context);
    }
  }

  wrapFunction<T extends unknown[], R>(
    fn: (...args: T) => R,
    context: ErrorContext,
  ): (...args: T) => R | undefined {
    return (...args: T) => {
      try {
        return fn(...args);
      } catch (error) {
        this.handleError(error, context);
        return undefined;
      }
    };
  }

  wrapAsyncFunction<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    context: ErrorContext,
  ): (...args: T) => Promise<R | undefined> {
    return async (...args: T) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleError(error, context);
        return undefined;
      }
    };
  }

  createErrorContext(
    operation: string,
    component?: string,
    severity?: ErrorSeverity,
    userId?: string,
    userAction?: string,
    metadata?: Record<string, unknown>,
  ): ErrorContext {
    return {
      operation,
      component,
      severity: severity ?? ErrorSeverity.ERROR,
      userId,
      userAction,
      metadata,
      timestamp: new Date().toISOString(),
    };
  }

  isRetryableError(error: Error): boolean {
    const retryableCodes = [
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "ECONNRESET",
      "EPIPE",
    ];
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

    // Check error code
    const errorWithCode = error as Error & { code?: string };
    if (errorWithCode.code && retryableCodes.includes(errorWithCode.code)) {
      return true;
    }

    // Check status code
    const errorWithStatus = error as Error & { status?: number };
    if (
      errorWithStatus.status &&
      retryableStatusCodes.includes(errorWithStatus.status)
    ) {
      return true;
    }

    // Check message for known retryable patterns
    const retryableMessages = [
      "ECONNREFUSED",
      "ETIMEDOUT",
      "timeout",
      "network",
    ];
    return retryableMessages.some((pattern) => error.message.includes(pattern));
  }

  formatError(error: Error, includeStack = true): string {
    let formatted = `${error.name}: ${error.message}`;

    const errorWithCode = error as Error & {
      code?: string;
      statusCode?: number;
    };
    if (errorWithCode.code) {
      formatted += ` (Code: ${errorWithCode.code})`;
    }
    if (errorWithCode.statusCode) {
      formatted += ` (Status: ${errorWithCode.statusCode})`;
    }

    if (includeStack && error.stack) {
      formatted += `\nStack trace:\n${error.stack}`;
    }

    return formatted;
  }

  getErrorStatistics(): ErrorStatistics {
    const stats: ErrorStatistics = {
      totalErrors: this.errorHistory.length,
      errorsByOperation: {},
      errorsByComponent: {},
      errorsBySeverity: {},
      recentErrors: this.errorHistory.slice(-20),
    };

    if (this.errorHistory.length > 0) {
      stats.lastErrorTime =
        this.errorHistory[this.errorHistory.length - 1].timestamp;
    }

    this.errorHistory.forEach((errorResult) => {
      const operation = errorResult.context?.operation || "unknown";
      const component = errorResult.context?.component || "unknown";
      const severity = errorResult.severity || "unknown";

      stats.errorsByOperation[operation] =
        (stats.errorsByOperation[operation] || 0) + 1;
      stats.errorsByComponent[component] =
        (stats.errorsByComponent[component] || 0) + 1;
      stats.errorsBySeverity[severity] =
        (stats.errorsBySeverity[severity] || 0) + 1;
    });

    return stats;
  }

  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  setErrorFilter(filter?: ErrorFilter): void {
    this.errorFilter = filter;
  }

  addErrorHandler(id: string, handler: CustomErrorHandler): void {
    this.customErrorHandlers.set(id, handler);
  }

  removeErrorHandler(id: string): boolean {
    return this.customErrorHandlers.delete(id);
  }

  setRecoveryFunction(recoveryFunction?: RecoveryFunction): void {
    this.recoveryFunction = recoveryFunction;
  }

  generateErrorReport(): string {
    const stats = this.getErrorStatistics();
    const recentErrorMessages = stats.recentErrors
      .map((error) => `  - ${error.error.message} (${error.severity})`)
      .join("\n");

    const report = `
Error Report Generated: ${new Date().toISOString()}
Total Errors: ${stats.totalErrors}
Recent Errors: ${stats.recentErrors.length}

Recent Error Messages:
${recentErrorMessages}

Errors by Operation:
${Object.entries(stats.errorsByOperation)
  .map(([op, count]) => `  ${op}: ${count}`)
  .join("\n")}

Errors by Component:
${Object.entries(stats.errorsByComponent)
  .map(([comp, count]) => `  ${comp}: ${count}`)
  .join("\n")}

Errors by Severity:
${Object.entries(stats.errorsBySeverity)
  .map(([sev, count]) => `  ${sev}: ${count}`)
  .join("\n")}
`.trim();

    return report;
  }

  exportErrors(): string {
    return JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        errors: this.errorHistory.slice(-50).map((error) => ({
          errorId: error.errorId,
          error: {
            message: error.error.message,
            name: error.error.name,
            stack: error.error.stack,
          },
          severity: error.severity,
          operation: error.context?.operation,
          timestamp: error.timestamp,
          recovered: error.recovered,
        })),
        statistics: this.getErrorStatistics(),
      },
      null,
      2,
    );
  }

  exportErrorsToJSON(): string {
    return this.exportErrors();
  }

  setupGlobalErrorHandling(): void {
    // Create handlers and store references for cleanup
    this.uncaughtExceptionHandler = (error: Error) => {
      this.handleError(error, {
        operation: "uncaught-exception",
        severity: ErrorSeverity.CRITICAL,
        component: "process",
      });
    };

    this.unhandledRejectionHandler = (reason: unknown) => {
      this.handleError(reason, {
        operation: "unhandled-rejection",
        severity: ErrorSeverity.CRITICAL,
        component: "process",
      });
    };

    process.on("uncaughtException", this.uncaughtExceptionHandler);
    process.on("unhandledRejection", this.unhandledRejectionHandler);
  }

  removeGlobalErrorHandling(): void {
    if (this.uncaughtExceptionHandler) {
      process.removeListener(
        "uncaughtException",
        this.uncaughtExceptionHandler,
      );
      this.uncaughtExceptionHandler = undefined;
    }

    if (this.unhandledRejectionHandler) {
      process.removeListener(
        "unhandledRejection",
        this.unhandledRejectionHandler,
      );
      this.unhandledRejectionHandler = undefined;
    }
  }

  setupProcessEventHandlers(): void {
    this.setupGlobalErrorHandling();
  }

  async withErrorHandling<T>(
    operation: MCPOperation<T>,
    context: MCPErrorContext,
  ): Promise<T> {
    try {
      this.logger?.debug(
        `[ERROR-HANDLER] Starting operation: ${context.operation}`,
      );
      const result = await operation();
      this.logger?.debug(
        `[ERROR-HANDLER] Operation completed: ${context.operation}`,
      );
      return result;
    } catch (error) {
      const mcpError = this.createMCPError(error, context);
      this.logError(mcpError);
      throw mcpError;
    }
  }

  wrapToolCall(
    operation: MCPOperation<CallToolResult>,
    context: MCPErrorContext,
  ): Promise<CallToolResult> {
    return this.withErrorHandling(operation, context).catch((error) => {
      return this.createErrorResponse(error, context);
    });
  }

  private createMCPError(error: unknown, context: MCPErrorContext): MCPError {
    const message = error instanceof Error ? error.message : String(error);
    const originalError = error instanceof Error ? error : undefined;

    return new MCPError(
      `${context.operation} failed: ${message}`,
      context,
      originalError,
    );
  }

  private createErrorResponse(
    error: MCPError,
    context: MCPErrorContext,
  ): CallToolResult {
    const errorMessage =
      process.env.NODE_ENV === "development"
        ? `${error.message}\n\nContext: ${JSON.stringify(context, null, 2)}\n\nStack: ${error.stack}`
        : "An internal error occurred. Please check the logs for details.";

    return {
      content: [
        {
          type: "text",
          text: errorMessage,
        },
      ],
      isError: true,
    };
  }

  private logError(error: MCPError): void {
    const logData = {
      operation: error.context.operation,
      message: error.message,
      context: error.context,
      timestamp: error.timestamp,
      stack: error.stack,
    };

    try {
      this.logger?.error("[MCP-ERROR]", JSON.stringify(logData, null, 2));
    } catch (_loggerError) {
      console.error("Logger error during MCP error logging:", _loggerError);
    }

    // Log metrics for monitoring
    this.logMetrics(error);
  }

  private logMetrics(error: MCPError): void {
    const metrics = {
      type: "mcp_error",
      operation: error.context.operation,
      tool_name: error.context.toolName,
      server_name: error.context.serverName,
      timestamp: error.timestamp,
    };

    try {
      this.logger?.info("[MCP-METRICS]", JSON.stringify(metrics));
    } catch (_loggerError) {
      console.error("Logger error during metrics logging:", _loggerError);
    }
  }

  logOperationSuccess(context: MCPErrorContext, duration?: number): void {
    const metrics = {
      type: "mcp_success",
      operation: context.operation,
      tool_name: context.toolName,
      server_name: context.serverName,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };

    try {
      this.logger?.info("[MCP-METRICS]", JSON.stringify(metrics));
    } catch (_loggerError) {
      console.error(
        "Logger error during success metrics logging:",
        _loggerError,
      );
    }
  }
}

export const createStandardErrorResponse = (
  message: string,
  isError = true,
): CallToolResult => {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError,
  };
};
