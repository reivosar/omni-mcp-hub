/**
 * P1-7: Monitoring and Observability - Dashboard System
 * 
 * Comprehensive monitoring dashboard with:
 * - Real-time metrics visualization
 * - System health overview
 * - Alert management interface
 * - Historical data analysis
 * - Export capabilities
 * - WebSocket-based live updates
 */

import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { MetricsCollector, PerformanceMetrics } from './metrics-collector.js';
import { HealthChecker, SystemHealth, HealthStatus } from './health-checker.js';

export interface DashboardConfig {
  enabled: boolean;
  port: number;
  wsPort: number;
  refreshInterval: number;
  maxHistoryPoints: number;
  authentication: {
    enabled: boolean;
    username?: string;
    password?: string;
    tokenSecret?: string;
  };
  features: {
    liveMetrics: boolean;
    historicalCharts: boolean;
    alertManagement: boolean;
    systemInfo: boolean;
    exportData: boolean;
  };
}

export interface DashboardData {
  timestamp: number;
  systemHealth: SystemHealth;
  metrics: PerformanceMetrics;
  alerts: AlertSummary;
  systemInfo: SystemInfo;
}

export interface AlertSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  recent: AlertInfo[];
}

export interface AlertInfo {
  id: string;
  name: string;
  severity: string;
  status: string;
  message: string;
  timestamp: number;
  component: string;
}

export interface SystemInfo {
  nodeVersion: string;
  platform: string;
  architecture: string;
  hostname: string;
  uptime: number;
  loadAverage: number[];
  networkInterfaces: any;
  environment: Record<string, string>;
}

export interface ChartDataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

export interface ChartData {
  name: string;
  data: ChartDataPoint[];
  unit: string;
  color: string;
}

/**
 * Monitoring dashboard with real-time updates and comprehensive system overview
 */
export class MonitoringDashboard extends EventEmitter {
  private config: DashboardConfig;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private healthChecker: HealthChecker;
  private server?: http.Server;
  private wsServer?: WebSocketServer;
  private connectedClients: Set<WebSocket> = new Set();
  private refreshTimer?: NodeJS.Timeout;
  private historicalData: Map<string, ChartDataPoint[]> = new Map();
  private isRunning: boolean = false;

  constructor(
    config: Partial<DashboardConfig>,
    metricsCollector: MetricsCollector,
    healthChecker: HealthChecker,
    logger?: Logger
  ) {
    super();
    this.logger = logger || Logger.getInstance();
    this.metricsCollector = metricsCollector;
    this.healthChecker = healthChecker;
    
    this.config = {
      enabled: true,
      port: 3003,
      wsPort: 3004,
      refreshInterval: 5000, // 5 seconds
      maxHistoryPoints: 1000,
      authentication: {
        enabled: false
      },
      features: {
        liveMetrics: true,
        historicalCharts: true,
        alertManagement: true,
        systemInfo: true,
        exportData: true
      },
      ...config
    };

    this.initializeHistoricalData();
    this.setupEventListeners();
  }

  /**
   * Initialize historical data tracking
   */
  private initializeHistoricalData(): void {
    const metricsToTrack = [
      'memory_usage',
      'cpu_usage',
      'request_rate',
      'error_rate',
      'response_time',
      'active_connections',
      'event_loop_delay'
    ];

    metricsToTrack.forEach(metric => {
      this.historicalData.set(metric, []);
    });
  }

  /**
   * Setup event listeners for real-time data collection
   */
  private setupEventListeners(): void {
    // Listen for metrics updates
    this.metricsCollector.on('metrics-collected', () => {
      this.updateHistoricalData();
      this.broadcastUpdate();
    });

    // Listen for health check updates
    this.healthChecker.on('check-completed', () => {
      this.broadcastUpdate();
    });

    // Listen for alerts
    this.healthChecker.on('critical-failure', (data) => {
      this.broadcastAlert(data);
    });
  }

