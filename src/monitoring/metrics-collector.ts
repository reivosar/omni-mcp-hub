/**
 * Performance Monitoring and Metrics Collection System
 * Provides comprehensive system observability and performance tracking
 */

import { EventEmitter } from 'events';
import * as process from 'process';
import { ILogger, SilentLogger } from '../utils/logger.js';

export interface MetricDefinition {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  description: string;
  labels?: string[];
  unit?: string;
}

export interface MetricSample {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: Date;
}

export interface PerformanceMetrics {
  // Request/Response metrics
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;

  // Tool execution metrics
  toolExecutions: number;
  averageToolExecutionTime: number;
  toolSuccessRate: number;
  topTools: Array<{ name: string; count: number; avgTime: number }>;

  // Resource metrics
  resourceAccesses: number;
  averageResourceAccessTime: number;
  resourceHitRate: number;

  // System metrics
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  activeConnections: number;
  
  // Profile metrics
  activeProfiles: number;
  profileSwitches: number;
  configReloads: number;

  // Error metrics
  errorRate: number;
  errorsByType: Record<string, number>;
  lastErrors: Array<{ timestamp: Date; error: string; type: string }>;
}

export interface MonitoringConfig {
  enabled: boolean;
  collectInterval: number; // ms
  retentionPeriod: number; // ms
  prometheusEnabled: boolean;
  prometheusPort: number;
  prometheusPath: string;
  healthCheckEnabled: boolean;
  healthCheckPort: number;
  alertingEnabled: boolean;
  alertThresholds: {
    responseTimeP95: number;
    errorRate: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  exportFormats: Array<'prometheus' | 'json' | 'csv'>;
}

export class MetricsCollector extends EventEmitter {
  private config: MonitoringConfig;
  private logger: ILogger;
  private metrics: Map<string, MetricSample[]> = new Map();
  private metricDefinitions: Map<string, MetricDefinition> = new Map();
  private collectInterval?: NodeJS.Timeout;
  private startTime: Date;
  private responseTimes: number[] = [];
  private requestCounts: { timestamp: Date; count: number }[] = [];
  private lastCpuUsage?: NodeJS.CpuUsage;

  constructor(config?: Partial<MonitoringConfig>, logger?: ILogger) {
    super();
    this.logger = logger || new SilentLogger();
    this.startTime = new Date();
    
    this.config = {
      enabled: true,
      collectInterval: 15000, // 15 seconds
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      prometheusEnabled: true,
      prometheusPort: 3001,
      prometheusPath: '/metrics',
      healthCheckEnabled: true,
      healthCheckPort: 3002,
      alertingEnabled: true,
      alertThresholds: {
        responseTimeP95: 1000, // ms
        errorRate: 0.05, // 5%
        memoryUsage: 500 * 1024 * 1024, // 500MB
        cpuUsage: 80 // 80%
      },
      exportFormats: ['prometheus', 'json'],
      ...config
    };

    this.initializeMetrics();
    
    if (this.config.enabled) {
      this.startCollection();
    }
  }

