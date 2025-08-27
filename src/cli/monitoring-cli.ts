#!/usr/bin/env node

/**
 * P1-7: Monitoring and Observability - CLI Interface
 *
 * Command-line interface for monitoring operations:
 * - Start/stop monitoring service
 * - View real-time metrics and health status
 * - Export monitoring data
 * - Configure alerts and thresholds
 * - Generate performance reports
 */

import { program } from "commander";
import chalk from "chalk";
import { promises as fs } from "fs";
import {
  MonitoringService,
  MonitoringServiceConfig,
  MonitoringStatus,
  AlertNotification,
  PerformanceReport,
  PerformanceInsight,
} from "../monitoring/monitoring-service.js";
import { PerformanceMetrics } from "../monitoring/metrics-collector.js";
import { SystemHealth } from "../monitoring/health-checker.js";
import { Logger } from "../utils/logger.js";

interface MonitoringCLIOptions {
  config?: string;
  port?: number;
  healthPort?: number;
  dashboardPort?: number;
  output?: "json" | "table" | "csv";
  format?: "json" | "csv" | "prometheus";
  watch?: boolean;
  limit?: number;
  severity?: "low" | "medium" | "high" | "critical";
}

class MonitoringCLI {
  private monitoringService?: MonitoringService;
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Start monitoring service
   */
  async startMonitoring(options: MonitoringCLIOptions = {}): Promise<void> {
    console.log(chalk.blue.bold("Starting Omni MCP Hub Monitoring Service\n"));

    try {
      const config = await this.loadConfig(options.config);

      if (options.port) {
        config.metricsConfig = {
          ...config.metricsConfig,
          prometheusPort: options.port,
        };
      }
      if (options.healthPort) {
        config.healthConfig = {
          ...config.healthConfig,
          port: options.healthPort,
        };
      }
      if (options.dashboardPort) {
        config.dashboardConfig = {
          ...config.dashboardConfig,
          port: options.dashboardPort,
        };
      }

      this.monitoringService = new MonitoringService(config, this.logger);

      this.setupEventListeners();

      await this.monitoringService.start();

      console.log(chalk.green("Monitoring service started successfully!"));
      console.log(chalk.gray("Services running on:"));

      if (config.metricsConfig?.prometheusEnabled) {
        console.log(
          chalk.cyan(
            `Prometheus metrics: http://localhost:${config.metricsConfig?.prometheusPort || 3001}/metrics`,
          ),
        );
      }

      if (config.healthConfig?.enabled) {
        console.log(
          chalk.cyan(
            `HEALTH Health checks: http://localhost:${config.healthConfig?.port || 3002}/health`,
          ),
        );
      }

      if (config.dashboardConfig?.enabled) {
        console.log(
          chalk.cyan(
            `Dashboard: http://localhost:${config.dashboardConfig?.port || 3003}`,
          ),
        );
      }

      console.log(chalk.yellow("\nPress Ctrl+C to stop monitoring\n"));

      process.on("SIGINT", () => this.gracefulShutdown());
      process.on("SIGTERM", () => this.gracefulShutdown());
    } catch (error) {
      console.error(
        chalk.red("ERROR Failed to start monitoring service:"),
        error,
      );
      process.exit(1);
    }
  }

  /**
   * Stop monitoring service
   */
  async stopMonitoring(): Promise<void> {
    if (!this.monitoringService) {
      console.log(chalk.yellow("WARNING  Monitoring service is not running"));
      return;
    }

    console.log(chalk.blue("STOP Stopping monitoring service..."));

    try {
      await this.monitoringService.stop();
      console.log(
        chalk.green("SUCCESS Monitoring service stopped successfully"),
      );
    } catch (error) {
      console.error(
        chalk.red("ERROR Error stopping monitoring service:"),
        error,
      );
      process.exit(1);
    }
  }

