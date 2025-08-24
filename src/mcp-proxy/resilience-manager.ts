/**
 * Resilience Manager for External MCP Servers
 * 
 * System-level resilience orchestration:
 * - Coordinates multiple resilient connections
 * - Implements load balancing and failover strategies  
 * - Provides system-wide health monitoring
 * - Manages resource allocation and throttling
 * - Implements intelligent recovery strategies
 * - Provides operational metrics and alerting
 */

import { EventEmitter } from 'events';
import { ILogger, SilentLogger } from '../utils/logger.js';
import { ExternalServerConfig } from './client.js';
import { 
  ResilientMCPConnection, 
  ConnectionState, 
  ConnectionStats, 
  ResilienceConfig,
  HealthCheckStrategy 
} from './resilience.js';

// Load balancing strategies
export enum LoadBalancingStrategy {
  ROUND_ROBIN = 'round_robin',
  LEAST_CONNECTIONS = 'least_connections',
  LEAST_RESPONSE_TIME = 'least_response_time',
  HEALTH_WEIGHTED = 'health_weighted',
  RANDOM = 'random'
}

// Failover strategies
export enum FailoverStrategy {
  IMMEDIATE = 'immediate',
  CIRCUIT_BREAKER = 'circuit_breaker',
  GRADUAL_RECOVERY = 'gradual_recovery',
  MANUAL_ONLY = 'manual_only'
}

// System-level resilience configuration
export interface SystemResilienceConfig {
  loadBalancing: {
    strategy: LoadBalancingStrategy;
    healthThreshold: number; // 0-1, minimum health score to participate
    maxConcurrentRequests: number;
    requestTimeoutMs: number;
  };
  
  failover: {
    strategy: FailoverStrategy;
    enableAutoFailover: boolean;
    failbackDelayMs: number;
    healthCheckBeforeFailback: boolean;
  };
  
  monitoring: {
    metricsIntervalMs: number;
    alertThresholds: {
      errorRatePercent: number;
      responseTimeMs: number;
      unhealthyServerPercent: number;
      consecutiveFailuresThreshold: number;
    };
    enableDetailedLogging: boolean;
  };
  
  resourceManagement: {
    maxTotalConnections: number;
    connectionPooling: boolean;
    idleConnectionTimeoutMs: number;
    maxQueueSize: number;
  };
  
  recovery: {
    enableAutoRecovery: boolean;
    recoveryIntervalMs: number;
    staggeredRecoveryDelayMs: number;
    maxParallelRecoveries: number;
  };
}

const DEFAULT_SYSTEM_CONFIG: SystemResilienceConfig = {
  loadBalancing: {
    strategy: LoadBalancingStrategy.HEALTH_WEIGHTED,
    healthThreshold: 0.7,
    maxConcurrentRequests: 100,
    requestTimeoutMs: 30000
  },
  
  failover: {
    strategy: FailoverStrategy.CIRCUIT_BREAKER,
    enableAutoFailover: true,
    failbackDelayMs: 60000,
    healthCheckBeforeFailback: true
  },
  
  monitoring: {
    metricsIntervalMs: 30000,
    alertThresholds: {
      errorRatePercent: 10,
      responseTimeMs: 5000,
      unhealthyServerPercent: 50,
      consecutiveFailuresThreshold: 5
    },
    enableDetailedLogging: false
  },
  
  resourceManagement: {
    maxTotalConnections: 50,
    connectionPooling: true,
    idleConnectionTimeoutMs: 600000,
    maxQueueSize: 1000
  },
  
  recovery: {
    enableAutoRecovery: true,
    recoveryIntervalMs: 120000,
    staggeredRecoveryDelayMs: 5000,
    maxParallelRecoveries: 3
  }
};

// System-wide metrics and health information
export interface SystemMetrics {
  timestamp: Date;
  totalServers: number;
  healthyServers: number;
  unhealthyServers: number;
  degradedServers: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTimeMs: number;
  errorRatePercent: number;
  connectionPoolUtilization: number;
  queueSize: number;
  activeRecoveries: number;
  alerts: SystemAlert[];
}

