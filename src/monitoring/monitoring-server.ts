/**
 * Monitoring HTTP Server
 * Provides HTTP endpoints for metrics and health checks
 */

import * as http from 'http';
import { URL } from 'url';
import { MetricsCollector, MonitoringConfig } from './metrics-collector.js';
import { ILogger, SilentLogger } from '../utils/logger.js';
// Stub implementations for audit logging - will be replaced when audit logging is available
const GlobalAuditLogger = {
  getInstance: () => ({
    logEvent: (_event: unknown) => {} // Stub implementation
  })
};

const AuditEventHelpers = {
  createSecurityEvent: (_action: string, _details: Record<string, unknown>) => ({
    eventType: 'security_violation',
    action: 'monitoring-server-error',
    details: {},
    severity: 'medium',
    source: 'monitoring-server'
  })
};

export interface MonitoringServerConfig {
  port: number;
  host: string;
  basePath: string;
  enableCors: boolean;
  authToken?: string;
  rateLimitEnabled: boolean;
  rateLimitWindow: number; // ms
  rateLimitMax: number; // requests per window
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class MonitoringServer {
  private server?: http.Server;
  private config: MonitoringServerConfig;
  private metricsCollector: MetricsCollector;
  private logger: ILogger;
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();
  private auditLogger = GlobalAuditLogger.getInstance();

  constructor(
    metricsCollector: MetricsCollector,
    config?: Partial<MonitoringServerConfig>,
    logger?: ILogger
  ) {
    this.metricsCollector = metricsCollector;
    this.logger = logger || new SilentLogger();
    
    this.config = {
      port: 3001,
      host: '0.0.0.0',
      basePath: '',
      enableCors: true,
      rateLimitEnabled: true,
      rateLimitWindow: 60000, // 1 minute
      rateLimitMax: 60, // 60 requests per minute
      ...config
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        this.logger.error('Monitoring server error:', error);
        reject(error);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.logger.info(`Monitoring server listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.logger.info('Monitoring server stopped');
          resolve();
        });
      });
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();
    const clientIp = req.socket.remoteAddress || 'unknown';
    
    try {
      // CORS headers
      if (this.config.enableCors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Rate limiting
      if (this.config.rateLimitEnabled && !this.checkRateLimit(clientIp)) {
        this.sendResponse(res, 429, 'application/json', JSON.stringify({
          error: 'Rate limit exceeded',
          resetTime: this.getRateLimitResetTime(clientIp)
        }));
        return;
      }

      // Authentication
      if (this.config.authToken && !this.checkAuth(req)) {
        this.sendResponse(res, 401, 'application/json', JSON.stringify({
          error: 'Unauthorized'
        }));
        return;
      }

      // Route handling
      const url = new URL(req.url || '/', 'http://localhost');
      const path = url.pathname.replace(this.config.basePath, '').replace(/^\/+/, '');

      await this.routeRequest(path, req, res);

    } catch (error) {
      this.logger.error('Error handling monitoring request:', error);
      this.sendResponse(res, 500, 'application/json', JSON.stringify({
        error: 'Internal server error'
      }));

      // Log error to audit system
      this.auditLogger.logEvent(AuditEventHelpers.createSecurityEvent(
        'monitoring-server-error',
        { error: error instanceof Error ? error.message : 'Unknown error', clientIp }
      ));
    } finally {
      // Record request metrics
      const duration = Date.now() - startTime;
      const status = res.statusCode || 500;
      this.metricsCollector.recordHttpRequest(
        req.method || 'GET',
        req.url || '/',
        status,
        duration
      );
    }
  }

  private checkRateLimit(clientIp: string): boolean {
    const now = Date.now();
    const entry = this.rateLimitMap.get(clientIp);

    if (!entry || now > entry.resetTime) {
      // New window
      this.rateLimitMap.set(clientIp, {
        count: 1,
        resetTime: now + this.config.rateLimitWindow
      });
      return true;
    }

    if (entry.count >= this.config.rateLimitMax) {
      return false;
    }

    entry.count++;
    return true;
  }

  private getRateLimitResetTime(clientIp: string): number {
    const entry = this.rateLimitMap.get(clientIp);
    return entry ? entry.resetTime : Date.now() + this.config.rateLimitWindow;
  }

  private checkAuth(req: http.IncomingMessage): boolean {
    if (!this.config.authToken) return true;

    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const token = authHeader.replace(/^Bearer\s+/i, '');
    return token === this.config.authToken;
  }

  private async routeRequest(path: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Route mapping to reduce cyclomatic complexity
    const routeHandlers: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>> = {
      'metrics': (req, res) => this.handleMetrics(req, res),
      'health': (req, res) => this.handleHealth(req, res),
      'health/ready': (req, res) => this.handleReadiness(req, res),
      'health/live': (req, res) => this.handleLiveness(req, res),
      'stats': (req, res) => this.handleStats(req, res),
      'dashboard': (req, res) => this.handleDashboard(req, res),
      '': (req, res) => this.handleRoot(req, res),
      '/': (req, res) => this.handleRoot(req, res)
    };

    const handler = routeHandlers[path];
    if (handler) {
      await handler(req, res);
    } else {
      this.sendResponse(res, 404, 'application/json', JSON.stringify({
        error: 'Endpoint not found',
        available: ['/metrics', '/health', '/health/ready', '/health/live', '/stats', '/dashboard']
      }));
    }
  }

  private async handleMetrics(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const format = new URL(req.url || '/', 'http://localhost').searchParams.get('format') || 'prometheus';
    
    let contentType: string;
    let content: string;

    switch (format.toLowerCase()) {
      case 'json':
        contentType = 'application/json';
        content = this.metricsCollector.exportJSON();
        break;
        
      case 'csv':
        contentType = 'text/csv';
        content = this.metricsCollector.exportCSV();
        break;
        
      case 'prometheus':
      default:
        contentType = 'text/plain; version=0.0.4; charset=utf-8';
        content = this.metricsCollector.exportPrometheusMetrics();
        break;
    }

    this.sendResponse(res, 200, contentType, content);

    // Log metrics access
    this.auditLogger.logEvent({
      eventType: 'data_access',
      action: 'metrics-export',
      details: { format, endpoint: '/metrics' },
      severity: 'low',
      source: 'monitoring-server'
    });
  }

  private async handleHealth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const healthCheck = this.metricsCollector.checkHealthThresholds();
    const currentMetrics = this.metricsCollector.getCurrentMetrics();
    
    const health = {
      status: healthCheck.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: currentMetrics.uptime,
      version: process.env.npm_package_version || '1.0.0',
      issues: healthCheck.issues,
      checks: {
        memory: currentMetrics.memoryUsage.heapUsed < 500 * 1024 * 1024,
        responseTime: currentMetrics.p95ResponseTime < 1000,
        errorRate: currentMetrics.errorRate < 0.05
      }
    };

    const statusCode = healthCheck.healthy ? 200 : 503;
    this.sendResponse(res, statusCode, 'application/json', JSON.stringify(health, null, 2));
  }

  private async handleReadiness(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const metrics = this.metricsCollector.getCurrentMetrics();
    
    const ready = {
      status: 'ready',
      timestamp: new Date().toISOString(),
      activeProfiles: metrics.activeProfiles,
      activeConnections: metrics.activeConnections,
      checks: {
        profiles_loaded: metrics.activeProfiles > 0,
        system_responsive: metrics.p95ResponseTime < 2000,
        memory_available: metrics.memoryUsage.heapUsed < 750 * 1024 * 1024
      }
    };

    const isReady = Object.values(ready.checks).every(check => check);
    const statusCode = isReady ? 200 : 503;
    
    this.sendResponse(res, statusCode, 'application/json', JSON.stringify(ready, null, 2));
  }

  private async handleLiveness(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const metrics = this.metricsCollector.getCurrentMetrics();
    
    const live = {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: metrics.uptime,
      pid: process.pid,
      memory: {
        heapUsed: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024)
      }
    };

    this.sendResponse(res, 200, 'application/json', JSON.stringify(live, null, 2));
  }

  private async handleStats(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const metrics = this.metricsCollector.getCurrentMetrics();
    
    const stats = {
      timestamp: new Date().toISOString(),
      performance: {
        totalRequests: metrics.totalRequests,
        successRate: metrics.totalRequests > 0 ? 
          ((metrics.totalRequests - metrics.failedRequests) / metrics.totalRequests * 100).toFixed(2) + '%' : 'N/A',
        averageResponseTime: Math.round(metrics.averageResponseTime) + 'ms',
        requestsPerSecond: metrics.requestsPerSecond.toFixed(2),
        p95ResponseTime: Math.round(metrics.p95ResponseTime) + 'ms'
      },
      tools: {
        totalExecutions: metrics.toolExecutions,
        averageExecutionTime: Math.round(metrics.averageToolExecutionTime) + 'ms',
        successRate: (metrics.toolSuccessRate * 100).toFixed(2) + '%',
        topTools: metrics.topTools.slice(0, 5).map(tool => ({
          name: tool.name,
          count: tool.count,
          avgTime: Math.round(tool.avgTime) + 'ms'
        }))
      },
      system: {
        uptime: Math.round(metrics.uptime) + 's',
        memoryUsage: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        activeProfiles: metrics.activeProfiles,
        activeConnections: metrics.activeConnections
      },
      errors: {
        errorRate: (metrics.errorRate * 100).toFixed(2) + '%',
        totalErrors: Object.values(metrics.errorsByType).reduce((a, b) => a + b, 0),
        errorsByType: metrics.errorsByType
      }
    };

    this.sendResponse(res, 200, 'application/json', JSON.stringify(stats, null, 2));
  }

  private async handleDashboard(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const metrics = this.metricsCollector.getCurrentMetrics();
    
    const dashboard = this.generateTextDashboard(metrics);
    this.sendResponse(res, 200, 'text/plain; charset=utf-8', dashboard);
  }

  private generateTextDashboard(metrics: ReturnType<MetricsCollector['getCurrentMetrics']>): string {
    const successRate = metrics.totalRequests > 0 ? 
      ((metrics.totalRequests - metrics.failedRequests) / metrics.totalRequests * 100).toFixed(1) : '0';
    
    const memoryMB = Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024);
    const uptimeHours = Math.round(metrics.uptime / 3600);
    
    return `
┌─────────────────────────────────────┐
│ Omni MCP Hub - Performance Dashboard │
├─────────────────────────────────────┤
│ Total Requests: ${metrics.totalRequests.toString().padStart(8)}        │
│ Success Rate: ${successRate}%                 │
│ Avg Response: ${Math.round(metrics.averageResponseTime).toString().padStart(4)}ms              │
│ RPS: ${metrics.requestsPerSecond.toFixed(1).padStart(8)}                  │
│                                     │
│ Tool Executions: ${metrics.toolExecutions.toString().padStart(6)}           │
│ Tool Success: ${(metrics.toolSuccessRate * 100).toFixed(1).padStart(5)}%             │
│                                     │
│ Memory Usage: ${memoryMB.toString().padStart(4)}MB              │
│ Active Profiles: ${metrics.activeProfiles.toString().padStart(3)}              │
│ Uptime: ${uptimeHours.toString().padStart(4)}h                   │
│                                     │
│ Top Tools:                          │
${metrics.topTools.slice(0, 3).map((tool: { name: string; count: number; avgTime: number }, i: number) => 
  `│ ${(i + 1)}. ${tool.name.padEnd(20)} ${tool.count.toString().padStart(4)}  │`
).join('\n')}
└─────────────────────────────────────┘

Last Updated: ${new Date().toISOString()}
Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%
P95 Response Time: ${Math.round(metrics.p95ResponseTime)}ms
`;
  }

  private async handleRoot(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const endpoints = {
      service: 'Omni MCP Hub Monitoring Server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      endpoints: {
        '/metrics': 'Prometheus metrics (supports ?format=json,csv,prometheus)',
        '/health': 'Overall health status',
        '/health/ready': 'Readiness check for Kubernetes',
        '/health/live': 'Liveness check for Kubernetes',
        '/stats': 'Performance statistics (JSON)',
        '/dashboard': 'Text-based performance dashboard'
      },
      documentation: {
        prometheus: 'Scrape /metrics endpoint for monitoring',
        kubernetes: 'Use /health/ready and /health/live for probes',
        debugging: 'Check /stats for detailed performance data'
      }
    };

    this.sendResponse(res, 200, 'application/json', JSON.stringify(endpoints, null, 2));
  }

  private sendResponse(res: http.ServerResponse, statusCode: number, contentType: string, content: string): void {
    res.writeHead(statusCode, {
      'Content-Type': contentType,
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(content);
  }
}

// Utility function to create a complete monitoring setup
export function createMonitoringSetup(
  metricsConfig?: Partial<MonitoringConfig>, 
  serverConfig?: Partial<MonitoringServerConfig>,
  logger?: ILogger
): { collector: MetricsCollector; server: MonitoringServer } {
  const collector = new MetricsCollector(metricsConfig, logger);
  const server = new MonitoringServer(collector, serverConfig, logger);
  
  return { collector, server };
}