  /**
   * Show current monitoring status
   */
  async showStatus(options: MonitoringCLIOptions = {}): Promise<void> {
    console.log(chalk.blue.bold("REPORT Monitoring Status\n"));

    try {
      if (!this.monitoringService) {
        const config = await this.loadConfig(options.config);
        this.monitoringService = new MonitoringService(config, this.logger);
        await this.monitoringService.start();
      }

      const status = this.monitoringService.getStatus();
      const metrics = this.monitoringService.getCurrentMetrics();
      const health = this.monitoringService.getSystemHealth();

      if (options.output === "json") {
        console.log(JSON.stringify({ status, metrics, health }, null, 2));
        return;
      }

      if (metrics && health) {
        this.displayStatus(status, metrics, health);
      }
    } catch (error) {
      console.error(chalk.red("ERROR Failed to get monitoring status:"), error);
      process.exit(1);
    }
  }

  /**
   * Show current metrics
   */
  async showMetrics(options: MonitoringCLIOptions = {}): Promise<void> {
    try {
      if (!this.monitoringService) {
        const config = await this.loadConfig(options.config);
        this.monitoringService = new MonitoringService(config, this.logger);
        await this.monitoringService.start();
      }

      const metrics = this.monitoringService.getCurrentMetrics();

      if (!metrics) {
        console.log(chalk.yellow("WARNING  No metrics available"));
        return;
      }

      if (options.output === "json") {
        console.log(JSON.stringify(metrics, null, 2));
        return;
      }

      console.log(chalk.blue.bold("TREND_UP Performance Metrics\n"));
      this.displayMetrics(metrics);

      if (options.watch) {
        console.log(
          chalk.gray("\nWATCH Watching for updates... Press Ctrl+C to stop\n"),
        );
        const interval = setInterval(async () => {
          const updatedMetrics = this.monitoringService!.getCurrentMetrics();
          if (updatedMetrics) {
            console.clear();
            console.log(
              chalk.blue.bold("TREND_UP Performance Metrics (Live)\n"),
            );
            this.displayMetrics(updatedMetrics);
          }
        }, 5000);

        process.on("SIGINT", () => {
          clearInterval(interval);
          process.exit(0);
        });
      }
    } catch (error) {
      console.error(chalk.red("ERROR Failed to get metrics:"), error);
      process.exit(1);
    }
  }

  /**
   * Show system health
   */
  async showHealth(options: MonitoringCLIOptions = {}): Promise<void> {
    try {
      if (!this.monitoringService) {
        const config = await this.loadConfig(options.config);
        this.monitoringService = new MonitoringService(config, this.logger);
        await this.monitoringService.start();
      }

      const health = this.monitoringService.getSystemHealth();

      if (!health) {
        console.log(chalk.yellow("WARNING  No health data available"));
        return;
      }

      if (options.output === "json") {
        console.log(JSON.stringify(health, null, 2));
        return;
      }

      console.log(chalk.blue.bold("HEALTH System Health\n"));
      this.displayHealth(health);
    } catch (error) {
      console.error(chalk.red("ERROR Failed to get health status:"), error);
      process.exit(1);
    }
  }

  /**
   * Show recent alerts
   */
  async showAlerts(options: MonitoringCLIOptions = {}): Promise<void> {
    try {
      if (!this.monitoringService) {
        const config = await this.loadConfig(options.config);
        this.monitoringService = new MonitoringService(config, this.logger);
        await this.monitoringService.start();
      }

      const alerts = this.monitoringService.getRecentAlerts(
        options.limit || 20,
      );

      if (alerts.length === 0) {
        console.log(chalk.green("SUCCESS No recent alerts"));
        return;
      }

      if (options.output === "json") {
        console.log(JSON.stringify(alerts, null, 2));
        return;
      }

      console.log(chalk.blue.bold(`ALERT Recent Alerts (${alerts.length})\n`));
      this.displayAlerts(alerts, options.severity);
    } catch (error) {
      console.error(chalk.red("ERROR Failed to get alerts:"), error);
      process.exit(1);
    }
  }