export interface SystemAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  serverName?: string;
  timestamp: Date;
  acknowledged: boolean;
  details?: Record<string, unknown>;
}

// Request queue item for load balancing
interface QueuedRequest {
  id: string;
  serverName?: string; // Preferred server
  operation: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timestamp: Date;
  timeoutMs: number;
}

export class ResilienceManager extends EventEmitter {
  private connections = new Map<string, ResilientMCPConnection>();
  private config: SystemResilienceConfig;
  private logger: ILogger;
  private requestQueue: QueuedRequest[] = [];
  private loadBalancerIndex = 0;
  private systemMetrics: SystemMetrics;
  private metricsInterval?: NodeJS.Timeout;
  private recoveryInterval?: NodeJS.Timeout;
  private alerts = new Map<string, SystemAlert>();
  private activeRecoveries = new Set<string>();
  private requestCounter = 0;
  
  constructor(
    config: Partial<SystemResilienceConfig> = {},
    logger?: ILogger
  ) {
    super();
    this.config = { ...DEFAULT_SYSTEM_CONFIG, ...config };
    this.logger = logger || new SilentLogger();
    
    this.systemMetrics = {
      timestamp: new Date(),
      totalServers: 0,
      healthyServers: 0,
      unhealthyServers: 0,
      degradedServers: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTimeMs: 0,
      errorRatePercent: 0,
      connectionPoolUtilization: 0,
      queueSize: 0,
      activeRecoveries: 0,
      alerts: []
    };
    
    this.startMonitoring();
    this.startRecoveryManager();
  }
  
  /**
   * Add a new server with resilience features
   */
  async addServer(
    serverConfig: ExternalServerConfig,
    resilienceConfig?: Partial<ResilienceConfig>
  ): Promise<void> {
    if (this.connections.has(serverConfig.name)) {
      this.logger.warn(`[RESILIENCE-MGR] Server ${serverConfig.name} already exists`);
      return;
    }
    
    if (this.connections.size >= this.config.resourceManagement.maxTotalConnections) {
      throw new Error(`Maximum connection limit reached (${this.config.resourceManagement.maxTotalConnections})`);
    }
    
    this.logger.info(`[RESILIENCE-MGR] Adding resilient server: ${serverConfig.name}`);
    
    const connection = new ResilientMCPConnection(serverConfig, resilienceConfig, this.logger);
    
    // Set up event listeners
    connection.on('stateChange', (newState: ConnectionState, oldState: ConnectionState) => {
      this.handleConnectionStateChange(serverConfig.name, newState, oldState);
    });
    
    this.connections.set(serverConfig.name, connection);
    
    try {
      await connection.connect();
      this.logger.info(`[RESILIENCE-MGR] Successfully added resilient server: ${serverConfig.name}`);
      this.emit('serverAdded', serverConfig.name);
    } catch (error) {
      this.logger.error(`[RESILIENCE-MGR] Failed to connect to ${serverConfig.name}:`, error);
      this.createAlert('error', `Failed to connect to server ${serverConfig.name}`, serverConfig.name, { error: (error as Error).message });
      // Don't remove the connection - let the resilience system handle recovery
    }
  }
  
  /**
   * Remove a server gracefully
   */
  async removeServer(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      this.logger.warn(`[RESILIENCE-MGR] Server ${serverName} not found`);
      return;
    }
    
    this.logger.info(`[RESILIENCE-MGR] Removing server: ${serverName}`);
    