  private initializeMetrics(): void {
    // Define all metrics
    const metricDefs: MetricDefinition[] = [
      // Request metrics
      { name: 'http_requests_total', type: 'counter', description: 'Total HTTP requests', labels: ['method', 'status', 'endpoint'] },
      { name: 'http_request_duration_seconds', type: 'histogram', description: 'HTTP request duration', unit: 'seconds' },
      { name: 'http_requests_per_second', type: 'gauge', description: 'Current requests per second' },

      // Tool metrics
      { name: 'mcp_tool_executions_total', type: 'counter', description: 'Total tool executions', labels: ['tool', 'status'] },
      { name: 'mcp_tool_duration_seconds', type: 'histogram', description: 'Tool execution duration', labels: ['tool'], unit: 'seconds' },
      { name: 'mcp_active_tools', type: 'gauge', description: 'Number of currently active tools' },

      // Resource metrics
      { name: 'mcp_resource_accesses_total', type: 'counter', description: 'Total resource accesses', labels: ['resource', 'status'] },
      { name: 'mcp_resource_cache_hits', type: 'counter', description: 'Resource cache hits', labels: ['resource'] },

      // System metrics
      { name: 'system_memory_bytes', type: 'gauge', description: 'System memory usage', labels: ['type'], unit: 'bytes' },
      { name: 'system_cpu_usage_percent', type: 'gauge', description: 'CPU usage percentage', unit: 'percent' },
      { name: 'system_uptime_seconds', type: 'gauge', description: 'System uptime', unit: 'seconds' },
      { name: 'system_active_connections', type: 'gauge', description: 'Active connections count' },

      // Profile metrics
      { name: 'mcp_active_profiles', type: 'gauge', description: 'Number of active profiles' },
      { name: 'mcp_profile_switches_total', type: 'counter', description: 'Total profile switches' },
      { name: 'mcp_config_reloads_total', type: 'counter', description: 'Total configuration reloads' },

      // Error metrics
      { name: 'error_rate', type: 'gauge', description: 'Current error rate', unit: 'percent' },
      { name: 'errors_total', type: 'counter', description: 'Total errors', labels: ['type', 'severity'] },
      
      // Test metrics (for testing purposes)
      { name: 'test_requests_total', type: 'counter', description: 'Test requests', labels: ['method', 'status'] },
      { name: 'test_active_connections', type: 'gauge', description: 'Test active connections' },
      { name: 'test_counter', type: 'counter', description: 'Test counter' },
      { name: 'test_gauge', type: 'gauge', description: 'Test gauge' },
      { name: 'test_duration', type: 'histogram', description: 'Test duration' },
    ];

    metricDefs.forEach(def => {
      this.metricDefinitions.set(def.name, def);
      this.metrics.set(def.name, []);
    });
  }

  private startCollection(): void {
    this.collectInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.collectInterval);

    this.logger.info('Metrics collection started');
    this.emit('collection-started');
  }

