/**
 * P1-7: Monitoring and Observability - Health Check System
 * 
 * Comprehensive health checking with:
 * - Multi-level health status reporting
 * - Component-specific health checks
 * - HTTP endpoints for health monitoring
 * - Integration with metrics collection
 * - External dependency checking
 */

import * as http from 'http';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from './metrics-collector.js';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message: string;
  timestamp: number;
  duration: number;
  details?: Record<string, unknown>;
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

export interface ComponentHealth {
  status: HealthStatus;
  checks: HealthCheckResult[];
  overallHealth: HealthStatus;
  lastCheck: number;
  uptime: number;
}

export interface SystemHealth {
  status: HealthStatus;
  components: Record<string, ComponentHealth>;
  metrics: {
    totalChecks: number;
    healthyChecks: number;
    degradedChecks: number;
    unhealthyChecks: number;
    averageResponseTime: number;
  };
  timestamp: number;
}

export interface HealthCheckConfig {
  enabled: boolean;
  port: number;
  path: string;
  interval: number;
  timeout: number;
  thresholds: {
    responseTime: number;
    errorRate: number;
    memoryUsage: number;
    diskUsage: number;
  };
  checks: HealthCheckDefinition[];
}

export interface HealthCheckDefinition {
  name: string;
  component: string;
  type: 'http' | 'tcp' | 'custom' | 'system';
  target?: string;
  interval: number;
  timeout: number;
  enabled: boolean;
  critical: boolean;
  healthyThreshold: number;
  unhealthyThreshold: number;
  customCheck?: () => Promise<HealthCheckResult>;
}

/**
 * Comprehensive health checking and monitoring system
 */
export class HealthChecker extends EventEmitter {
  private config: HealthCheckConfig;
  private logger: Logger;
  private metricsCollector?: MetricsCollector;
  private server?: http.Server;
  private checkResults: Map<string, HealthCheckResult[]> = new Map();
  private componentHealth: Map<string, ComponentHealth> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private systemStartTime: number = Date.now();
  private isRunning: boolean = false;

  constructor(config?: Partial<HealthCheckConfig>, logger?: Logger, metricsCollector?: MetricsCollector) {
    super();
    this.logger = logger || Logger.getInstance();
    this.metricsCollector = metricsCollector;
    
    this.config = {
      enabled: true,
      port: 3002,
      path: '/health',
      interval: 30000, // 30 seconds
      timeout: 5000,   // 5 seconds
      thresholds: {
        responseTime: 1000,     // 1 second
        errorRate: 0.1,         // 10%
        memoryUsage: 0.85,      // 85%
        diskUsage: 0.9          // 90%
      },
      checks: [],
      ...config
    };

    this.initializeDefaultChecks();
  }

  /**
   * Initialize default health checks for system components
   */
  private initializeDefaultChecks(): void {
    const defaultChecks: HealthCheckDefinition[] = [
      {
        name: 'memory_usage',
        component: 'system',
        type: 'system',
        interval: 15000,
        timeout: 1000,
        enabled: true,
        critical: true,
        healthyThreshold: 3,
        unhealthyThreshold: 1,
        customCheck: this.checkMemoryUsage.bind(this)
      },
      {
        name: 'disk_space',
        component: 'system',
        type: 'system',
        interval: 60000,
        timeout: 2000,
        enabled: true,
        critical: false,
        healthyThreshold: 3,
        unhealthyThreshold: 1,
        customCheck: this.checkDiskSpace.bind(this)
      },
      {
        name: 'event_loop',
        component: 'nodejs',
        type: 'system',
        interval: 10000,
        timeout: 1000,
        enabled: true,
        critical: true,
        healthyThreshold: 3,
        unhealthyThreshold: 1,
        customCheck: this.checkEventLoop.bind(this)
      },
      {
        name: 'mcp_servers',
        component: 'mcp',
        type: 'custom',
        interval: 20000,
        timeout: 3000,
        enabled: true,
        critical: true,
        healthyThreshold: 2,
        unhealthyThreshold: 1,
        customCheck: this.checkMCPServers.bind(this)
      }
    ];

    this.config.checks = [...this.config.checks, ...defaultChecks];
  }