  /**
   * Export monitoring data
   */
  async exportData(options: MonitoringCLIOptions = {}): Promise<void> {
    try {
      if (!this.monitoringService) {
        const config = await this.loadConfig(options.config);
        this.monitoringService = new MonitoringService(config, this.logger);
        await this.monitoringService.start();
      }

      const format = options.format || "json";
      const data = this.monitoringService.exportData(format);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `monitoring-export-${timestamp}.${format}`;

      await fs.writeFile(filename, data);

      console.log(chalk.green(`SUCCESS Data exported to: ${filename}`));
      console.log(chalk.gray(`Format: ${format.toUpperCase()}`));
      console.log(chalk.gray(`Size: ${data.length} bytes`));
    } catch (error) {
      console.error(chalk.red("ERROR Failed to export data:"), error);
      process.exit(1);
    }
  }

  /**
   * Generate performance report
   */
  async generateReport(options: MonitoringCLIOptions = {}): Promise<void> {
    try {
      if (!this.monitoringService) {
        const config = await this.loadConfig(options.config);
        this.monitoringService = new MonitoringService(config, this.logger);
        await this.monitoringService.start();
      }

      console.log(chalk.blue.bold("REPORT Generating Performance Report...\n"));

      const history = this.monitoringService.getPerformanceHistory(
        options.limit || 24,
      );

      if (history.length === 0) {
        console.log(chalk.yellow("WARNING  No performance history available"));
        return;
      }

      const latestReport = history[history.length - 1];

      if (options.output === "json") {
        console.log(JSON.stringify({ history, latest: latestReport }, null, 2));
        return;
      }

      this.displayPerformanceReport(latestReport);
    } catch (error) {
      console.error(chalk.red("ERROR Failed to generate report:"), error);
      process.exit(1);
    }
  }

  /**
   * Load configuration from file or use defaults
   */
  private async loadConfig(
    configPath?: string,
  ): Promise<MonitoringServiceConfig> {
    const defaultConfig: MonitoringServiceConfig = {
      enabled: true,
      metricsConfig: {
        enabled: true,
        collectInterval: 15000,
        prometheusEnabled: true,
        prometheusPort: 3001,
      },
      healthConfig: {
        enabled: true,
        port: 3002,
        interval: 30000,
      },
      dashboardConfig: {
        enabled: true,
        port: 3003,
        wsPort: 3004,
      },
      alerting: {
        enabled: true,
      },
    };

    if (!configPath) {
      return defaultConfig;
    }

    try {
      const configFile = await fs.readFile(configPath, "utf-8");
      const userConfig = JSON.parse(configFile);
      return { ...defaultConfig, ...userConfig };
    } catch (_error) {
      console.log(
        chalk.yellow(
          `WARNING  Could not load config from ${configPath}, using defaults`,
        ),
      );
      return defaultConfig;
    }
  }

  /**
   * Setup event listeners for CLI feedback
   */
  private setupEventListeners(): void {
    if (!this.monitoringService) return;

    this.monitoringService.on("alert", (alert) => {
      const severityColors: Record<string, string> = {
        low: "blue",
        medium: "yellow",
        high: "magenta",
        critical: "red",
      };
      const severityColor = severityColors[alert.severity] || "gray";

      const colorFunc =
        severityColor === "blue"
          ? chalk.blue
          : severityColor === "yellow"
            ? chalk.yellow
            : severityColor === "magenta"
              ? chalk.magenta
              : severityColor === "red"
                ? chalk.red
                : chalk.gray;
      console.log(
        colorFunc(
          `\nALERT ALERT [${alert.severity.toUpperCase()}]: ${alert.title}`,
        ),
      );
      console.log(chalk.gray(`   ${alert.message}`));
      console.log(chalk.gray(`   Component: ${alert.component}`));
      console.log(
        chalk.gray(`   Time: ${new Date(alert.timestamp).toLocaleString()}\n`),
      );
    });

    this.monitoringService.on("critical-alert", (alert) => {
      console.log(chalk.red.bold("\nCRITICAL CRITICAL ALERT:"), alert.title);
      console.log(chalk.red(`   ${alert.message}`));
      console.log(chalk.red(`   Immediate attention required!\n`));
    });
  }

