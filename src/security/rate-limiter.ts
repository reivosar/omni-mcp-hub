/**
 * Rate Limiting and DoS Protection System
 * Provides comprehensive rate limiting, request throttling, and DoS attack mitigation
 */

import { EventEmitter } from "events";
import { ILogger, SilentLogger } from "../utils/logger.js";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: unknown) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (key: string, info: RateLimitInfo) => void;
}

export interface RateLimitInfo {
  totalHits: number;
  totalRequests: number;
  resetTime: number;
  remaining: number;
  msBeforeNext: number;
}

export interface DoSProtectionConfig {
  enabled: boolean;
  maxConcurrentRequests: number;
  suspiciousThreshold: number;
  blockDuration: number;
  whitelistedIPs?: string[];
  blacklistedIPs?: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringWindow: number;
}

interface RequestRecord {
  timestamp: number;
  success: boolean;
  responseTime: number;
  size?: number;
}

interface ClientInfo {
  requests: RequestRecord[];
  blocked: boolean;
  blockedUntil: number;
  suspicionLevel: number;
  consecutiveFailures: number;
}

export enum RateLimitResult {
  ALLOWED = "allowed",
  BLOCKED = "blocked",
  SUSPICIOUS = "suspicious",
}

export class RateLimiter extends EventEmitter {
  private clients: Map<string, ClientInfo> = new Map();
  private config: Required<RateLimitConfig>;
  private cleanupInterval: NodeJS.Timeout;
  private logger: ILogger;

  constructor(config: RateLimitConfig, logger?: ILogger) {
    super();
    this.logger = logger || new SilentLogger();

    this.config = this.initializeConfig(config);

    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Initialize rate limit configuration with defaults
   */
  private initializeConfig(config: RateLimitConfig): Required<RateLimitConfig> {
    return {
      windowMs: config.windowMs || 60000, // 1 minute
      maxRequests: config.maxRequests || 100,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      onLimitReached: config.onLimitReached || (() => {}),
    };
  }

  /**
   * Default key generator function
   */
  private defaultKeyGenerator(req: unknown): string {
    const request = req as Record<string, unknown>;
    return (
      (request?.ip as string) || (request?.remoteAddress as string) || "unknown"
    );
  }

  /**
   * Check if request should be allowed
   */
  checkLimit(
    request: unknown,
    success: boolean = true,
    responseTime: number = 0,
  ): RateLimitResult {
    const key = this.config.keyGenerator(request);
    const now = Date.now();

    let client = this.clients.get(key);
    if (!client) {
      client = {
        requests: [],
        blocked: false,
        blockedUntil: 0,
        suspicionLevel: 0,
        consecutiveFailures: 0,
      };
      this.clients.set(key, client);
    }

    if (client.blocked && now < client.blockedUntil) {
      this.emit("blocked", {
        key,
        reason: "rate-limited",
        remainingTime: client.blockedUntil - now,
      });
      return RateLimitResult.BLOCKED;
    } else if (client.blocked && now >= client.blockedUntil) {
      client.blocked = false;
      client.blockedUntil = 0;
      this.emit("unblocked", { key });
    }

    if (
      (success && this.config.skipSuccessfulRequests) ||
      (!success && this.config.skipFailedRequests)
    ) {
      return RateLimitResult.ALLOWED;
    }

    const windowStart = now - this.config.windowMs;
    client.requests = client.requests.filter(
      (req) => req.timestamp > windowStart,
    );

    const requestRecord: RequestRecord = {
      timestamp: now,
      success,
      responseTime,
      size: ((request as Record<string, unknown>)?.body as string)?.length || 0,
    };
    client.requests.push(requestRecord);

    const requestCount = client.requests.length;

    if (requestCount > this.config.maxRequests) {
      client.blocked = true;
      client.blockedUntil = now + this.config.windowMs;

      const info: RateLimitInfo = {
        totalHits: requestCount,
        totalRequests: requestCount,
        resetTime: client.blockedUntil,
        remaining: 0,
        msBeforeNext: this.config.windowMs,
      };

      this.config.onLimitReached(key, info);
      this.emit("limit-exceeded", { key, info });

      return RateLimitResult.BLOCKED;
    }

    if (!success) {
      client.consecutiveFailures++;
      client.suspicionLevel += 2;
    } else {
      client.consecutiveFailures = 0;
      client.suspicionLevel = Math.max(0, client.suspicionLevel - 1);
    }

    if (this.isSuspicious(client)) {
      this.emit("suspicious", { key, client: client });
      return RateLimitResult.SUSPICIOUS;
    }

    return RateLimitResult.ALLOWED;
  }

  /**
   * Get current rate limit info for a key
   */
  getInfo(request: unknown): RateLimitInfo {
    const key = this.config.keyGenerator(request);
    const client = this.clients.get(key);
    const now = Date.now();

    if (!client) {
      return {
        totalHits: 0,
        totalRequests: 0,
        resetTime: now + this.config.windowMs,
        remaining: this.config.maxRequests,
        msBeforeNext: 0,
      };
    }

    const windowStart = now - this.config.windowMs;
    const recentRequests = client.requests.filter(
      (req) => req.timestamp > windowStart,
    );
    const remaining = Math.max(
      0,
      this.config.maxRequests - recentRequests.length,
    );

    return {
      totalHits: recentRequests.length,
      totalRequests: client.requests.length,
      resetTime:
        recentRequests.length > 0
          ? recentRequests[0].timestamp + this.config.windowMs
          : now + this.config.windowMs,
      remaining,
      msBeforeNext:
        remaining === 0
          ? this.config.windowMs - (now - recentRequests[0].timestamp)
          : 0,
    };
  }

  /**
   * Reset limits for a specific key
   */
  resetKey(key: string): void {
    const client = this.clients.get(key);
    if (client) {
      client.requests = [];
      client.blocked = false;
      client.blockedUntil = 0;
      client.suspicionLevel = 0;
      client.consecutiveFailures = 0;
      this.emit("reset", { key });
    }
  }

  /**
   * Get all active clients
   */
  getActiveClients(): Array<{ key: string; info: ClientInfo }> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    return Array.from(this.clients.entries())
      .filter(([, client]) =>
        client.requests.some((req) => req.timestamp > windowStart),
      )
      .map(([key, client]) => ({ key, info: client }));
  }

