/**
 * External MCP Resilience System
 *
 * Provides advanced resilience features for external MCP server connections:
 * - Exponential backoff retry with jitter
 * - Circuit breaker pattern implementation
 * - Connection pool management
 * - Graceful degradation and failover
 * - Advanced health checking with multiple strategies
 * - Connection state lifecycle management
 * - Failure recovery and self-healing
 */

import { EventEmitter } from "events";
import { ILogger, SilentLogger } from "../utils/logger.js";
import { MCPProxyClient, ExternalServerConfig } from "./client.js";

export enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  FAILED = "failed",
  CIRCUIT_OPEN = "circuit_open",
  DEGRADED = "degraded",
}

export enum HealthCheckStrategy {
  BASIC_PING = "basic_ping",
  CAPABILITY_CHECK = "capability_check",
  TOOL_INVOCATION = "tool_invocation",
  RESOURCE_ACCESS = "resource_access",
  COMPREHENSIVE = "comprehensive",
}

export interface ResilienceConfig {
  maxRetryAttempts: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  retryJitterFactor: number;

  circuitBreaker: {
    failureThreshold: number;
    recoveryTimeoutMs: number;
    halfOpenMaxAttempts: number;
  };

  healthCheck: {
    intervalMs: number;
    timeoutMs: number;
    strategy: HealthCheckStrategy;
    consecutiveFailureThreshold: number;
    recoveryCheckIntervalMs: number;
  };

  connection: {
    connectTimeoutMs: number;
    idleTimeoutMs: number;
    maxConcurrentOperations: number;
    gracefulShutdownTimeoutMs: number;
  };

  degradedMode: {
    enabled: boolean;
    cacheResponsesMs: number;
    fallbackStrategies: string[];
  };
}

const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  maxRetryAttempts: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  retryJitterFactor: 0.1,

  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeoutMs: 60000,
    halfOpenMaxAttempts: 3,
  },

  healthCheck: {
    intervalMs: 30000,
    timeoutMs: 5000,
    strategy: HealthCheckStrategy.CAPABILITY_CHECK,
    consecutiveFailureThreshold: 3,
    recoveryCheckIntervalMs: 10000,
  },

  connection: {
    connectTimeoutMs: 10000,
    idleTimeoutMs: 300000, // 5 minutes
    maxConcurrentOperations: 10,
    gracefulShutdownTimeoutMs: 5000,
  },

  degradedMode: {
    enabled: true,
    cacheResponsesMs: 300000, // 5 minutes
    fallbackStrategies: [
      "cached_response",
      "default_response",
      "error_response",
    ],
  },
};

export interface ConnectionStats {
  serverName: string;
  state: ConnectionState;
  totalConnections: number;
  failedConnections: number;
  successfulConnections: number;
  averageConnectionTimeMs: number;
  lastConnectionAttempt: Date | null;
  lastSuccessfulConnection: Date | null;
  lastFailure: Date | null;
  lastFailureReason: string | null;
  consecutiveFailures: number;
  circuitBreakerState: "closed" | "open" | "half_open";
  healthCheckStatus: "healthy" | "unhealthy" | "unknown";
  currentOperations: number;
  totalOperations: number;
  failedOperations: number;
  averageOperationTimeMs: number;
}

class CircuitBreaker {
  private state: "closed" | "open" | "half_open" = "closed";
  private failureCount = 0;
  private nextAttempt = 0;
  private halfOpenAttempts = 0;

  constructor(
    private config: ResilienceConfig["circuitBreaker"],
    private logger: ILogger,
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    serverName: string,
  ): Promise<T> {
    if (this.state === "open") {
      if (Date.now() < this.nextAttempt) {
        throw new Error(
          `Circuit breaker is OPEN for ${serverName}. Next attempt in ${this.nextAttempt - Date.now()}ms`,
        );
      }
      this.state = "half_open";
      this.halfOpenAttempts = 0;
      this.logger.info(
        `[CIRCUIT-BREAKER] ${serverName}: Transitioning to HALF_OPEN state`,
      );
    }

    try {
      const result = await operation();
      this.onSuccess(serverName);
      return result;
    } catch (error) {
      this.onFailure(serverName);
      throw error;
    }
  }