  /**
   * Display monitoring status
   */
  private displayStatus(
    status: MonitoringStatus,
    metrics: PerformanceMetrics,
    health: SystemHealth,
  ): void {
    console.log(chalk.cyan("Service Status:"));
    console.log(
      `  Enabled: ${status.enabled ? chalk.green("SUCCESS Yes") : chalk.red("ERROR No")}`,
    );
    console.log(`  Uptime: ${Math.round(status.uptime / 1000)}s`);
    console.log(
      `  Last Update: ${new Date(status.lastUpdate).toLocaleString()}\n`,
    );

    console.log(chalk.cyan("Components:"));
    Object.entries(status.components).forEach(([name, comp]) => {
      const statusIcons: Record<string, string> = {
        running: "RUNNING",
        stopped: "STOPPED",
        starting: "STARTING",
        error: "ERROR",
      };
      const statusIcon = statusIcons[comp.status] || "UNKNOWN";

      console.log(
        `  ${name}: ${statusIcon} ${comp.status} (errors: ${comp.errorCount})`,
      );
    });

    if (health) {
      console.log(
        `\n${chalk.cyan("Overall Health:")} ${this.getHealthIcon(health.status)} ${health.status.toUpperCase()}`,
      );
    }

    if (metrics) {
      console.log(`\n${chalk.cyan("Quick Stats:")}`);
      console.log(`  Requests: ${metrics.totalRequests}`);
      console.log(
        `  Success Rate: ${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%`,
      );
      console.log(
        `  Avg Response: ${metrics.averageResponseTime.toFixed(1)}ms`,
      );
      console.log(
        `  Memory: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`,
      );
    }
  }

  /**
   * Display metrics in table format
   */
  private displayMetrics(metrics: PerformanceMetrics): void {
    const sections = [
      {
        title: "Request Metrics",
        items: [
          ["Total Requests", metrics.totalRequests],
          ["Successful Requests", metrics.successfulRequests],
          ["Failed Requests", metrics.failedRequests],
          [
            "Success Rate",
            `${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%`,
          ],
          ["Requests/sec", metrics.requestsPerSecond.toFixed(1)],
        ],
      },
      {
        title: "Performance",
        items: [
          ["Avg Response Time", `${metrics.averageResponseTime.toFixed(1)}ms`],
          ["P95 Response Time", `${metrics.p95ResponseTime.toFixed(1)}ms`],
          ["P99 Response Time", `${metrics.p99ResponseTime.toFixed(1)}ms`],
          ["Active Connections", metrics.activeConnections],
        ],
      },
      {
        title: "System Resources",
        items: [
          [
            "Memory (Heap)",
            `${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`,
          ],
          [
            "Memory (Total)",
            `${Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024)}MB`,
          ],
          [
            "Memory (RSS)",
            `${Math.round(metrics.memoryUsage.rss / 1024 / 1024)}MB`,
          ],
          ["Uptime", `${Math.round(metrics.uptime)}s`],
        ],
      },
    ];

    sections.forEach((section) => {
      console.log(chalk.cyan.bold(section.title + ":"));
      section.items.forEach(([label, value]) => {
        console.log(`  ${label}: ${chalk.white.bold(value)}`);
      });
      console.log();
    });
  }

  /**
   * Display health status
   */
  private displayHealth(health: SystemHealth): void {
    console.log(
      `Overall Status: ${this.getHealthIcon(health.status)} ${chalk.bold(health.status.toUpperCase())}\n`,
    );

    console.log(chalk.cyan("Component Health:"));
    Object.entries(health.components).forEach(([name, component]) => {
      const icon = this.getHealthIcon(component.status);
      console.log(`  ${name}: ${icon} ${component.status}`);

      if (component.checks && component.checks.length > 0) {
        component.checks
          .slice(-3)
          .forEach(
            (check: { name: string; status: string; message: string }) => {
              const checkIcon = this.getHealthIcon(check.status);
              console.log(`    ${check.name}: ${checkIcon} ${check.message}`);
            },
          );
      }
    });

    console.log(`\n${chalk.cyan("Health Metrics:")}`);
    console.log(`  Total Checks: ${health.metrics.totalChecks}`);
    console.log(`  Healthy: ${health.metrics.healthyChecks}`);
    console.log(`  Degraded: ${health.metrics.degradedChecks}`);
    console.log(`  Unhealthy: ${health.metrics.unhealthyChecks}`);
    console.log(
      `  Avg Response Time: ${health.metrics.averageResponseTime.toFixed(1)}ms`,
    );
  }