  private isSuspicious(client: ClientInfo): boolean {
    const now = Date.now();
    const recentRequests = client.requests.filter(
      (req) => req.timestamp > now - 10000,
    ); // Last 10 seconds

    if (recentRequests.length > this.config.maxRequests * 2) {
      return true;
    }

    if (client.consecutiveFailures >= 15) {
      return true;
    }

    if (client.suspicionLevel >= 30) {
      return true;
    }

    if (recentRequests.length > 0) {
      const avgResponseTime =
        recentRequests.reduce((sum, req) => sum + req.responseTime, 0) /
        recentRequests.length;
      if (avgResponseTime > 10000) {
        return true;
      }
    }

    return false;
  }

  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs * 2; // Keep data for 2 windows

    for (const [key, client] of this.clients.entries()) {
      client.requests = client.requests.filter((req) => req.timestamp > cutoff);

      if (
        client.requests.length === 0 &&
        !client.blocked &&
        client.suspicionLevel === 0
      ) {
        this.clients.delete(key);
      }
    }

    this.emit("cleanup", { activeClients: this.clients.size });
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clients.clear();
    this.removeAllListeners();
  }
}

export class DoSProtection extends EventEmitter {
  private config: DoSProtectionConfig;
  private activeConnections: Map<string, number> = new Map();
  private blockedIPs: Set<string> = new Set();
  private logger: ILogger;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: DoSProtectionConfig, logger?: ILogger) {
    super();
    this.config = config;
    this.logger = logger || new SilentLogger();

    if (config.blacklistedIPs) {
      config.blacklistedIPs.forEach((ip) => this.blockedIPs.add(ip));
    }

    this.cleanupInterval = setInterval(
      () => this.cleanupBlockedIPs(),
      config.blockDuration,
    );
  }

  /**
   * Check if request should be allowed based on DoS protection rules
   */
  checkRequest(clientIP: string): boolean {
    if (!this.config.enabled) {
      return true;
    }

    if (this.config.whitelistedIPs?.includes(clientIP)) {
      return true;
    }

    if (this.blockedIPs.has(clientIP)) {
      this.emit("blocked", { ip: clientIP, reason: "blacklisted" });
      return false;
    }

    const connections = this.activeConnections.get(clientIP) || 0;
    if (connections >= this.config.maxConcurrentRequests) {
      this.emit("blocked", {
        ip: clientIP,
        reason: "max-concurrent",
        connections,
      });
      return false;
    }

    return true;
  }

  /**
   * Track connection start
   */
  trackConnection(clientIP: string): void {
    if (!this.config.enabled) return;

    const current = this.activeConnections.get(clientIP) || 0;
    this.activeConnections.set(clientIP, current + 1);

    if (current + 1 >= this.config.suspiciousThreshold) {
      this.emit("suspicious", {
        ip: clientIP,
        connections: current + 1,
        threshold: this.config.suspiciousThreshold,
      });
    }
  }

  /**
   * Track connection end
   */
  releaseConnection(clientIP: string): void {
    if (!this.config.enabled) return;

    const current = this.activeConnections.get(clientIP) || 0;
    if (current > 0) {
      this.activeConnections.set(clientIP, current - 1);
    }
  }

  /**
   * Block an IP address
   */
  blockIP(clientIP: string, reason: string = "manual"): void {
    this.blockedIPs.add(clientIP);
    this.emit("ip-blocked", { ip: clientIP, reason });
    this.logger.warn(`IP ${clientIP} blocked: ${reason}`);
  }

  /**
   * Unblock an IP address
   */
  unblockIP(clientIP: string): void {
    this.blockedIPs.delete(clientIP);
    this.emit("ip-unblocked", { ip: clientIP });
    this.logger.info(`IP ${clientIP} unblocked`);
  }

  /**
   * Get current statistics
   */
  getStats(): {
    activeConnections: Record<string, number>;
    blockedIPs: string[];
    totalConnections: number;
  } {
    return {
      activeConnections: Object.fromEntries(this.activeConnections),
      blockedIPs: Array.from(this.blockedIPs),
      totalConnections: Array.from(this.activeConnections.values()).reduce(
        (sum, count) => sum + count,
        0,
      ),
    };
  }

  private cleanupBlockedIPs(): void {
    this.emit("cleanup", { blockedCount: this.blockedIPs.size });
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.activeConnections.clear();
    this.blockedIPs.clear();
    this.removeAllListeners();
  }
}