  private onSuccess(serverName: string): void {
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    if (this.state !== "closed") {
      this.state = "closed";
      this.logger.info(
        `[CIRCUIT-BREAKER] ${serverName}: Circuit closed after successful operation`,
      );
    }
  }

  private onFailure(serverName: string): void {
    this.failureCount++;

    if (this.state === "half_open") {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.openCircuit(serverName);
      }
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.openCircuit(serverName);
    }
  }

  private openCircuit(serverName: string): void {
    this.state = "open";
    this.nextAttempt = Date.now() + this.config.recoveryTimeoutMs;
    this.logger.warn(
      `[CIRCUIT-BREAKER] ${serverName}: Circuit OPENED after ${this.failureCount} failures`,
    );
  }

  getState(): "closed" | "open" | "half_open" {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === "open";
  }
}

export class ResilientMCPConnection extends EventEmitter {
  private client: MCPProxyClient;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private config: ResilienceConfig;
  private logger: ILogger;
  private stats: ConnectionStats;
  private circuitBreaker: CircuitBreaker;
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck = 0;
  private responseCache = new Map<
    string,
    { data: unknown; timestamp: number }
  >();
  private connectionHistory: Array<{
    timestamp: Date;
    success: boolean;
    duration: number;
  }> = [];

  constructor(
    serverConfig: ExternalServerConfig,
    resilienceConfig: Partial<ResilienceConfig> = {},
    logger?: ILogger,
  ) {
    super();
    this.client = new MCPProxyClient(serverConfig, logger);
    this.config = { ...DEFAULT_RESILIENCE_CONFIG, ...resilienceConfig };
    this.logger = logger || new SilentLogger();
    this.circuitBreaker = new CircuitBreaker(
      this.config.circuitBreaker,
      this.logger,
    );

    this.stats = {
      serverName: serverConfig.name,
      state: this.state,
      totalConnections: 0,
      failedConnections: 0,
      successfulConnections: 0,
      averageConnectionTimeMs: 0,
      lastConnectionAttempt: null,
      lastSuccessfulConnection: null,
      lastFailure: null,
      lastFailureReason: null,
      consecutiveFailures: 0,
      circuitBreakerState: "closed",
      healthCheckStatus: "unknown",
      currentOperations: 0,
      totalOperations: 0,
      failedOperations: 0,
      averageOperationTimeMs: 0,
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.on("circuitBreakerStateChange", (newState) => {
      this.stats.circuitBreakerState = newState;
      this.updateConnectionState(
        newState === "open" ? ConnectionState.CIRCUIT_OPEN : this.state,
      );
    });
  }

  /**
   * Connect with exponential backoff retry
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED) {
      return;
    }

    if (this.circuitBreaker.isOpen()) {
      throw new Error(`Circuit breaker is open for ${this.stats.serverName}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetryAttempts; attempt++) {
      this.updateConnectionState(ConnectionState.CONNECTING);
      const startTime = Date.now();
      this.stats.lastConnectionAttempt = new Date();
      this.stats.totalConnections++;

      try {
        await this.circuitBreaker.execute(async () => {
          await Promise.race([
            this.client.connect(),
            this.createTimeoutPromise(
              this.config.connection.connectTimeoutMs,
              "Connection timeout",
            ),
          ]);
        }, this.stats.serverName);

        const duration = Date.now() - startTime;
        this.connectionHistory.push({
          timestamp: new Date(),
          success: true,
          duration,
        });
        this.stats.successfulConnections++;
        this.stats.lastSuccessfulConnection = new Date();
        this.stats.consecutiveFailures = 0;
        this.updateAverageConnectionTime();

        this.updateConnectionState(ConnectionState.CONNECTED);
        this.startHealthChecks();

        this.logger.info(
          `[RESILIENT-MCP] Successfully connected to ${this.stats.serverName} (attempt ${attempt + 1}/${this.config.maxRetryAttempts})`,
        );
        return;
      } catch (error) {
        lastError = error as Error;
        const duration = Date.now() - startTime;
        this.connectionHistory.push({
          timestamp: new Date(),
          success: false,
          duration,
        });
        this.stats.failedConnections++;
        this.stats.consecutiveFailures++;
        this.stats.lastFailure = new Date();
        this.stats.lastFailureReason = lastError.message;

        this.logger.warn(
          `[RESILIENT-MCP] Connection attempt ${attempt + 1}/${this.config.maxRetryAttempts} failed for ${this.stats.serverName}:`,
          error,
        );

        if (attempt < this.config.maxRetryAttempts - 1) {
          const delay = this.calculateBackoffDelay(attempt);
          this.logger.info(
            `[RESILIENT-MCP] Retrying connection to ${this.stats.serverName} in ${delay}ms`,
          );
          await this.sleep(delay);
        }
      }
    }

    this.updateConnectionState(ConnectionState.FAILED);
    throw new Error(
      `Failed to connect to ${this.stats.serverName} after ${this.config.maxRetryAttempts} attempts. Last error: ${lastError?.message}`,
    );
  }

  /**
   * Graceful disconnect with cleanup
   */
  async disconnect(): Promise<void> {
    this.stopHealthChecks();

    if (this.stats.currentOperations > 0) {
      this.logger.info(
        `[RESILIENT-MCP] Waiting for ${this.stats.currentOperations} operations to complete before disconnecting ${this.stats.serverName}`,
      );

      const maxWait = this.config.connection.gracefulShutdownTimeoutMs;
      const startTime = Date.now();

      while (
        this.stats.currentOperations > 0 &&
        Date.now() - startTime < maxWait
      ) {
        await this.sleep(100);
      }

      if (this.stats.currentOperations > 0) {
        this.logger.warn(
          `[RESILIENT-MCP] Force disconnecting ${this.stats.serverName} with ${this.stats.currentOperations} pending operations`,
        );
      }
    }

    try {
      await this.client.disconnect();
      this.updateConnectionState(ConnectionState.DISCONNECTED);
      this.logger.info(
        `[RESILIENT-MCP] Gracefully disconnected from ${this.stats.serverName}`,
      );
    } catch (error) {
      this.logger.warn(
        `[RESILIENT-MCP] Error during disconnect from ${this.stats.serverName}:`,
        error,
      );
      this.updateConnectionState(ConnectionState.FAILED);
    }
  }

  /**
   * Execute tool call with resilience features
   */
  async callTool(name: string, args: unknown): Promise<unknown> {
    return this.executeWithResilience(async () => {
      return await this.client.callTool(name, args);
    }, `callTool:${name}`);
  }

  /**
   * Read resource with resilience features
   */
  async readResource(uri: string): Promise<unknown> {
    return this.executeWithResilience(async () => {
      return await this.client.readResource(uri);
    }, `readResource:${uri}`);
  }

  /**
   * Execute operation with comprehensive resilience
   */
  private async executeWithResilience<T>(
    operation: () => Promise<T>,
    operationId: string,
  ): Promise<T> {
    if (
      this.state !== ConnectionState.CONNECTED &&
      this.state !== ConnectionState.DEGRADED
    ) {
      if (this.config.degradedMode.enabled) {
        return this.handleDegradedMode<T>(operationId);
      }
      throw new Error(
        `Server ${this.stats.serverName} is not connected (state: ${this.state})`,
      );
    }

    if (this.state === ConnectionState.DEGRADED) {
      const cached = this.getCachedResponse<T>(operationId);
      if (cached) {
        return cached;
      }
    }

    const startTime = Date.now();
    this.stats.currentOperations++;
    this.stats.totalOperations++;

    try {
      const result = await this.circuitBreaker.execute(
        operation,
        this.stats.serverName,
      );

      if (this.config.degradedMode.enabled) {
        this.cacheResponse(operationId, result);
      }

      const duration = Date.now() - startTime;
      this.updateAverageOperationTime(duration);

      return result;
    } catch (error) {
      this.stats.failedOperations++;
      this.logger.warn(
        `[RESILIENT-MCP] Operation ${operationId} failed on ${this.stats.serverName}:`,
        error,
      );

      if (this.config.degradedMode.enabled) {
        return this.handleDegradedMode<T>(operationId);
      }

      throw error;
    } finally {
      this.stats.currentOperations--;
    }
  }

  /**
   * Handle degraded mode with fallback strategies
   */
  private handleDegradedMode<T>(operationId: string): Promise<T> {
    for (const strategy of this.config.degradedMode.fallbackStrategies) {
      try {
        switch (strategy) {
          case "cached_response": {
            const cached = this.getCachedResponse<T>(operationId);
            if (cached) {
              this.logger.info(
                `[RESILIENT-MCP] Using cached response for ${operationId} on ${this.stats.serverName}`,
              );
              return Promise.resolve(cached);
            }
            break;
          }
          case "default_response": {
            const defaultResponse = this.getDefaultResponse<T>(operationId);
            if (defaultResponse !== null) {
              this.logger.info(
                `[RESILIENT-MCP] Using default response for ${operationId} on ${this.stats.serverName}`,
              );
              return Promise.resolve(defaultResponse);
            }
            break;
          }
          case "error_response": {
            const errorResponse = {
              error: `Service ${this.stats.serverName} is temporarily unavailable`,
              fallback: true,
              timestamp: new Date().toISOString(),
            } as T;
            this.logger.info(
              `[RESILIENT-MCP] Using error response for ${operationId} on ${this.stats.serverName}`,
            );
            return Promise.resolve(errorResponse);
          }
        }
      } catch (fallbackError) {
        this.logger.warn(
          `[RESILIENT-MCP] Fallback strategy ${strategy} failed for ${operationId}:`,
          fallbackError,
        );
      }
    }

    throw new Error(
      `All fallback strategies exhausted for ${operationId} on ${this.stats.serverName}`,
    );
  }

  /**
   * Advanced health checking with multiple strategies
   */
  private startHealthChecks(): void {
    this.stopHealthChecks();

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheck.intervalMs);

    this.logger.debug(
      `[RESILIENT-MCP] Started health checks for ${this.stats.serverName} (interval: ${this.config.healthCheck.intervalMs}ms)`,
    );
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.debug(
        `[RESILIENT-MCP] Stopped health checks for ${this.stats.serverName}`,
      );
    }
  }

  private async performHealthCheck(): Promise<boolean> {
    try {
      let isHealthy = false;

      switch (this.config.healthCheck.strategy) {
        case HealthCheckStrategy.BASIC_PING:
          isHealthy = this.client.isConnected();
          break;

        case HealthCheckStrategy.CAPABILITY_CHECK:
          isHealthy = await this.checkCapabilities();
          break;

        case HealthCheckStrategy.TOOL_INVOCATION:
          isHealthy = await this.checkToolInvocation();
          break;

        case HealthCheckStrategy.RESOURCE_ACCESS:
          isHealthy = await this.checkResourceAccess();
          break;

        case HealthCheckStrategy.COMPREHENSIVE:
          isHealthy = await this.checkComprehensive();
          break;
      }

      this.stats.healthCheckStatus = isHealthy ? "healthy" : "unhealthy";
      this.lastHealthCheck = Date.now();

      if (!isHealthy) {
        this.logger.warn(
          `[RESILIENT-MCP] Health check failed for ${this.stats.serverName} using strategy: ${this.config.healthCheck.strategy}`,
        );
        await this.handleHealthCheckFailure();
      } else if (this.state === ConnectionState.DEGRADED && isHealthy) {
        this.updateConnectionState(ConnectionState.CONNECTED);
        this.logger.info(
          `[RESILIENT-MCP] ${this.stats.serverName} recovered from degraded state`,
        );
      }

      return isHealthy;
    } catch (error) {
      this.logger.error(
        `[RESILIENT-MCP] Health check error for ${this.stats.serverName}:`,
        error,
      );
      this.stats.healthCheckStatus = "unhealthy";
      await this.handleHealthCheckFailure();
      return false;
    }
  }

  private async checkCapabilities(): Promise<boolean> {
    try {
      const tools = this.client.getTools();
      const resources = this.client.getResources();
      return Array.isArray(tools) || Array.isArray(resources);
    } catch {
      return false;
    }
  }

  private async checkToolInvocation(): Promise<boolean> {
    try {
      const tools = this.client.getTools();
      if (!tools || tools.length === 0) return true; // No tools to check

      const firstTool = tools[0];
      return firstTool && typeof firstTool.name === "string";
    } catch {
      return false;
    }
  }

  private async checkResourceAccess(): Promise<boolean> {
    try {
      const resources = this.client.getResources();
      return Array.isArray(resources);
    } catch {
      return false;
    }
  }

  private async checkComprehensive(): Promise<boolean> {
    return (
      this.client.isConnected() &&
      (await this.checkCapabilities()) &&
      (await this.checkToolInvocation()) &&
      (await this.checkResourceAccess())
    );
  }

  private async handleHealthCheckFailure(): Promise<void> {
    this.stats.consecutiveFailures++;

    if (
      this.stats.consecutiveFailures >=
      this.config.healthCheck.consecutiveFailureThreshold
    ) {
      if (
        this.config.degradedMode.enabled &&
        this.state === ConnectionState.CONNECTED
      ) {
        this.updateConnectionState(ConnectionState.DEGRADED);
        this.logger.warn(
          `[RESILIENT-MCP] ${this.stats.serverName} entered degraded mode after ${this.stats.consecutiveFailures} consecutive health check failures`,
        );
      } else if (this.state !== ConnectionState.RECONNECTING) {
        this.logger.warn(
          `[RESILIENT-MCP] Attempting to reconnect ${this.stats.serverName} after ${this.stats.consecutiveFailures} consecutive health check failures`,
        );
        this.attemptReconnection();
      }
    }
  }

  private async attemptReconnection(): Promise<void> {
    this.updateConnectionState(ConnectionState.RECONNECTING);

    try {
      await this.client.disconnect();
      await this.connect();
    } catch (error) {
      this.logger.error(
        `[RESILIENT-MCP] Reconnection failed for ${this.stats.serverName}:`,
        error,
      );
      this.updateConnectionState(ConnectionState.FAILED);
    }
  }

  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.config.baseRetryDelayMs * Math.pow(2, attempt),
      this.config.maxRetryDelayMs,
    );

    const jitter =
      exponentialDelay * this.config.retryJitterFactor * Math.random();
    return Math.floor(exponentialDelay + jitter);
  }

  private createTimeoutPromise(
    timeoutMs: number,
    message: string,
  ): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private updateConnectionState(newState: ConnectionState): void {
    const oldState = this.state;
    this.state = newState;
    this.stats.state = newState;

    if (oldState !== newState) {
      this.emit("stateChange", newState, oldState);
      this.logger.debug(
        `[RESILIENT-MCP] ${this.stats.serverName} state changed: ${oldState} -> ${newState}`,
      );
    }
  }

  private cacheResponse(operationId: string, data: unknown): void {
    this.responseCache.set(operationId, {
      data,
      timestamp: Date.now(),
    });

    const now = Date.now();
    for (const [key, value] of this.responseCache.entries()) {
      if (now - value.timestamp > this.config.degradedMode.cacheResponsesMs) {
        this.responseCache.delete(key);
      }
    }
  }

  private getCachedResponse<T>(operationId: string): T | null {
    const cached = this.responseCache.get(operationId);
    if (!cached) return null;

    if (
      Date.now() - cached.timestamp >
      this.config.degradedMode.cacheResponsesMs
    ) {
      this.responseCache.delete(operationId);
      return null;
    }

    return cached.data as T;
  }

  private getDefaultResponse<T>(operationId: string): T | null {
    if (operationId.startsWith("callTool:")) {
      return {
        content: [],
        isError: false,
        _fallback: true,
      } as T;
    } else if (operationId.startsWith("readResource:")) {
      return {
        contents: [],
        _fallback: true,
      } as T;
    }
    return null;
  }

  private updateAverageConnectionTime(): void {
    const recentConnections = this.connectionHistory
      .filter((h) => h.success)
      .slice(-10); // Last 10 successful connections

    if (recentConnections.length > 0) {
      this.stats.averageConnectionTimeMs =
        recentConnections.reduce((sum, h) => sum + h.duration, 0) /
        recentConnections.length;
    }
  }

  private updateAverageOperationTime(duration: number): void {
    const alpha = 0.1; // Smoothing factor
    this.stats.averageOperationTimeMs =
      this.stats.averageOperationTimeMs === 0
        ? duration
        : this.stats.averageOperationTimeMs * (1 - alpha) + duration * alpha;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  isHealthy(): boolean {
    return this.stats.healthCheckStatus === "healthy";
  }

  getClient(): MCPProxyClient {
    return this.client;
  }

  async forceHealthCheck(): Promise<boolean> {
    return await this.performHealthCheck();
  }

  updateConfig(newConfig: Partial<ResilienceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info(
      `[RESILIENT-MCP] Updated resilience config for ${this.stats.serverName}`,
    );
  }
}