  /**
   * Display alerts
   */
  private displayAlerts(
    alerts: AlertNotification[],
    severityFilter?: string,
  ): void {
    const filteredAlerts = severityFilter
      ? alerts.filter((alert) => alert.severity === severityFilter)
      : alerts;

    if (filteredAlerts.length === 0) {
      console.log(chalk.green("SUCCESS No alerts matching criteria"));
      return;
    }

    filteredAlerts.forEach((alert) => {
      const severityColors: Record<string, string> = {
        low: "blue",
        medium: "yellow",
        high: "magenta",
        critical: "red",
      };
      const severityColor = severityColors[alert.severity] || "gray";

      const colorFunc2 =
        severityColor === "blue"
          ? chalk.blue
          : severityColor === "yellow"
            ? chalk.yellow
            : severityColor === "magenta"
              ? chalk.magenta
              : severityColor === "red"
                ? chalk.red
                : chalk.gray;
      console.log(
        colorFunc2(`[${alert.severity.toUpperCase()}] ${alert.title}`),
      );
      console.log(`  Message: ${alert.message}`);
      console.log(`  Component: ${alert.component}`);
      console.log(`  Time: ${new Date(alert.timestamp).toLocaleString()}`);
      if (alert.metric) {
        console.log(`  Metric: ${alert.metric} = ${alert.value}`);
      }
      console.log();
    });
  }

