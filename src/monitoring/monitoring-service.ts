/**
 * P1-7: Monitoring and Observability - Main Service
 *
 * Central monitoring service that orchestrates:
 * - Metrics collection and aggregation
 * - Health checking and status monitoring
 * - Alert management and notification
 * - Dashboard and visualization
 * - Data export and integration
 * - Performance optimization
 */

import { EventEmitter } from "events";
import { Logger } from "../utils/logger.js";
import {
  MetricsCollector,
  PerformanceMetrics,
  MonitoringConfig,
} from "./metrics-collector.js";
import {
  HealthChecker,
  HealthCheckConfig,
  SystemHealth,
} from "./health-checker.js";
import { MonitoringDashboard, DashboardConfig } from "./dashboard.js";

export interface MonitoringServiceConfig {
  enabled: boolean;
  metricsConfig?: Partial<MonitoringConfig>;
  healthConfig?: Partial<HealthCheckConfig>;
  dashboardConfig?: Partial<DashboardConfig>;
  alerting?: {
    enabled: boolean;
    webhookUrl?: string;
    slackToken?: string;
    emailConfig?: {
      smtp: string;
      port: number;
      username: string;
      password: string;
      from: string;
      to: string[];
    };
  };
  performance?: {
    profileCpuUsage: boolean;
    profileMemoryUsage: boolean;
    enableTracing: boolean;
    samplingRate: number;
  };
}

export interface MonitoringStatus {
  enabled: boolean;
  components: {
    metrics: ComponentStatus;
    health: ComponentStatus;
    dashboard: ComponentStatus;
    alerting: ComponentStatus;
  };
  startTime: number;
  uptime: number;
  lastUpdate: number;
}

export interface ComponentStatus {
  enabled: boolean;
  status: "starting" | "running" | "stopped" | "error";
  lastActivity: number;
  errorCount: number;
  details?: Record<string, unknown>;
}

export interface AlertNotification {
  id: string;
  timestamp: number;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  component: string;
  metric?: string;
  value?: number;
  threshold?: number;
  tags?: Record<string, string>;
}

export interface PerformanceReport {
  timestamp: number;
  duration: number;
  metrics: PerformanceMetrics;
  health: SystemHealth;
  insights: PerformanceInsight[];
  recommendations: string[];
}

export interface PerformanceInsight {
  category: "memory" | "cpu" | "network" | "disk" | "application";
  severity: "info" | "warning" | "critical";
  message: string;
  metric?: string;
  value?: number;
  trend?: "improving" | "stable" | "degrading";
}

/**
 * Comprehensive monitoring service orchestrating all monitoring components
 */
export class MonitoringService extends EventEmitter {
  private config: MonitoringServiceConfig;
  private logger: Logger;
  private metricsCollector?: MetricsCollector;
  private healthChecker?: HealthChecker;
  private dashboard?: MonitoringDashboard;
  private status!: MonitoringStatus;
  private startTime: number = Date.now();
  private alertHistory: AlertNotification[] = [];
  private performanceHistory: PerformanceReport[] = [];
  private isRunning: boolean = false;

  constructor(config?: Partial<MonitoringServiceConfig>, logger?: Logger) {
    super();
    this.logger = logger || Logger.getInstance();

    this.config = {
      enabled: true,
      metricsConfig: {
        enabled: true,
        collectInterval: 15000,
        retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
        prometheusEnabled: true,
        prometheusPort: 3001,
        healthCheckEnabled: true,
        alertingEnabled: true,
      },
      healthConfig: {
        enabled: true,
        port: 3002,
        interval: 30000,
        timeout: 5000,
      },
      dashboardConfig: {
        enabled: true,
        port: 3003,
        wsPort: 3004,
        refreshInterval: 5000,
      },
      alerting: {
        enabled: true,
      },
      performance: {
        profileCpuUsage: true,
        profileMemoryUsage: true,
        enableTracing: false,
        samplingRate: 0.1,
      },
      ...config,
    };

    this.initializeStatus();
  }