  private collectSystemMetrics(): void {
    try {
      const now = new Date();
      
      // System memory metrics
      const memUsage = process.memoryUsage();
      this.recordGauge('system_memory_bytes', memUsage.heapUsed, { type: 'heap_used' }, now);
      this.recordGauge('system_memory_bytes', memUsage.heapTotal, { type: 'heap_total' }, now);
      this.recordGauge('system_memory_bytes', memUsage.rss, { type: 'rss' }, now);
      this.recordGauge('system_memory_bytes', memUsage.external, { type: 'external' }, now);

      // CPU usage metrics
      const cpuUsage = process.cpuUsage(this.lastCpuUsage);
      const cpuPercent = ((cpuUsage.user + cpuUsage.system) / (this.config.collectInterval * 1000)) * 100;
      this.recordGauge('system_cpu_usage_percent', cpuPercent, undefined, now);
      this.lastCpuUsage = process.cpuUsage();

      // Uptime
      const uptime = (now.getTime() - this.startTime.getTime()) / 1000;
      this.recordGauge('system_uptime_seconds', uptime, undefined, now);

      // Clean up old metrics
      this.cleanupOldMetrics();

      this.emit('metrics-collected', { timestamp: now });
    } catch (error) {
      this.logger.error('Error collecting system metrics:', error);
    }
  }

  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.config.retentionPeriod);
    
    for (const [metricName, samples] of this.metrics.entries()) {
      const filteredSamples = samples.filter(sample => sample.timestamp > cutoff);
      this.metrics.set(metricName, filteredSamples);
    }
  }

  recordCounter(name: string, value: number = 1, labels?: Record<string, string>, timestamp?: Date): void {
    this.recordMetric('counter', name, value, labels, timestamp);
  }

  recordGauge(name: string, value: number, labels?: Record<string, string>, timestamp?: Date): void {
    this.recordMetric('gauge', name, value, labels, timestamp);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>, timestamp?: Date): void {
    this.recordMetric('histogram', name, value, labels, timestamp);
    
    // Store raw values for histogram calculations
    if (name.includes('duration') || name.includes('time')) {
      this.responseTimes.push(value);
      // Keep only last 1000 samples for percentile calculations
      if (this.responseTimes.length > 1000) {
        this.responseTimes = this.responseTimes.slice(-1000);
      }
    }
  }

  private recordMetric(type: string, name: string, value: number, labels?: Record<string, string>, timestamp?: Date): void {
    if (!this.config.enabled) return;

    const metric: MetricSample = {
      name,
      value,
      labels,
      timestamp: timestamp || new Date()
    };

    const samples = this.metrics.get(name) || [];
    samples.push(metric);
    this.metrics.set(name, samples);

    this.emit('metric-recorded', { type, metric });
  }

  // Specific metric recording methods for MCP operations
  recordToolExecution(toolName: string, duration: number, success: boolean): void {
    const status = success ? 'success' : 'error';
    this.recordCounter('mcp_tool_executions_total', 1, { tool: toolName, status });
    this.recordHistogram('mcp_tool_duration_seconds', duration / 1000, { tool: toolName });
  }

  recordResourceAccess(resourceUri: string, duration: number, success: boolean, cached: boolean = false): void {
    const status = success ? 'success' : 'error';
    this.recordCounter('mcp_resource_accesses_total', 1, { resource: resourceUri, status });
    
    if (cached && success) {
      this.recordCounter('mcp_resource_cache_hits', 1, { resource: resourceUri });
    }
  }

  recordHttpRequest(method: string, endpoint: string, status: number, duration: number): void {
    const statusCategory = Math.floor(status / 100) + 'xx';
    this.recordCounter('http_requests_total', 1, { method, status: statusCategory, endpoint });
    this.recordHistogram('http_request_duration_seconds', duration / 1000);
    
    // Track request counts for RPS calculation
    this.requestCounts.push({ timestamp: new Date(), count: 1 });
    // Keep only last hour of data
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.requestCounts = this.requestCounts.filter(r => r.timestamp > oneHourAgo);
  }

  recordProfileSwitch(): void {
    this.recordCounter('mcp_profile_switches_total');
  }

  recordConfigReload(): void {
    this.recordCounter('mcp_config_reloads_total');
  }

  recordError(errorType: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'): void {
    this.recordCounter('errors_total', 1, { type: errorType, severity });
  }

  updateActiveProfiles(count: number): void {
    this.recordGauge('mcp_active_profiles', count);
  }

  updateActiveConnections(count: number): void {
    this.recordGauge('system_active_connections', count);
  }

  getCurrentMetrics(): PerformanceMetrics {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    
    // Calculate RPS from recent requests
    const recentRequests = this.requestCounts.filter(r => r.timestamp > oneMinuteAgo);
    const requestsPerSecond = recentRequests.length / 60;

    // Calculate percentiles
    const sortedResponseTimes = [...this.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedResponseTimes.length * 0.95);
    const p99Index = Math.floor(sortedResponseTimes.length * 0.99);

    // Get latest system metrics
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Calculate request metrics from HTTP samples
    const httpSamples = this.metrics.get('http_requests_total') || [];
    const totalRequests = httpSamples.reduce((sum, sample) => sum + sample.value, 0);
    
    // Count failed requests (4xx, 5xx status codes)
    const failedRequests = httpSamples
      .filter(sample => sample.labels?.status === '4xx' || sample.labels?.status === '5xx')
      .reduce((sum, sample) => sum + sample.value, 0);
    
    const successfulRequests = totalRequests - failedRequests;
    const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: this.responseTimes.length > 0 ? 
        this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length : 0,
      p95ResponseTime: sortedResponseTimes[p95Index] || 0,
      p99ResponseTime: sortedResponseTimes[p99Index] || 0,
      requestsPerSecond,

      toolExecutions: this.getMetricValue('mcp_tool_executions_total'),
      averageToolExecutionTime: this.getAverageMetricValue('mcp_tool_duration_seconds'),
      toolSuccessRate: this.calculateSuccessRate('mcp_tool_executions_total'),
      topTools: this.getTopTools(),

      resourceAccesses: this.getMetricValue('mcp_resource_accesses_total'),
      averageResourceAccessTime: 0, // Would need additional tracking
      resourceHitRate: this.calculateHitRate('mcp_resource_accesses_total', 'mcp_resource_cache_hits'),

      memoryUsage: memUsage,
      cpuUsage: cpuUsage,
      uptime: (now.getTime() - this.startTime.getTime()) / 1000,
      activeConnections: this.getLatestGaugeValue('system_active_connections'),

      activeProfiles: this.getLatestGaugeValue('mcp_active_profiles'),
      profileSwitches: this.getMetricValue('mcp_profile_switches_total'),
      configReloads: this.getMetricValue('mcp_config_reloads_total'),

      errorRate,
      errorsByType: this.getErrorsByType(),
      lastErrors: this.getRecentErrors()
    };
  }

  private getMetricValue(name: string): number {
    const samples = this.metrics.get(name) || [];
    return samples.reduce((sum, sample) => sum + sample.value, 0);
  }

  private getLatestGaugeValue(name: string): number {
    const samples = this.metrics.get(name) || [];
    return samples.length > 0 ? samples[samples.length - 1].value : 0;
  }

  private getAverageMetricValue(name: string): number {
    const samples = this.metrics.get(name) || [];
    if (samples.length === 0) return 0;
    return samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
  }

  private calculateSuccessRate(metricName: string): number {
    const samples = this.metrics.get(metricName) || [];
    const totalSamples = samples.length;
    if (totalSamples === 0) return 1.0;
    
    const successSamples = samples.filter(s => s.labels?.status === 'success').length;
    return successSamples / totalSamples;
  }

  private calculateHitRate(totalMetric: string, hitMetric: string): number {
    const total = this.getMetricValue(totalMetric);
    const hits = this.getMetricValue(hitMetric);
    return total > 0 ? hits / total : 0;
  }

  private getTopTools(): Array<{ name: string; count: number; avgTime: number }> {
    const toolCounts: Record<string, { count: number; totalTime: number }> = {};
    
    const execSamples = this.metrics.get('mcp_tool_executions_total') || [];
    const timeSamples = this.metrics.get('mcp_tool_duration_seconds') || [];
    
    // Count executions
    execSamples.forEach(sample => {
      const tool = sample.labels?.tool || 'unknown';
      if (!toolCounts[tool]) {
        toolCounts[tool] = { count: 0, totalTime: 0 };
      }
      toolCounts[tool].count += sample.value;
    });

    // Sum execution times
    timeSamples.forEach(sample => {
      const tool = sample.labels?.tool || 'unknown';
      if (toolCounts[tool]) {
        toolCounts[tool].totalTime += sample.value;
      }
    });

    return Object.entries(toolCounts)
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgTime: data.count > 0 ? data.totalTime / data.count : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getErrorsByType(): Record<string, number> {
    const errorCounts: Record<string, number> = {};
    const errorSamples = this.metrics.get('errors_total') || [];
    
    errorSamples.forEach(sample => {
      const type = sample.labels?.type || 'unknown';
      errorCounts[type] = (errorCounts[type] || 0) + sample.value;
    });

    return errorCounts;
  }

  private getRecentErrors(): Array<{ timestamp: Date; error: string; type: string }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const errorSamples = this.metrics.get('errors_total') || [];
    
    return errorSamples
      .filter(sample => sample.timestamp > oneHourAgo)
      .slice(-10) // Last 10 errors
      .map(sample => ({
        timestamp: sample.timestamp,
        error: `Error of type ${sample.labels?.type}`,
        type: sample.labels?.type || 'unknown'
      }));
  }

  exportPrometheusMetrics(): string {
    let output = '';
    
    for (const [name, definition] of this.metricDefinitions.entries()) {
      const samples = this.metrics.get(name) || [];
      if (samples.length === 0) continue;

      // Write metric header
      output += `# HELP ${name} ${definition.description}\n`;
      output += `# TYPE ${name} ${definition.type}\n`;

      // Group samples by labels for counters and gauges
      if (definition.type === 'counter' || definition.type === 'gauge') {
        const latestSamples = this.getLatestSamplesByLabels(samples);
        
        for (const sample of latestSamples) {
          const labelsStr = this.formatPrometheusLabels(sample.labels);
          output += `${name}${labelsStr} ${sample.value} ${sample.timestamp.getTime()}\n`;
        }
      }

      output += '\n';
    }

    return output;
  }

  private getLatestSamplesByLabels(samples: MetricSample[]): MetricSample[] {
    const latestByLabels: Map<string, MetricSample> = new Map();
    
    for (const sample of samples) {
      const labelKey = JSON.stringify(sample.labels || {});
      const existing = latestByLabels.get(labelKey);
      
      if (!existing || sample.timestamp > existing.timestamp) {
        latestByLabels.set(labelKey, sample);
      }
    }

    return Array.from(latestByLabels.values());
  }

  private formatPrometheusLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    const labelPairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
    
    return `{${labelPairs}}`;
  }

  exportJSON(): string {
    const metrics = this.getCurrentMetrics();
    return JSON.stringify(metrics, null, 2);
  }

  exportCSV(): string {
    const metrics = this.getCurrentMetrics();
    const rows = [
      'metric_name,value,timestamp',
      `total_requests,${metrics.totalRequests},${new Date().toISOString()}`,
      `successful_requests,${metrics.successfulRequests},${new Date().toISOString()}`,
      `failed_requests,${metrics.failedRequests},${new Date().toISOString()}`,
      `average_response_time,${metrics.averageResponseTime},${new Date().toISOString()}`,
      `requests_per_second,${metrics.requestsPerSecond},${new Date().toISOString()}`,
      `tool_executions,${metrics.toolExecutions},${new Date().toISOString()}`,
      `memory_heap_used,${metrics.memoryUsage.heapUsed},${new Date().toISOString()}`,
      `uptime_seconds,${metrics.uptime},${new Date().toISOString()}`,
      `active_profiles,${metrics.activeProfiles},${new Date().toISOString()}`,
      `error_rate,${metrics.errorRate},${new Date().toISOString()}`
    ];

    return rows.join('\n');
  }

  checkHealthThresholds(): { healthy: boolean; issues: string[] } {
    const metrics = this.getCurrentMetrics();
    const issues: string[] = [];
    
    if (metrics.p95ResponseTime > this.config.alertThresholds.responseTimeP95) {
      issues.push(`High response time: ${metrics.p95ResponseTime}ms (threshold: ${this.config.alertThresholds.responseTimeP95}ms)`);
    }

    if (metrics.errorRate > this.config.alertThresholds.errorRate) {
      issues.push(`High error rate: ${(metrics.errorRate * 100).toFixed(1)}% (threshold: ${this.config.alertThresholds.errorRate * 100}%)`);
    }

    if (metrics.memoryUsage.heapUsed > this.config.alertThresholds.memoryUsage) {
      issues.push(`High memory usage: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB (threshold: ${Math.round(this.config.alertThresholds.memoryUsage / 1024 / 1024)}MB)`);
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }

  stop(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = undefined;
    }
    
    this.emit('collection-stopped');
    this.logger.info('Metrics collection stopped');
  }

  reset(): void {
    this.metrics.clear();
    this.responseTimes = [];
    this.requestCounts = [];
    this.initializeMetrics();
    this.emit('metrics-reset');
  }
}