  /**
   * Display performance report
   */
  private displayPerformanceReport(report: PerformanceReport): void {
    console.log(chalk.blue.bold("REPORT Performance Report"));
    console.log(
      chalk.gray(`Generated: ${new Date(report.timestamp).toLocaleString()}`),
    );
    console.log(chalk.gray(`Analysis Duration: ${report.duration}ms\n`));

    if (report.insights.length > 0) {
      console.log(chalk.cyan("INSIGHTS Performance Insights:"));
      report.insights.forEach((insight: PerformanceInsight) => {
        const severityIcons: Record<string, string> = {
          info: "INFO",
          warning: "WARNING",
          critical: "CRITICAL",
        };
        const severityIcon = severityIcons[insight.severity] || "INFO";

        console.log(
          `  ${severityIcon} [${insight.category?.toUpperCase() || "GENERAL"}] ${insight.message}`,
        );
        if (insight.trend) {
          const trendIcons: Record<string, string> = {
            improving: "TREND_UP",
            stable: "STABLE",
            degrading: "TREND_DOWN",
          };
          const trendIcon = trendIcons[insight.trend] || "";
          console.log(`      Trend: ${trendIcon} ${insight.trend}`);
        }
      });
      console.log();
    }

    if (report.recommendations.length > 0) {
      console.log(chalk.cyan("INFO Recommendations:"));
      report.recommendations.forEach((rec: string, index: number) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
      console.log();
    }

    console.log(chalk.cyan("TREND_UP Key Metrics:"));
    console.log(
      `  Memory Usage: ${Math.round(report.metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`,
    );
    console.log(
      `  Response Time: ${report.metrics.averageResponseTime.toFixed(1)}ms`,
    );
    console.log(
      `  Error Rate: ${(report.metrics.errorRate * 100).toFixed(2)}%`,
    );
    console.log(
      `  Requests/sec: ${report.metrics.requestsPerSecond.toFixed(1)}`,
    );
    console.log(`  Active Connections: ${report.metrics.activeConnections}`);
  }

  /**
   * Get health status icon
   */
  private getHealthIcon(status: string): string {
    const icons = {
      healthy: "HEALTHY",
      degraded: "DEGRADED",
      unhealthy: "UNHEALTHY",
      unknown: "UNKNOWN",
    };
    return icons[status as keyof typeof icons] || "UNKNOWN";
  }

  /**
   * Graceful shutdown
   */
  private async gracefulShutdown(): Promise<void> {
    console.log(
      chalk.blue("\nSTOP Gracefully shutting down monitoring service..."),
    );

    try {
      if (this.monitoringService) {
        await this.monitoringService.stop();
      }
      console.log(
        chalk.green("SUCCESS Monitoring service stopped successfully"),
      );
      process.exit(0);
    } catch (error) {
      console.error(chalk.red("ERROR Error during shutdown:"), error);
      process.exit(1);
    }
  }
}

program
  .name("omni-monitoring")
  .description("Omni MCP Hub Monitoring CLI")
  .version("1.0.0");

program
  .command("start")
  .description("Start monitoring service")
  .option("-c, --config <path>", "Configuration file path")
  .option("-p, --port <number>", "Prometheus metrics port", parseInt)
  .option("--health-port <number>", "Health check port", parseInt)
  .option("--dashboard-port <number>", "Dashboard port", parseInt)
  .action(async (options) => {
    const cli = new MonitoringCLI();
    await cli.startMonitoring(options);
  });

program
  .command("status")
  .description("Show monitoring status")
  .option("-c, --config <path>", "Configuration file path")
  .option("-o, --output <format>", "Output format (json, table)", "table")
  .action(async (options) => {
    const cli = new MonitoringCLI();
    await cli.showStatus(options);
    process.exit(0);
  });

program
  .command("metrics")
  .description("Show current metrics")
  .option("-c, --config <path>", "Configuration file path")
  .option("-o, --output <format>", "Output format (json, table)", "table")
  .option("-w, --watch", "Watch metrics in real-time")
  .action(async (options) => {
    const cli = new MonitoringCLI();
    await cli.showMetrics(options);
    if (!options.watch) process.exit(0);
  });

program
  .command("health")
  .description("Show system health")
  .option("-c, --config <path>", "Configuration file path")
  .option("-o, --output <format>", "Output format (json, table)", "table")
  .action(async (options) => {
    const cli = new MonitoringCLI();
    await cli.showHealth(options);
    process.exit(0);
  });

program
  .command("alerts")
  .description("Show recent alerts")
  .option("-c, --config <path>", "Configuration file path")
  .option("-o, --output <format>", "Output format (json, table)", "table")
  .option("-l, --limit <number>", "Number of alerts to show", parseInt, 20)
  .option(
    "-s, --severity <level>",
    "Filter by severity (low, medium, high, critical)",
  )
  .action(async (options) => {
    const cli = new MonitoringCLI();
    await cli.showAlerts(options);
    process.exit(0);
  });

program
  .command("export")
  .description("Export monitoring data")
  .option("-c, --config <path>", "Configuration file path")
  .option(
    "-f, --format <format>",
    "Export format (json, csv, prometheus)",
    "json",
  )
  .action(async (options) => {
    const cli = new MonitoringCLI();
    await cli.exportData(options);
    process.exit(0);
  });

program
  .command("report")
  .description("Generate performance report")
  .option("-c, --config <path>", "Configuration file path")
  .option("-o, --output <format>", "Output format (json, table)", "table")
  .option("-l, --limit <number>", "Number of historical reports", parseInt, 24)
  .action(async (options) => {
    const cli = new MonitoringCLI();
    await cli.generateReport(options);
    process.exit(0);
  });

export async function run(args: string[]): Promise<void> {
  program.exitOverride();
  await program.parseAsync(args, { from: "user" });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.on("unhandledRejection", (error) => {
    console.error(chalk.red("CRITICAL Unhandled error:"), error);
    process.exit(1);
  });

  program.parse();
}