export class CircuitBreaker extends EventEmitter {
  private config: CircuitBreakerConfig;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  private logger: ILogger;

  constructor(config: CircuitBreakerConfig, logger?: ILogger) {
    super();
    this.config = config;
    this.logger = logger || new SilentLogger();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = "half-open";
        this.emit("state-change", { state: this.state });
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): {
    state: string;
    failures: number;
    lastFailureTime: number;
    nextRetryTime?: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime:
        this.state === "open"
          ? this.lastFailureTime + this.config.recoveryTimeout
          : undefined,
    };
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === "half-open") {
      this.state = "closed";
      this.emit("state-change", { state: this.state });
      this.logger.info("Circuit breaker closed");
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = "open";
      this.emit("state-change", { state: this.state });
      this.logger.warn("Circuit breaker opened");
    }
  }

  reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = "closed";
    this.emit("reset");
    this.logger.info("Circuit breaker reset");
  }
}

export class RequestThrottler extends EventEmitter {
  private queue: Array<{
    request: unknown;
    handler: (req: unknown) => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
    timestamp: number;
  }> = [];
  private processing: number = 0;
  private maxConcurrent: number;
  private maxQueueSize: number;
  private logger: ILogger;

  constructor(
    maxConcurrent: number = 10,
    maxQueueSize: number = 100,
    logger?: ILogger,
  ) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.logger = logger || new SilentLogger();
  }

  /**
   * Throttle request processing
   */
  async process<T>(
    request: unknown,
    handler: (req: unknown) => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error("Request queue full"));
        return;
      }

      this.queue.push({
        request,
        handler: handler as (req: unknown) => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now(),
      });

      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.processing++;
    this.emit("processing-start", {
      queueSize: this.queue.length,
      processing: this.processing,
    });

    try {
      const result = await item.handler(item.request);
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.processing--;
      this.emit("processing-end", {
        queueSize: this.queue.length,
        processing: this.processing,
      });

      setImmediate(() => this.processNext());
    }
  }

  /**
   * Get current throttler stats
   */
  getStats(): {
    queueSize: number;
    processing: number;
    maxConcurrent: number;
    maxQueueSize: number;
  } {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
    };
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    const cleared = this.queue.length;
    this.queue.forEach((item) => {
      item.reject(new Error("Queue cleared"));
    });
    this.queue = [];
    this.emit("queue-cleared", { cleared });
  }
}