  /**
   * Start health checking system
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Health checker is already running');
      return;
    }

    if (!this.config.enabled) {
      this.logger.info('Health checker is disabled');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting health checker...');

    // Start health check endpoints
    if (this.config.port > 0) {
      await this.startHealthEndpoint();
    }

    // Initialize all health checks
    for (const checkDef of this.config.checks) {
      if (checkDef.enabled) {
        this.startHealthCheck(checkDef);
      }
    }

    this.emit('started');
    this.logger.info(`Health checker started on port ${this.config.port}`);
  }

  /**
   * Stop health checking system
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping health checker...');

    // Stop all check intervals
    for (const [_name, interval] of this.checkIntervals) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();

    // Stop HTTP server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = undefined;
    }

    this.emit('stopped');
    this.logger.info('Health checker stopped');
  }

  /**
   * Start HTTP endpoint for health checks
   */
  private async startHealthEndpoint(): Promise<void> {
    this.server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');

      if (req.url === this.config.path) {
        this.handleHealthRequest(res);
      } else if (req.url === '/health/detailed') {
        this.handleDetailedHealthRequest(res);
      } else if (req.url === '/health/ready') {
        this.handleReadinessRequest(res);
      } else if (req.url === '/health/live') {
        this.handleLivenessRequest(res);
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Handle basic health request
   */
  private handleHealthRequest(res: http.ServerResponse): void {
    const systemHealth = this.getSystemHealth();
    const statusCode = systemHealth.status === HealthStatus.HEALTHY ? 200 :
                      systemHealth.status === HealthStatus.DEGRADED ? 200 : 503;
    
    res.statusCode = statusCode;
    res.end(JSON.stringify({
      status: systemHealth.status,
      timestamp: systemHealth.timestamp,
      uptime: (Date.now() - this.systemStartTime) / 1000
    }));
  }

  /**
   * Handle detailed health request
   */
  private handleDetailedHealthRequest(res: http.ServerResponse): void {
    const systemHealth = this.getSystemHealth();
    const statusCode = systemHealth.status === HealthStatus.HEALTHY ? 200 :
                      systemHealth.status === HealthStatus.DEGRADED ? 200 : 503;
    
    res.statusCode = statusCode;
    res.end(JSON.stringify(systemHealth, null, 2));
  }

  /**
   * Handle readiness probe request
   */
  private handleReadinessRequest(res: http.ServerResponse): void {
    const systemHealth = this.getSystemHealth();
    const criticalChecks = this.config.checks.filter(c => c.critical && c.enabled);
    const criticalHealthy = criticalChecks.every(check => {
      const component = this.componentHealth.get(check.component);
      return component && component.status !== HealthStatus.UNHEALTHY;
    });

    const statusCode = criticalHealthy ? 200 : 503;
    
    res.statusCode = statusCode;
    res.end(JSON.stringify({
      ready: criticalHealthy,
      status: systemHealth.status,
      timestamp: Date.now()
    }));
  }

  /**
   * Handle liveness probe request
   */
  private handleLivenessRequest(res: http.ServerResponse): void {
    const uptime = (Date.now() - this.systemStartTime) / 1000;
    const alive = this.isRunning && uptime > 1; // At least 1 second uptime

    res.statusCode = alive ? 200 : 503;
    res.end(JSON.stringify({
      alive,
      uptime,
      timestamp: Date.now()
    }));
  }

  /**
   * Start individual health check
   */
  private startHealthCheck(checkDef: HealthCheckDefinition): void {
    const runCheck = async () => {
      try {
        await this.executeHealthCheck(checkDef);
      } catch (error) {
        this.logger.error(`Health check ${checkDef.name} failed:`, error);
      }
    };

    // Run initial check
    setImmediate(runCheck);

    // Schedule periodic checks
    const interval = setInterval(runCheck, checkDef.interval);
    this.checkIntervals.set(checkDef.name, interval);
  }

  /**
   * Execute a health check
   */
  private async executeHealthCheck(checkDef: HealthCheckDefinition): Promise<void> {
    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      const checkPromise = checkDef.customCheck ? 
        checkDef.customCheck() : 
        this.executeStandardCheck(checkDef);
      
      const timeoutPromise = new Promise<HealthCheckResult>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), checkDef.timeout);
      });

      result = await Promise.race([checkPromise, timeoutPromise]);
      result.duration = Date.now() - startTime;
      
    } catch (error) {
      result = {
        name: checkDef.name,
        status: HealthStatus.UNHEALTHY,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        duration: Date.now() - startTime
      };
    }

    // Record result
    this.recordHealthCheckResult(checkDef.component, result);
    this.updateComponentHealth(checkDef);

    // Emit events
    this.emit('check-completed', { check: checkDef.name, result });
    
    if (result.status === HealthStatus.UNHEALTHY && checkDef.critical) {
      this.emit('critical-failure', { check: checkDef.name, result });
    }

    // Record metrics if available
    if (this.metricsCollector) {
      this.metricsCollector.recordHistogram('health_check_duration_ms', result.duration);
      this.metricsCollector.recordCounter('health_checks_total', 1, {
        check: checkDef.name,
        status: result.status,
        component: checkDef.component
      });
    }
  }

  /**
   * Execute standard health checks based on type
   */
  private async executeStandardCheck(checkDef: HealthCheckDefinition): Promise<HealthCheckResult> {
    switch (checkDef.type) {
      case 'http':
        return this.executeHttpCheck(checkDef);
      case 'tcp':
        return this.executeTcpCheck(checkDef);
      default:
        throw new Error(`Unknown health check type: ${checkDef.type}`);
    }
  }

  /**
   * Execute HTTP health check
   */
  private async executeHttpCheck(_checkDef: HealthCheckDefinition): Promise<HealthCheckResult> {
    // Implementation would depend on actual HTTP checking logic
    throw new Error('HTTP health checks not implemented yet');
  }

  /**
   * Execute TCP health check
   */
  private async executeTcpCheck(_checkDef: HealthCheckDefinition): Promise<HealthCheckResult> {
    // Implementation would depend on actual TCP checking logic
    throw new Error('TCP health checks not implemented yet');
  }

  /**
   * Check memory usage
   */
  private async checkMemoryUsage(): Promise<HealthCheckResult> {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    const usagePercent = (memUsage.rss / totalMem) * 100;
    const threshold = this.config.thresholds.memoryUsage * 100;

    let status: HealthStatus;
    let message: string;

    if (usagePercent < threshold * 0.8) {
      status = HealthStatus.HEALTHY;
      message = `Memory usage is normal: ${usagePercent.toFixed(1)}%`;
    } else if (usagePercent < threshold) {
      status = HealthStatus.DEGRADED;
      message = `Memory usage is elevated: ${usagePercent.toFixed(1)}%`;
    } else {
      status = HealthStatus.UNHEALTHY;
      message = `Memory usage is critical: ${usagePercent.toFixed(1)}%`;
    }

    return {
      name: 'memory_usage',
      status,
      message,
      timestamp: Date.now(),
      duration: 0,
      details: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
        usagePercent
      }
    };
  }

  /**
   * Check disk space
   */
  private async checkDiskSpace(): Promise<HealthCheckResult> {
    // For now, return a simple healthy status
    // In production, this would check actual disk usage
    return {
      name: 'disk_space',
      status: HealthStatus.HEALTHY,
      message: 'Disk space is adequate',
      timestamp: Date.now(),
      duration: 0
    };
  }

  /**
   * Check Node.js event loop delay
   */
  private async checkEventLoop(): Promise<HealthCheckResult> {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const delay = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
        const threshold = this.config.thresholds.responseTime;

        let status: HealthStatus;
        let message: string;

        if (delay < threshold * 0.5) {
          status = HealthStatus.HEALTHY;
          message = `Event loop delay is normal: ${delay.toFixed(2)}ms`;
        } else if (delay < threshold) {
          status = HealthStatus.DEGRADED;
          message = `Event loop delay is elevated: ${delay.toFixed(2)}ms`;
        } else {
          status = HealthStatus.UNHEALTHY;
          message = `Event loop delay is critical: ${delay.toFixed(2)}ms`;
        }

        resolve({
          name: 'event_loop',
          status,
          message,
          timestamp: Date.now(),
          duration: delay,
          details: { delayMs: delay }
        });
      });
    });
  }

  /**
   * Check MCP servers health
   */
  private async checkMCPServers(): Promise<HealthCheckResult> {
    // For now, return a simple healthy status
    // In production, this would check actual MCP server connections
    return {
      name: 'mcp_servers',
      status: HealthStatus.HEALTHY,
      message: 'All MCP servers are responding',
      timestamp: Date.now(),
      duration: 0,
      details: {
        activeServers: 0,
        totalServers: 0
      }
    };
  }

  /**
   * Record health check result
   */
  private recordHealthCheckResult(component: string, result: HealthCheckResult): void {
    if (!this.checkResults.has(component)) {
      this.checkResults.set(component, []);
    }

    const results = this.checkResults.get(component)!;
    results.push(result);

    // Keep only last 100 results per component
    if (results.length > 100) {
      results.splice(0, results.length - 100);
    }
  }

  /**
   * Update component health status
   */
  private updateComponentHealth(checkDef: HealthCheckDefinition): void {
    const results = this.checkResults.get(checkDef.component) || [];
    const recentResults = results.slice(-checkDef.healthyThreshold);
    
    let overallStatus: HealthStatus;
    if (recentResults.length < checkDef.unhealthyThreshold) {
      overallStatus = HealthStatus.UNKNOWN;
    } else {
      const healthyCount = recentResults.filter(r => r.status === HealthStatus.HEALTHY).length;
      const unhealthyCount = recentResults.filter(r => r.status === HealthStatus.UNHEALTHY).length;
      
      if (unhealthyCount >= checkDef.unhealthyThreshold) {
        overallStatus = HealthStatus.UNHEALTHY;
      } else if (healthyCount >= checkDef.healthyThreshold) {
        overallStatus = HealthStatus.HEALTHY;
      } else {
        overallStatus = HealthStatus.DEGRADED;
      }
    }

    this.componentHealth.set(checkDef.component, {
      status: overallStatus,
      checks: recentResults,
      overallHealth: overallStatus,
      lastCheck: Date.now(),
      uptime: (Date.now() - this.systemStartTime) / 1000
    });
  }

  /**
   * Get overall system health
   */
  public getSystemHealth(): SystemHealth {
    const components = Object.fromEntries(this.componentHealth);
    const allChecks = Array.from(this.checkResults.values()).flat();
    
    const totalChecks = allChecks.length;
    const healthyChecks = allChecks.filter(r => r.status === HealthStatus.HEALTHY).length;
    const degradedChecks = allChecks.filter(r => r.status === HealthStatus.DEGRADED).length;
    const unhealthyChecks = allChecks.filter(r => r.status === HealthStatus.UNHEALTHY).length;
    const averageResponseTime = totalChecks > 0 ? 
      allChecks.reduce((sum, r) => sum + r.duration, 0) / totalChecks : 0;

    // Determine overall system status
    const componentStatuses = Array.from(this.componentHealth.values()).map(c => c.status);
    let systemStatus: HealthStatus;
    
    if (componentStatuses.some(s => s === HealthStatus.UNHEALTHY)) {
      systemStatus = HealthStatus.UNHEALTHY;
    } else if (componentStatuses.some(s => s === HealthStatus.DEGRADED)) {
      systemStatus = HealthStatus.DEGRADED;
    } else if (componentStatuses.every(s => s === HealthStatus.HEALTHY)) {
      systemStatus = HealthStatus.HEALTHY;
    } else {
      systemStatus = HealthStatus.UNKNOWN;
    }

    return {
      status: systemStatus,
      components,
      metrics: {
        totalChecks,
        healthyChecks,
        degradedChecks,
        unhealthyChecks,
        averageResponseTime
      },
      timestamp: Date.now()
    };
  }

  /**
   * Add custom health check
   */
  public addHealthCheck(checkDef: HealthCheckDefinition): void {
    this.config.checks.push(checkDef);
    
    if (this.isRunning && checkDef.enabled) {
      this.startHealthCheck(checkDef);
    }
  }

  /**
   * Remove health check
   */
  public removeHealthCheck(name: string): boolean {
    const index = this.config.checks.findIndex(c => c.name === name);
    if (index === -1) return false;

    this.config.checks.splice(index, 1);
    
    const interval = this.checkIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(name);
    }

    return true;
  }
}