  /**
   * Start the dashboard server
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Dashboard is already running');
      return;
    }

    if (!this.config.enabled) {
      this.logger.info('Dashboard is disabled');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting monitoring dashboard...');

    // Start HTTP server
    await this.startHttpServer();

    // Start WebSocket server
    await this.startWebSocketServer();

    // Start refresh timer
    this.startRefreshTimer();

    this.emit('started');
    this.logger.info(`Dashboard started on http://localhost:${this.config.port}`);
  }

  /**
   * Stop the dashboard server
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping dashboard...');

    // Stop refresh timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    // Close WebSocket connections
    this.connectedClients.forEach(ws => ws.close());
    this.connectedClients.clear();

    // Stop servers
    if (this.wsServer) {
      this.wsServer.close();
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = undefined;
    }

    this.emit('stopped');
    this.logger.info('Dashboard stopped');
  }

  /**
   * Start HTTP server for dashboard
   */
  private async startHttpServer(): Promise<void> {
    this.server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
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
   * Start WebSocket server for real-time updates
   */
  private async startWebSocketServer(): Promise<void> {
    this.wsServer = new WebSocketServer({ port: this.config.wsPort });

    this.wsServer.on('connection', (ws) => {
      this.handleWebSocketConnection(ws);
    });

    this.wsServer.on('error', (error) => {
      this.logger.error('WebSocket server error:', error);
    });
  }

  /**
   * Handle HTTP requests
   */
  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');

    const url = req.url || '';

    try {
      if (url === '/') {
        this.sendDashboardHTML(res);
      } else if (url === '/api/dashboard') {
        this.sendDashboardData(res);
      } else if (url === '/api/metrics') {
        this.sendMetricsData(res);
      } else if (url === '/api/health') {
        this.sendHealthData(res);
      } else if (url === '/api/alerts') {
        this.sendAlertsData(res);
      } else if (url === '/api/system') {
        this.sendSystemInfo(res);
      } else if (url.startsWith('/api/export/')) {
        this.handleExportRequest(url, res);
      } else if (url.startsWith('/api/history/')) {
        this.sendHistoricalData(url, res);
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    } catch (error) {
      this.logger.error('Error handling HTTP request:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }

  /**
   * Send dashboard HTML
   */
  private sendDashboardHTML(res: http.ServerResponse): void {
    res.setHeader('Content-Type', 'text/html');
    res.end(this.generateDashboardHTML());
  }

  /**
   * Send complete dashboard data
   */
  private sendDashboardData(res: http.ServerResponse): void {
    const data: DashboardData = {
      timestamp: Date.now(),
      systemHealth: this.healthChecker.getSystemHealth(),
      metrics: this.metricsCollector.getCurrentMetrics(),
      alerts: this.getAlertSummary(),
      systemInfo: this.getSystemInfo()
    };
    
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send metrics data
   */
  private sendMetricsData(res: http.ServerResponse): void {
    const metrics = this.metricsCollector.getCurrentMetrics();
    res.end(JSON.stringify(metrics, null, 2));
  }

  /**
   * Send health data
   */
  private sendHealthData(res: http.ServerResponse): void {
    const health = this.healthChecker.getSystemHealth();
    res.end(JSON.stringify(health, null, 2));
  }

  /**
   * Send alerts data
   */
  private sendAlertsData(res: http.ServerResponse): void {
    const alerts = this.getAlertSummary();
    res.end(JSON.stringify(alerts, null, 2));
  }

  /**
   * Send system information
   */
  private sendSystemInfo(res: http.ServerResponse): void {
    const systemInfo = this.getSystemInfo();
    res.end(JSON.stringify(systemInfo, null, 2));
  }

  /**
   * Send historical data
   */
  private sendHistoricalData(url: string, res: http.ServerResponse): void {
    const metricName = url.split('/').pop();
    if (!metricName) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Metric name required' }));
      return;
    }

    const data = this.historicalData.get(metricName) || [];
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Handle export requests
   */
  private handleExportRequest(url: string, res: http.ServerResponse): void {
    const format = url.split('/').pop();
    
    switch (format) {
      case 'prometheus':
        res.setHeader('Content-Type', 'text/plain');
        res.end(this.metricsCollector.exportPrometheusMetrics());
        break;
      case 'json':
        res.end(this.metricsCollector.exportJSON());
        break;
      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.end(this.metricsCollector.exportCSV());
        break;
      default:
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Unsupported export format' }));
    }
  }

  /**
   * Handle WebSocket connections
   */
  private handleWebSocketConnection(ws: WebSocket): void {
    this.connectedClients.add(ws);
    this.logger.debug('New WebSocket connection established');

    // Send initial data
    this.sendInitialData(ws);

    ws.on('close', () => {
      this.connectedClients.delete(ws);
      this.logger.debug('WebSocket connection closed');
    });

    ws.on('error', (error) => {
      this.logger.error('WebSocket error:', error);
      this.connectedClients.delete(ws);
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleWebSocketMessage(ws, data);
      } catch (error) {
        this.logger.error('Invalid WebSocket message:', error);
      }
    });
  }

  /**
   * Send initial data to WebSocket client
   */
  private sendInitialData(ws: WebSocket): void {
    const data = {
      type: 'initial',
      data: {
        timestamp: Date.now(),
        systemHealth: this.healthChecker.getSystemHealth(),
        metrics: this.metricsCollector.getCurrentMetrics(),
        alerts: this.getAlertSummary()
      }
    };

    this.sendWebSocketMessage(ws, data);
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'subscribe':
        // Handle subscription to specific metrics
        break;
      case 'unsubscribe':
        // Handle unsubscription
        break;
      case 'get-history':
        this.sendHistoryToWebSocket(ws, message.metric, message.timeRange);
        break;
      default:
        this.logger.warn('Unknown WebSocket message type:', message.type);
    }
  }

  /**
   * Send history data via WebSocket
   */
  private sendHistoryToWebSocket(ws: WebSocket, metric: string, timeRange?: number): void {
    const data = this.historicalData.get(metric) || [];
    const filteredData = timeRange ? 
      data.filter(d => d.timestamp >= Date.now() - timeRange) : 
      data;

    this.sendWebSocketMessage(ws, {
      type: 'history',
      metric,
      data: filteredData
    });
  }

  /**
   * Send WebSocket message
   */
  private sendWebSocketMessage(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast updates to all connected clients
   */
  private broadcastUpdate(): void {
    if (this.connectedClients.size === 0) return;

    const update = {
      type: 'update',
      timestamp: Date.now(),
      data: {
        systemHealth: this.healthChecker.getSystemHealth(),
        metrics: this.metricsCollector.getCurrentMetrics(),
        alerts: this.getAlertSummary()
      }
    };

    this.connectedClients.forEach(ws => {
      this.sendWebSocketMessage(ws, update);
    });
  }

  /**
   * Broadcast alert to all connected clients
   */
  private broadcastAlert(alertData: any): void {
    const alert = {
      type: 'alert',
      timestamp: Date.now(),
      data: alertData
    };

    this.connectedClients.forEach(ws => {
      this.sendWebSocketMessage(ws, alert);
    });
  }

  /**
   * Start refresh timer
   */
  private startRefreshTimer(): void {
    this.refreshTimer = setInterval(() => {
      this.updateHistoricalData();
      this.broadcastUpdate();
    }, this.config.refreshInterval);
  }

  /**
   * Update historical data
   */
  private updateHistoricalData(): void {
    const timestamp = Date.now();
    const metrics = this.metricsCollector.getCurrentMetrics();
    
    // Add data points for tracked metrics
    this.addHistoricalPoint('memory_usage', timestamp, metrics.memoryUsage.heapUsed);
    this.addHistoricalPoint('request_rate', timestamp, metrics.requestsPerSecond);
    this.addHistoricalPoint('error_rate', timestamp, metrics.errorRate);
    this.addHistoricalPoint('response_time', timestamp, metrics.averageResponseTime);
    this.addHistoricalPoint('active_connections', timestamp, metrics.activeConnections);
  }

  /**
   * Add historical data point
   */
  private addHistoricalPoint(metric: string, timestamp: number, value: number): void {
    const data = this.historicalData.get(metric) || [];
    data.push({ timestamp, value });
    
    // Keep only recent points
    if (data.length > this.config.maxHistoryPoints) {
      data.splice(0, data.length - this.config.maxHistoryPoints);
    }
    
    this.historicalData.set(metric, data);
  }

  /**
   * Get alert summary
   */
  private getAlertSummary(): AlertSummary {
    // For now, return empty summary
    // In production, this would aggregate actual alerts
    return {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      recent: []
    };
  }

  /**
   * Get system information
   */
  private getSystemInfo(): SystemInfo {
    const os = require('os');
    
    return {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      hostname: os.hostname(),
      uptime: process.uptime(),
      loadAverage: os.loadavg(),
      networkInterfaces: os.networkInterfaces(),
      environment: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        TZ: process.env.TZ || 'UTC'
      }
    };
  }

  /**
   * Generate dashboard HTML
   */
  private generateDashboardHTML(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Omni MCP Hub - Monitoring Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .header h1 { margin: 0; color: #333; }
        .header .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; }
        .status.healthy { background: #d4edda; color: #155724; }
        .status.degraded { background: #fff3cd; color: #856404; }
        .status.unhealthy { background: #f8d7da; color: #721c24; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h3 { margin-top: 0; color: #333; }
        .metric { display: flex; justify-content: space-between; margin: 10px 0; }
        .metric-value { font-weight: bold; }
        .loading { text-align: center; padding: 40px; color: #666; }
        .error { color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Omni MCP Hub - Monitoring Dashboard</h1>
        <span id="system-status" class="status">Loading...</span>
        <span style="float: right; color: #666;">Last updated: <span id="last-update">-</span></span>
    </div>
    
    <div id="loading" class="loading">Loading dashboard data...</div>
    <div id="error" class="error" style="display: none;"></div>
    
    <div id="dashboard" style="display: none;">
        <div class="grid">
            <div class="card">
                <h3>System Health</h3>
                <div id="health-content"></div>
            </div>
            
            <div class="card">
                <h3>Performance Metrics</h3>
                <div id="metrics-content"></div>
            </div>
            
            <div class="card">
                <h3>System Information</h3>
                <div id="system-content"></div>
            </div>
            
            <div class="card">
                <h3>Recent Alerts</h3>
                <div id="alerts-content"></div>
            </div>
        </div>
    </div>
    
    <script>
        let ws;
        
        function connectWebSocket() {
            ws = new WebSocket('ws://localhost:${this.config.wsPort}');
            
            ws.onopen = function() {
                console.log('WebSocket connected');
            };
            
            ws.onmessage = function(event) {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            };
            
            ws.onclose = function() {
                console.log('WebSocket disconnected');
                setTimeout(connectWebSocket, 5000);
            };
            
            ws.onerror = function(error) {
                console.error('WebSocket error:', error);
            };
        }
        
        function handleWebSocketMessage(message) {
            switch(message.type) {
                case 'initial':
                case 'update':
                    updateDashboard(message.data);
                    break;
                case 'alert':
                    handleAlert(message.data);
                    break;
            }
        }
        
        function updateDashboard(data) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            
            // Update system status
            const statusElement = document.getElementById('system-status');
            statusElement.textContent = data.systemHealth.status.toUpperCase();
            statusElement.className = 'status ' + data.systemHealth.status;
            
            // Update timestamp
            document.getElementById('last-update').textContent = new Date(data.timestamp).toLocaleTimeString();
            
            // Update health content
            updateHealthContent(data.systemHealth);
            
            // Update metrics content
            updateMetricsContent(data.metrics);
            
            // Update system content
            if (data.systemInfo) {
                updateSystemContent(data.systemInfo);
            }
            
            // Update alerts content
            updateAlertsContent(data.alerts);
        }
        
        function updateHealthContent(health) {
            const content = document.getElementById('health-content');
            let html = '';
            
            Object.entries(health.components).forEach(([name, component]) => {
                html += '<div class="metric">';
                html += '<span>' + name + '</span>';
                html += '<span class="metric-value status ' + component.status + '">' + component.status.toUpperCase() + '</span>';
                html += '</div>';
            });
            
            content.innerHTML = html;
        }
        
        function updateMetricsContent(metrics) {
            const content = document.getElementById('metrics-content');
            let html = '';
            
            const metricsToShow = [
                { label: 'Total Requests', value: metrics.totalRequests },
                { label: 'Success Rate', value: ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1) + '%' },
                { label: 'Avg Response Time', value: metrics.averageResponseTime.toFixed(1) + 'ms' },
                { label: 'Requests/sec', value: metrics.requestsPerSecond.toFixed(1) },
                { label: 'Memory Usage', value: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024) + 'MB' },
                { label: 'Active Connections', value: metrics.activeConnections },
                { label: 'Uptime', value: Math.round(metrics.uptime) + 's' }
            ];
            
            metricsToShow.forEach(metric => {
                html += '<div class="metric">';
                html += '<span>' + metric.label + '</span>';
                html += '<span class="metric-value">' + metric.value + '</span>';
                html += '</div>';
            });
            
            content.innerHTML = html;
        }
        
        function updateSystemContent(systemInfo) {
            const content = document.getElementById('system-content');
            let html = '';
            
            const systemToShow = [
                { label: 'Node.js', value: systemInfo.nodeVersion },
                { label: 'Platform', value: systemInfo.platform + ' (' + systemInfo.architecture + ')' },
                { label: 'Hostname', value: systemInfo.hostname },
                { label: 'Environment', value: systemInfo.environment.NODE_ENV }
            ];
            
            systemToShow.forEach(item => {
                html += '<div class="metric">';
                html += '<span>' + item.label + '</span>';
                html += '<span class="metric-value">' + item.value + '</span>';
                html += '</div>';
            });
            
            content.innerHTML = html;
        }
        
        function updateAlertsContent(alerts) {
            const content = document.getElementById('alerts-content');
            
            if (alerts.total === 0) {
                content.innerHTML = '<p style="color: #28a745;">No active alerts</p>';
                return;
            }
            
            let html = '<div class="metric">';
            html += '<span>Total Alerts</span>';
            html += '<span class="metric-value">' + alerts.total + '</span>';
            html += '</div>';
            
            if (alerts.critical > 0) {
                html += '<div class="metric">';
                html += '<span>Critical</span>';
                html += '<span class="metric-value" style="color: #dc3545;">' + alerts.critical + '</span>';
                html += '</div>';
            }
            
            content.innerHTML = html;
        }
        
        function handleAlert(alertData) {
            // Handle real-time alerts
            console.log('Alert received:', alertData);
        }
        
        function showError(message) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('dashboard').style.display = 'none';
            const errorElement = document.getElementById('error');
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
        
        // Initialize dashboard
        async function loadInitialData() {
            try {
                const response = await fetch('/api/dashboard');
                if (!response.ok) {
                    throw new Error('Failed to load dashboard data');
                }
                const data = await response.json();
                updateDashboard(data);
                
                // Connect WebSocket for live updates
                connectWebSocket();
            } catch (error) {
                console.error('Error loading dashboard:', error);
                showError('Failed to load dashboard data: ' + error.message);
            }
        }
        
        // Start dashboard
        loadInitialData();
        
        // Fallback polling if WebSocket fails
        setInterval(async () => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                try {
                    const response = await fetch('/api/dashboard');
                    if (response.ok) {
                        const data = await response.json();
                        updateDashboard(data);
                    }
                } catch (error) {
                    console.error('Fallback polling error:', error);
                }
            }
        }, 30000); // Every 30 seconds
    </script>
</body>
</html>`;
  }
}