    try {
      await connection.disconnect();
      this.connections.delete(serverName);
      this.alerts.delete(serverName);
      this.activeRecoveries.delete(serverName);
      this.logger.info(`[RESILIENCE-MGR] Successfully removed server: ${serverName}`);
      this.emit('serverRemoved', serverName);
    } catch (error) {
      this.logger.error(`[RESILIENCE-MGR] Error removing server ${serverName}:`, error);
    }
  }
  
  /**
   * Execute tool call with load balancing and failover
   */
  async callTool(toolName: string, args: unknown, preferredServer?: string): Promise<unknown> {
    return this.executeWithLoadBalancing(
      async (connection) => connection.callTool(toolName, args),
      `callTool:${toolName}`,
      preferredServer
    );
  }
  
  /**
   * Read resource with load balancing and failover
   */
  async readResource(resourceUri: string, preferredServer?: string): Promise<unknown> {
    return this.executeWithLoadBalancing(
      async (connection) => connection.readResource(resourceUri),
      `readResource:${resourceUri}`,
      preferredServer
    );
  }
  
  /**
   * Execute operation with intelligent load balancing and failover
   */
  private async executeWithLoadBalancing<T>(
    operation: (connection: ResilientMCPConnection) => Promise<T>,
    operationId: string,
    preferredServer?: string
  ): Promise<T> {
    if (this.requestQueue.length >= this.config.resourceManagement.maxQueueSize) {
      throw new Error('Request queue is full');
    }
    
    return new Promise<T>((resolve, reject) => {
      const requestId = `req_${++this.requestCounter}`;
      const queuedRequest: QueuedRequest = {
        id: requestId,
        serverName: preferredServer,
        operation: async () => {
          const connection = await this.selectServer(preferredServer);
          if (!connection) {
            throw new Error('No healthy servers available');
          }
          return operation(connection);
        },
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: new Date(),
        timeoutMs: this.config.loadBalancing.requestTimeoutMs
      };
      
      this.requestQueue.push(queuedRequest);
      this.processRequestQueue();
    });
  }
  
  /**
   * Process queued requests with concurrency control
   */
  private async processRequestQueue(): Promise<void> {
    if (this.requestQueue.length === 0) return;
    
    // Count active requests across all connections
    let activeRequests = 0;
    for (const connection of this.connections.values()) {
      activeRequests += connection.getStats().currentOperations;
    }
    
    if (activeRequests >= this.config.loadBalancing.maxConcurrentRequests) {
      return; // Wait for current requests to complete
    }
    
    const request = this.requestQueue.shift();
    if (!request) return;
    
    // Check timeout
    const requestAge = Date.now() - request.timestamp.getTime();
    if (requestAge > request.timeoutMs) {
      request.reject(new Error(`Request ${request.id} timed out in queue`));
      return;
    }
    
    const startTime = Date.now();
    this.systemMetrics.totalRequests++;
    
    try {
      const result = await request.operation();
      const responseTime = Date.now() - startTime;
      this.updateResponseMetrics(responseTime, true);
      request.resolve(result);
    } catch (error) {
      this.updateResponseMetrics(Date.now() - startTime, false);
      this.logger.warn(`[RESILIENCE-MGR] Request ${request.id} failed:`, error);
      request.reject(error as Error);
    }
    
    // Process next request
    setImmediate(() => this.processRequestQueue());
  }
  
  /**
   * Intelligent server selection with load balancing
   */
  private async selectServer(preferredServer?: string): Promise<ResilientMCPConnection | null> {
    const availableConnections = Array.from(this.connections.entries())
      .filter(([, connection]) => {
        const stats = connection.getStats();
        return connection.isConnected() && 
               connection.isHealthy() && 
               stats.currentOperations < this.config.loadBalancing.maxConcurrentRequests;
      });
    
    if (availableConnections.length === 0) {
      return null;
    }
    
    // Preferred server selection
    if (preferredServer) {
      const preferredConnection = availableConnections.find(([name]) => name === preferredServer);
      if (preferredConnection) {
        return preferredConnection[1];
      }
    }
    
    // Load balancing strategy
    switch (this.config.loadBalancing.strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        return this.selectRoundRobin(availableConnections);
        
      case LoadBalancingStrategy.LEAST_CONNECTIONS:
        return this.selectLeastConnections(availableConnections);
        
      case LoadBalancingStrategy.LEAST_RESPONSE_TIME:
        return this.selectLeastResponseTime(availableConnections);
        
      case LoadBalancingStrategy.HEALTH_WEIGHTED:
        return this.selectHealthWeighted(availableConnections);
        
      case LoadBalancingStrategy.RANDOM:
        return this.selectRandom(availableConnections);
        
      default:
        return availableConnections[0][1];
    }
  }
  
  // Load balancing implementations
  private selectRoundRobin(connections: [string, ResilientMCPConnection][]): ResilientMCPConnection {
    const connection = connections[this.loadBalancerIndex % connections.length];
    this.loadBalancerIndex++;
    return connection[1];
  }
  
  private selectLeastConnections(connections: [string, ResilientMCPConnection][]): ResilientMCPConnection {
    return connections.reduce((best, current) => {
      const bestStats = best[1].getStats();
      const currentStats = current[1].getStats();
      return currentStats.currentOperations < bestStats.currentOperations ? current : best;
    })[1];
  }
  
  private selectLeastResponseTime(connections: [string, ResilientMCPConnection][]): ResilientMCPConnection {
    return connections.reduce((best, current) => {
      const bestStats = best[1].getStats();
      const currentStats = current[1].getStats();
      return currentStats.averageOperationTimeMs < bestStats.averageOperationTimeMs ? current : best;
    })[1];
  }
  
  private selectHealthWeighted(connections: [string, ResilientMCPConnection][]): ResilientMCPConnection {
    // Calculate health scores and select based on weighted probability
    const healthScores = connections.map(([name, connection]) => {
      const stats = connection.getStats();
      const errorRate = stats.totalOperations > 0 ? stats.failedOperations / stats.totalOperations : 0;
      const healthScore = Math.max(0, 1 - errorRate);
      return { name, connection, healthScore };
    });
    
    const totalHealth = healthScores.reduce((sum, item) => sum + item.healthScore, 0);
    if (totalHealth === 0) return connections[0][1];
    
    let random = Math.random() * totalHealth;
    for (const item of healthScores) {
      random -= item.healthScore;
      if (random <= 0) {
        return item.connection;
      }
    }
    
    return healthScores[healthScores.length - 1].connection;
  }
  
  private selectRandom(connections: [string, ResilientMCPConnection][]): ResilientMCPConnection {
    const randomIndex = Math.floor(Math.random() * connections.length);
    return connections[randomIndex][1];
  }
  
  /**
   * Handle connection state changes and implement failover
   */
  private handleConnectionStateChange(
    serverName: string, 
    newState: ConnectionState, 
    oldState: ConnectionState
  ): void {
    this.logger.info(`[RESILIENCE-MGR] Server ${serverName} state: ${oldState} -> ${newState}`);
    
    switch (newState) {
      case ConnectionState.CONNECTED:
        this.removeAlert(serverName, 'connection_failure');
        this.createAlert('info', `Server ${serverName} connected`, serverName);
        break;
        
      case ConnectionState.FAILED:
        this.createAlert('error', `Server ${serverName} failed`, serverName);
        if (this.config.failover.enableAutoFailover) {
          this.triggerFailover(serverName);
        }
        break;
        
      case ConnectionState.CIRCUIT_OPEN:
        this.createAlert('warning', `Circuit breaker opened for ${serverName}`, serverName);
        break;
        
      case ConnectionState.DEGRADED:
        this.createAlert('warning', `Server ${serverName} entered degraded mode`, serverName);
        break;
    }
    
    this.emit('connectionStateChange', serverName, newState, oldState);
  }
  
  /**
   * Trigger failover procedures
   */
  private async triggerFailover(failedServerName: string): Promise<void> {
    this.logger.warn(`[RESILIENCE-MGR] Triggering failover for ${failedServerName}`);
    
    switch (this.config.failover.strategy) {
      case FailoverStrategy.IMMEDIATE:
        // Immediate failover - requests will automatically go to healthy servers
        this.createAlert('warning', `Immediate failover triggered for ${failedServerName}`, failedServerName);
        break;
        
      case FailoverStrategy.CIRCUIT_BREAKER:
        // Circuit breaker will handle the isolation
        this.scheduleRecovery(failedServerName, this.config.failover.failbackDelayMs);
        break;
        
      case FailoverStrategy.GRADUAL_RECOVERY:
        // Gradually bring back the server
        this.scheduleGradualRecovery(failedServerName);
        break;
        
      case FailoverStrategy.MANUAL_ONLY:
        // No automatic recovery
        this.createAlert('error', `Manual intervention required for ${failedServerName}`, failedServerName);
        break;
    }
  }
  
  /**
   * Schedule server recovery
   */
  private scheduleRecovery(serverName: string, delayMs: number): void {
    if (this.activeRecoveries.has(serverName)) {
      return; // Recovery already in progress
    }
    
    this.logger.info(`[RESILIENCE-MGR] Scheduling recovery for ${serverName} in ${delayMs}ms`);
    
    setTimeout(async () => {
      await this.attemptRecovery(serverName);
    }, delayMs);
  }
  
  /**
   * Attempt to recover a failed server
   */
  private async attemptRecovery(serverName: string): Promise<void> {
    if (this.activeRecoveries.has(serverName)) {
      return;
    }
    
    this.activeRecoveries.add(serverName);
    this.logger.info(`[RESILIENCE-MGR] Attempting recovery for ${serverName}`);
    
    try {
      const connection = this.connections.get(serverName);
      if (!connection) {
        this.logger.warn(`[RESILIENCE-MGR] Connection ${serverName} not found for recovery`);
        return;
      }
      
      // Health check before recovery if enabled
      if (this.config.failover.healthCheckBeforeFailback) {
        const isHealthy = await connection.forceHealthCheck();
        if (!isHealthy) {
          this.logger.warn(`[RESILIENCE-MGR] Pre-recovery health check failed for ${serverName}`);
          this.scheduleRecovery(serverName, this.config.recovery.recoveryIntervalMs);
          return;
        }
      }
      
      await connection.connect();
      this.logger.info(`[RESILIENCE-MGR] Successfully recovered ${serverName}`);
      this.createAlert('info', `Server ${serverName} recovered`, serverName);
      
    } catch (error) {
      this.logger.error(`[RESILIENCE-MGR] Recovery failed for ${serverName}:`, error);
      this.scheduleRecovery(serverName, this.config.recovery.recoveryIntervalMs);
    } finally {
      this.activeRecoveries.delete(serverName);
    }
  }
  
  /**
   * Schedule gradual recovery with increasing traffic
   */
  private scheduleGradualRecovery(serverName: string): void {
    // Implement gradual recovery logic
    this.logger.info(`[RESILIENCE-MGR] Starting gradual recovery for ${serverName}`);
    this.scheduleRecovery(serverName, this.config.failover.failbackDelayMs);
  }
  
  /**
   * Start monitoring and metrics collection
   */
  private startMonitoring(): void {
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.checkAlertConditions();
      this.emit('metricsUpdated', this.systemMetrics);
    }, this.config.monitoring.metricsIntervalMs);
    
    this.logger.debug(`[RESILIENCE-MGR] Started monitoring (interval: ${this.config.monitoring.metricsIntervalMs}ms)`);
  }
  
  /**
   * Start recovery manager
   */
  private startRecoveryManager(): void {
    if (!this.config.recovery.enableAutoRecovery) return;
    
    this.recoveryInterval = setInterval(() => {
      this.performRecoveryCheck();
    }, this.config.recovery.recoveryIntervalMs);
    
    this.logger.debug(`[RESILIENCE-MGR] Started recovery manager (interval: ${this.config.recovery.recoveryIntervalMs}ms)`);
  }
  
  /**
   * Collect comprehensive system metrics
   */
  private collectSystemMetrics(): void {
    const now = new Date();
    let healthyServers = 0;
    let unhealthyServers = 0;
    let degradedServers = 0;
    let totalRequests = 0;
    let failedRequests = 0;
    let totalResponseTime = 0;
    let activeOperations = 0;
    
    for (const connection of this.connections.values()) {
      const stats = connection.getStats();
      
      if (connection.isHealthy() && connection.isConnected()) {
        healthyServers++;
      } else if (stats.state === ConnectionState.DEGRADED) {
        degradedServers++;
      } else {
        unhealthyServers++;
      }
      
      totalRequests += stats.totalOperations;
      failedRequests += stats.failedOperations;
      totalResponseTime += stats.averageOperationTimeMs * stats.totalOperations;
      activeOperations += stats.currentOperations;
    }
    
    this.systemMetrics = {
      timestamp: now,
      totalServers: this.connections.size,
      healthyServers,
      unhealthyServers,
      degradedServers,
      totalRequests: this.systemMetrics.totalRequests,
      successfulRequests: this.systemMetrics.successfulRequests,
      failedRequests: this.systemMetrics.failedRequests,
      averageResponseTimeMs: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      errorRatePercent: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
      connectionPoolUtilization: this.connections.size > 0 ? 
        (activeOperations / (this.connections.size * this.config.loadBalancing.maxConcurrentRequests)) * 100 : 0,
      queueSize: this.requestQueue.length,
      activeRecoveries: this.activeRecoveries.size,
      alerts: Array.from(this.alerts.values())
    };
  }
  
  /**
   * Check conditions and create alerts
   */
  private checkAlertConditions(): void {
    const thresholds = this.config.monitoring.alertThresholds;
    
    // Error rate alert
    if (this.systemMetrics.errorRatePercent > thresholds.errorRatePercent) {
      this.createAlert('warning', 
        `High error rate: ${this.systemMetrics.errorRatePercent.toFixed(1)}%`, 
        undefined, 
        { errorRate: this.systemMetrics.errorRatePercent, threshold: thresholds.errorRatePercent }
      );
    }
    
    // Response time alert
    if (this.systemMetrics.averageResponseTimeMs > thresholds.responseTimeMs) {
      this.createAlert('warning', 
        `High response time: ${this.systemMetrics.averageResponseTimeMs.toFixed(1)}ms`,
        undefined,
        { responseTime: this.systemMetrics.averageResponseTimeMs, threshold: thresholds.responseTimeMs }
      );
    }
    
    // Unhealthy servers alert
    const unhealthyPercent = this.systemMetrics.totalServers > 0 ? 
      (this.systemMetrics.unhealthyServers / this.systemMetrics.totalServers) * 100 : 0;
    
    if (unhealthyPercent > thresholds.unhealthyServerPercent) {
      this.createAlert('error', 
        `Too many unhealthy servers: ${unhealthyPercent.toFixed(1)}%`,
        undefined,
        { unhealthyPercent, threshold: thresholds.unhealthyServerPercent }
      );
    }
  }
  
  /**
   * Perform recovery checks
   */
  private async performRecoveryCheck(): Promise<void> {
    if (this.activeRecoveries.size >= this.config.recovery.maxParallelRecoveries) {
      return;
    }
    
    const failedServers = Array.from(this.connections.entries())
      .filter(([name, connection]) => {
        const stats = connection.getStats();
        return !connection.isConnected() && 
               !this.activeRecoveries.has(name) &&
               stats.state === ConnectionState.FAILED;
      })
      .sort(([, a], [, b]) => {
        // Prioritize servers with fewer consecutive failures
        return a.getStats().consecutiveFailures - b.getStats().consecutiveFailures;
      });
    
    for (const [serverName] of failedServers.slice(0, this.config.recovery.maxParallelRecoveries - this.activeRecoveries.size)) {
      // Stagger recovery attempts
      setTimeout(() => this.attemptRecovery(serverName), 
        Math.random() * this.config.recovery.staggeredRecoveryDelayMs);
    }
  }
  
  /**
   * Update response metrics
   */
  private updateResponseMetrics(responseTime: number, success: boolean): void {
    if (success) {
      this.systemMetrics.successfulRequests++;
    } else {
      this.systemMetrics.failedRequests++;
    }
    
    // Update average response time using exponential moving average
    const alpha = 0.1;
    this.systemMetrics.averageResponseTimeMs = this.systemMetrics.averageResponseTimeMs === 0 ?
      responseTime : this.systemMetrics.averageResponseTimeMs * (1 - alpha) + responseTime * alpha;
  }
  
  /**
   * Alert management
   */
  private createAlert(
    severity: SystemAlert['severity'], 
    message: string, 
    serverName?: string, 
    details?: Record<string, unknown>
  ): void {
    const alertId = `${serverName || 'system'}_${Date.now()}`;
    const alert: SystemAlert = {
      id: alertId,
      severity,
      message,
      serverName,
      timestamp: new Date(),
      acknowledged: false,
      details
    };
    
    this.alerts.set(alertId, alert);
    this.emit('alert', alert);
    
    if (this.config.monitoring.enableDetailedLogging) {
      this.logger.warn(`[RESILIENCE-MGR] ALERT [${severity.toUpperCase()}]: ${message}`, details);
    }
  }
  
  private removeAlert(serverName: string, type: string): void {
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.serverName === serverName && alert.message.includes(type)) {
        this.alerts.delete(id);
      }
    }
  }
  
  /**
   * Public API methods
   */
  
  // Get system status
  getSystemStatus(): {
    healthy: boolean;
    totalServers: number;
    healthyServers: number;
    degradedServers: number;
    failedServers: number;
    activeRecoveries: number;
    queueSize: number;
  } {
    return {
      healthy: this.systemMetrics.healthyServers > 0,
      totalServers: this.systemMetrics.totalServers,
      healthyServers: this.systemMetrics.healthyServers,
      degradedServers: this.systemMetrics.degradedServers,
      failedServers: this.systemMetrics.unhealthyServers,
      activeRecoveries: this.systemMetrics.activeRecoveries,
      queueSize: this.systemMetrics.queueSize
    };
  }
  
  // Get detailed metrics
  getMetrics(): SystemMetrics {
    return { ...this.systemMetrics };
  }
  
  // Get server-specific stats
  getServerStats(serverName?: string): ConnectionStats[] {
    if (serverName) {
      const connection = this.connections.get(serverName);
      return connection ? [connection.getStats()] : [];
    }
    
    return Array.from(this.connections.values()).map(conn => conn.getStats());
  }
  
  // Force recovery
  async forceRecovery(serverName: string): Promise<void> {
    await this.attemptRecovery(serverName);
  }
  
  // Update configuration
  updateConfig(newConfig: Partial<SystemResilienceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('[RESILIENCE-MGR] System configuration updated');
  }
  
  // Acknowledge alert
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }
  
  // Cleanup
  async shutdown(): Promise<void> {
    this.logger.info('[RESILIENCE-MGR] Starting graceful shutdown...');
    
    // Stop monitoring
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
    }
    
    // Disconnect all servers
    const disconnectPromises = Array.from(this.connections.values())
      .map(connection => connection.disconnect().catch(error => 
        this.logger.error('[RESILIENCE-MGR] Error during shutdown disconnect:', error)));
    
    await Promise.all(disconnectPromises);
    
    this.connections.clear();
    this.alerts.clear();
    this.activeRecoveries.clear();
    this.requestQueue.length = 0;
    
    this.logger.info('[RESILIENCE-MGR] Graceful shutdown completed');
  }
}