export class SecurityMiddleware extends EventEmitter {
  private rateLimiter: RateLimiter;
  private dosProtection: DoSProtection;
  private circuitBreaker: CircuitBreaker;
  private throttler: RequestThrottler;
  private logger: ILogger;

  constructor(
    rateLimitConfig: RateLimitConfig,
    dosConfig: DoSProtectionConfig,
    circuitBreakerConfig: CircuitBreakerConfig,
    throttlerConfig: { maxConcurrent: number; maxQueueSize: number },
    logger?: ILogger,
  ) {
    super();
    this.logger = logger || new SilentLogger();

    this.rateLimiter = new RateLimiter(rateLimitConfig, logger);
    this.dosProtection = new DoSProtection(dosConfig, logger);
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig, logger);
    this.throttler = new RequestThrottler(
      throttlerConfig.maxConcurrent,
      throttlerConfig.maxQueueSize,
      logger,
    );

    this.rateLimiter.on("limit-exceeded", (data) =>
      this.emit("rate-limit-exceeded", data),
    );
    this.dosProtection.on("blocked", (data) => this.emit("dos-blocked", data));
    this.circuitBreaker.on("state-change", (data) =>
      this.emit("circuit-breaker-change", data),
    );
    this.throttler.on("queue-cleared", (data) =>
      this.emit("throttler-cleared", data),
    );
  }

  /**
   * Process request through all security layers
   */
  async processRequest(
    request: unknown,
    handler: (req: unknown) => Promise<unknown>,
  ): Promise<unknown> {
    const clientIP =
      ((request as Record<string, unknown>)?.ip as string) ||
      ((request as Record<string, unknown>)?.remoteAddress as string) ||
      "unknown";

    if (!this.dosProtection.checkRequest(clientIP)) {
      throw new Error("Request blocked by DoS protection");
    }

    this.dosProtection.trackConnection(clientIP);

    try {
      const rateLimitResult = this.rateLimiter.checkLimit(request, true, 0);
      if (rateLimitResult === RateLimitResult.BLOCKED) {
        throw new Error("Rate limit exceeded");
      }

      return await this.circuitBreaker.execute(async () => {
        return await this.throttler.process(request, handler);
      });
    } finally {
      this.dosProtection.releaseConnection(clientIP);
    }
  }

  /**
   * Get comprehensive security stats
   */
  getStats(): {
    rateLimiter: Array<{ key: string; info: ClientInfo }>;
    dosProtection: {
      activeConnections: Record<string, number>;
      blockedIPs: string[];
      totalConnections: number;
    };
    circuitBreaker: {
      state: string;
      failures: number;
      lastFailureTime: number;
      nextRetryTime?: number;
    };
    throttler: {
      queueSize: number;
      processing: number;
      maxConcurrent: number;
      maxQueueSize: number;
    };
  } {
    return {
      rateLimiter: this.rateLimiter.getActiveClients(),
      dosProtection: this.dosProtection.getStats(),
      circuitBreaker: this.circuitBreaker.getState(),
      throttler: this.throttler.getStats(),
    };
  }

  destroy(): void {
    this.rateLimiter.destroy();
    this.dosProtection.destroy();
    this.throttler.clearQueue();
    this.removeAllListeners();
  }
}