  /**
   * Initialize monitoring status
   */
  private initializeStatus(): void {
    this.status = {
      enabled: this.config.enabled,
      components: {
        metrics: {
          enabled: this.config.metricsConfig?.enabled ?? true,
          status: "stopped",
          lastActivity: 0,
          errorCount: 0,
        },
        health: {
          enabled: this.config.healthConfig?.enabled ?? true,
          status: "stopped",
          lastActivity: 0,
          errorCount: 0,
        },
        dashboard: {
          enabled: this.config.dashboardConfig?.enabled ?? true,
          status: "stopped",
          lastActivity: 0,
          errorCount: 0,
        },
        alerting: {
          enabled: this.config.alerting?.enabled ?? true,
          status: "stopped",
          lastActivity: 0,
          errorCount: 0,
        },
      },
      startTime: this.startTime,
      uptime: 0,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Start monitoring service
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Monitoring service is already running");
      return;
    }

    if (!this.config.enabled) {
      this.logger.info("Monitoring service is disabled");
      return;
    }

    this.isRunning = true;
    this.logger.info("Starting monitoring service...");

    try {
      if (this.config.metricsConfig?.enabled) {
        await this.startMetricsCollector();
      }

      if (this.config.healthConfig?.enabled) {
        await this.startHealthChecker();
      }

      if (this.config.dashboardConfig?.enabled) {
        await this.startDashboard();
      }

      if (this.config.alerting?.enabled) {
        this.setupAlerting();
      }

      this.setupEventListeners();

      this.startPeriodicReporting();

      this.emit("started");
      this.logger.info("Monitoring service started successfully");
    } catch (error) {
      this.logger.error("Failed to start monitoring service:", error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop monitoring service
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info("Stopping monitoring service...");

    try {
      if (this.dashboard) {
        await this.dashboard.stop();
        this.updateComponentStatus("dashboard", "stopped");
      }

      if (this.healthChecker) {
        await this.healthChecker.stop();
        this.updateComponentStatus("health", "stopped");
      }

      if (this.metricsCollector) {
        this.metricsCollector.stop();
        this.updateComponentStatus("metrics", "stopped");
      }

      this.emit("stopped");
      this.logger.info("Monitoring service stopped");
    } catch (error) {
      this.logger.error("Error stopping monitoring service:", error);
      throw error;
    }
  }

  /**
   * Start metrics collector
   */
  private async startMetricsCollector(): Promise<void> {
    this.updateComponentStatus("metrics", "starting");

    try {
      this.metricsCollector = new MetricsCollector(
        this.config.metricsConfig,
        this.logger,
      );
      this.updateComponentStatus("metrics", "running");
      this.logger.info("Metrics collector started");
    } catch (error) {
      this.updateComponentStatus("metrics", "error");
      throw error;
    }
  }

  /**
   * Start health checker
   */
  private async startHealthChecker(): Promise<void> {
    this.updateComponentStatus("health", "starting");

    try {
      this.healthChecker = new HealthChecker(
        this.config.healthConfig,
        this.logger,
        this.metricsCollector,
      );
      await this.healthChecker.start();
      this.updateComponentStatus("health", "running");
      this.logger.info("Health checker started");
    } catch (error) {
      this.updateComponentStatus("health", "error");
      throw error;
    }
  }

  /**
   * Start dashboard
   */
  private async startDashboard(): Promise<void> {
    if (!this.metricsCollector || !this.healthChecker) {
      throw new Error(
        "Dashboard requires metrics collector and health checker",
      );
    }

    this.updateComponentStatus("dashboard", "starting");

    try {
      this.dashboard = new MonitoringDashboard(
        this.config.dashboardConfig!,
        this.metricsCollector,
        this.healthChecker,
        this.logger,
      );
      await this.dashboard.start();
      this.updateComponentStatus("dashboard", "running");
      this.logger.info("Monitoring dashboard started");
    } catch (error) {
      this.updateComponentStatus("dashboard", "error");
      throw error;
    }
  }

  /**
   * Setup alerting system
   */
  private setupAlerting(): void {
    this.updateComponentStatus("alerting", "running");
    this.logger.info("Alerting system configured");
  }

  /**
   * Setup event listeners for component integration
   */
  private setupEventListeners(): void {
    if (this.metricsCollector) {
      this.metricsCollector.on("alert", (alert) => {
        this.handleAlert(alert);
      });

      this.metricsCollector.on("metrics-collected", () => {
        this.updateComponentStatus("metrics", "running", {
          lastCollection: Date.now(),
        });
      });
    }

    if (this.healthChecker) {
      this.healthChecker.on("critical-failure", (data) => {
        this.handleCriticalAlert(data);
      });

      this.healthChecker.on("check-completed", () => {
        this.updateComponentStatus("health", "running", {
          lastCheck: Date.now(),
        });
      });
    }

    if (this.dashboard) {
      this.dashboard.on("started", () => {
        this.logger.info("Dashboard is ready for connections");
      });
    }
  }

  /**
   * Start periodic performance reporting
   */
  private startPeriodicReporting(): void {
    const reportInterval = 5 * 60 * 1000; // 5 minutes

    setInterval(() => {
      if (this.isRunning) {
        this.generatePerformanceReport();
      }
    }, reportInterval);
  }

  /**
   * Handle alerts from metrics collector
   */
  private handleAlert(alert: {
    severity: string;
    message: string;
    component?: string;
    source?: string;
    rule?: {
      severity?: string;
      name?: string;
      metric?: string;
      threshold?: number;
    };
    value?: number;
  }): void {
    const notification: AlertNotification = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      severity:
        (alert.rule?.severity as "critical" | "high" | "medium" | "low") ||
        "medium",
      title: `Alert: ${alert.rule?.name || "Unknown"}`,
      message: alert.message,
      component: "metrics",
      metric: alert.rule?.metric,
      value: alert.value,
      threshold: alert.rule?.threshold,
    };

    this.alertHistory.push(notification);

    if (this.alertHistory.length > 1000) {
      this.alertHistory.splice(0, this.alertHistory.length - 1000);
    }

    this.emit("alert", notification);
    this.logger.warn("Alert triggered:", notification.message);

    this.sendAlertNotification(notification);
  }

  /**
   * Handle critical alerts from health checker
   */
  private handleCriticalAlert(data: {
    component: string;
    message: string;
    details?: Record<string, unknown>;
    check?: string;
    result?: {
      message?: string;
    };
  }): void {
    const notification: AlertNotification = {
      id: `critical_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      severity: "critical",
      title: `Critical Health Check Failure: ${data.check || "Unknown"}`,
      message: data.result?.message || "Critical health check failed",
      component: "health",
      tags: data.check ? { check: data.check } : undefined,
    };

    this.alertHistory.push(notification);
    this.emit("critical-alert", notification);
    this.logger.error("Critical alert:", notification.message);

    this.sendAlertNotification(notification);
  }

  /**
   * Send alert notification via configured channels
   */
  private async sendAlertNotification(alert: AlertNotification): Promise<void> {
    try {
      if (this.config.alerting?.webhookUrl) {
        await this.sendWebhookNotification(alert);
      }

      if (this.config.alerting?.slackToken) {
        await this.sendSlackNotification(alert);
      }

      if (this.config.alerting?.emailConfig) {
        await this.sendEmailNotification(alert);
      }
    } catch (error) {
      this.logger.error("Failed to send alert notification:", error);
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    alert: AlertNotification,
  ): Promise<void> {
    this.logger.debug(
      "Webhook notification would be sent for alert:",
      alert.id,
    );
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(alert: AlertNotification): Promise<void> {
    this.logger.debug("Slack notification would be sent for alert:", alert.id);
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(alert: AlertNotification): Promise<void> {
    this.logger.debug("Email notification would be sent for alert:", alert.id);
  }

  /**
   * Generate comprehensive performance report
   */
  private generatePerformanceReport(): PerformanceReport {
    if (!this.metricsCollector || !this.healthChecker) {
      throw new Error(
        "Cannot generate report without metrics and health components",
      );
    }

    const startTime = Date.now();
    const metrics = this.metricsCollector.getCurrentMetrics();
    const health = this.healthChecker.getSystemHealth();
    const insights = this.analyzePerformance(metrics, health);
    const recommendations = this.generateRecommendations(insights);

    const report: PerformanceReport = {
      timestamp: startTime,
      duration: Date.now() - startTime,
      metrics,
      health,
      insights,
      recommendations,
    };

    this.performanceHistory.push(report);

    if (this.performanceHistory.length > 288) {
      this.performanceHistory.splice(0, this.performanceHistory.length - 288);
    }

    this.emit("performance-report", report);
    return report;
  }

  /**
   * Analyze performance metrics and generate insights
   */
  private analyzePerformance(
    metrics: PerformanceMetrics,
    _health: SystemHealth,
  ): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    const memoryPercent =
      (metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal) * 100;
    if (memoryPercent > 85) {
      insights.push({
        category: "memory",
        severity: "critical",
        message: `High memory usage: ${memoryPercent.toFixed(1)}%`,
        metric: "memory_usage_percent",
        value: memoryPercent,
        trend: "degrading",
      });
    } else if (memoryPercent > 70) {
      insights.push({
        category: "memory",
        severity: "warning",
        message: `Elevated memory usage: ${memoryPercent.toFixed(1)}%`,
        metric: "memory_usage_percent",
        value: memoryPercent,
        trend: "stable",
      });
    }

    if (metrics.averageResponseTime > 1000) {
      insights.push({
        category: "application",
        severity: "warning",
        message: `Slow response times: ${metrics.averageResponseTime.toFixed(1)}ms average`,
        metric: "response_time",
        value: metrics.averageResponseTime,
        trend: "degrading",
      });
    }

    if (metrics.errorRate > 0.1) {
      insights.push({
        category: "application",
        severity: metrics.errorRate > 0.2 ? "critical" : "warning",
        message: `High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`,
        metric: "error_rate",
        value: metrics.errorRate,
        trend: "degrading",
      });
    }

    return insights;
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(insights: PerformanceInsight[]): string[] {
    const recommendations: string[] = [];

    insights.forEach((insight) => {
      switch (insight.category) {
        case "memory":
          if (insight.severity === "critical") {
            recommendations.push(
              "Consider increasing memory allocation or implementing memory optimization",
            );
            recommendations.push(
              "Review memory leaks and optimize garbage collection",
            );
          }
          break;
        case "application":
          if (insight.metric === "response_time") {
            recommendations.push(
              "Optimize slow database queries and API calls",
            );
            recommendations.push(
              "Implement caching for frequently accessed data",
            );
          } else if (insight.metric === "error_rate") {
            recommendations.push(
              "Review error logs and implement better error handling",
            );
            recommendations.push(
              "Add circuit breakers for external service calls",
            );
          }
          break;
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Update component status
   */
  private updateComponentStatus(
    component: keyof MonitoringStatus["components"],
    status: ComponentStatus["status"],
    details?: Record<string, unknown>,
  ): void {
    this.status.components[component].status = status;
    this.status.components[component].lastActivity = Date.now();

    if (status === "error") {
      this.status.components[component].errorCount++;
    }

    if (details) {
      this.status.components[component].details = {
        ...this.status.components[component].details,
        ...details,
      };
    }

    this.status.uptime = Date.now() - this.startTime;
    this.status.lastUpdate = Date.now();
  }

  /**
   * Get current monitoring status
   */
  public getStatus(): MonitoringStatus {
    this.status.uptime = Date.now() - this.startTime;
    this.status.lastUpdate = Date.now();
    return { ...this.status };
  }

  /**
   * Get current metrics
   */
  public getCurrentMetrics(): PerformanceMetrics | null {
    return this.metricsCollector?.getCurrentMetrics() || null;
  }

  /**
   * Get system health
   */
  public getSystemHealth(): SystemHealth | null {
    return this.healthChecker?.getSystemHealth() || null;
  }

  /**
   * Get recent alerts
   */
  public getRecentAlerts(limit: number = 50): AlertNotification[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get performance history
   */
  public getPerformanceHistory(limit: number = 24): PerformanceReport[] {
    return this.performanceHistory.slice(-limit);
  }

  /**
   * Export monitoring data in various formats
   */
  public exportData(format: "json" | "csv" | "prometheus"): string {
    if (!this.metricsCollector) {
      throw new Error("Metrics collector not available");
    }

    switch (format) {
      case "prometheus":
        return this.metricsCollector.exportPrometheusMetrics();
      case "csv":
        return this.metricsCollector.exportCSV();
      case "json":
      default:
        return this.metricsCollector.exportJSON();
    }
  }
}
