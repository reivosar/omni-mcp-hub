import { ILogger } from './logger.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface MCPErrorContext {
  operation: string;
  toolName?: string;
  resourceUri?: string;
  serverName?: string;
  args?: unknown;
}

export class MCPError extends Error {
  public readonly context: MCPErrorContext;
  public readonly timestamp: string;
  public readonly stack?: string;

  constructor(message: string, context: MCPErrorContext, originalError?: Error) {
    super(message);
    this.name = 'MCPError';
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
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  static getInstance(logger: ILogger): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler(logger);
    }
    return ErrorHandler.instance;
  }

  async withErrorHandling<T>(
    operation: MCPOperation<T>,
    context: MCPErrorContext
  ): Promise<T> {
    try {
      this.logger.debug(`[ERROR-HANDLER] Starting operation: ${context.operation}`);
      const result = await operation();
      this.logger.debug(`[ERROR-HANDLER] Operation completed: ${context.operation}`);
      return result;
    } catch (error) {
      const mcpError = this.createMCPError(error, context);
      this.logError(mcpError);
      throw mcpError;
    }
  }

  wrapToolCall(
    operation: MCPOperation<CallToolResult>,
    context: MCPErrorContext
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
      originalError
    );
  }

  private createErrorResponse(error: MCPError, context: MCPErrorContext): CallToolResult {
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `${error.message}\n\nContext: ${JSON.stringify(context, null, 2)}\n\nStack: ${error.stack}`
      : 'An internal error occurred. Please check the logs for details.';

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

    this.logger.error('[MCP-ERROR]', JSON.stringify(logData, null, 2));

    // Log metrics for monitoring
    this.logMetrics(error);
  }

  private logMetrics(error: MCPError): void {
    const metrics = {
      type: 'mcp_error',
      operation: error.context.operation,
      tool_name: error.context.toolName,
      server_name: error.context.serverName,
      timestamp: error.timestamp,
    };

    this.logger.info('[MCP-METRICS]', JSON.stringify(metrics));
  }

  logOperationSuccess(context: MCPErrorContext, duration?: number): void {
    const metrics = {
      type: 'mcp_success',
      operation: context.operation,
      tool_name: context.toolName,
      server_name: context.serverName,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };

    this.logger.info('[MCP-METRICS]', JSON.stringify(metrics));
  }
}

export const createStandardErrorResponse = (message: string, isError = true): CallToolResult => {
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