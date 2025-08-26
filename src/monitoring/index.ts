/**
 * P1-7: Monitoring and Observability - Exports
 *
 * Central exports for the comprehensive monitoring system
 */

// Core monitoring service
export { MonitoringService } from "./monitoring-service.js";
export type {
  MonitoringServiceConfig,
  MonitoringStatus,
  ComponentStatus,
  AlertNotification,
  PerformanceReport,
  PerformanceInsight,
} from "./monitoring-service.js";

// Metrics collection
export { MetricsCollector } from "./metrics-collector.js";
export type {
  MetricDefinition,
  MetricSample,
  PerformanceMetrics,
  MonitoringConfig,
} from "./metrics-collector.js";

// Health checking
export { HealthChecker } from "./health-checker.js";
export type {
  HealthCheckResult,
  HealthStatus,
  ComponentHealth,
  SystemHealth,
  HealthCheckConfig,
  HealthCheckDefinition,
} from "./health-checker.js";

// Dashboard
export { MonitoringDashboard } from "./dashboard.js";
export type {
  DashboardConfig,
  DashboardData,
  AlertSummary,
  SystemInfo,
  ChartDataPoint,
  ChartData,
} from "./dashboard.js";

// Utility function to create a complete monitoring setup
import type { MonitoringServiceConfig as MSConfig } from "./monitoring-service.js";
import { MonitoringService } from "./monitoring-service.js";

export function createMonitoringService(config?: Partial<MSConfig>) {
  return new MonitoringService(config);
}
