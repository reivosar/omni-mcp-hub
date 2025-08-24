/**
 * Enhanced MCP Proxy Manager with Resilience
 * 
 * Integrates advanced resilience features with the existing MCP proxy system:
 * - Backwards compatible with existing MCPProxyManager interface
 * - Adds resilience layer on top of existing functionality
 * - Provides seamless migration path
 * - Maintains existing tool/resource aggregation
 * - Enhanced monitoring and observability
 */

import { MCPProxyManager } from "./manager.js";
import { ResilienceManager, SystemResilienceConfig, SystemMetrics, LoadBalancingStrategy, FailoverStrategy } from "./resilience-manager.js";
import { ExternalServerConfig } from "./client.js";
import { ResilienceConfig, HealthCheckStrategy } from "./resilience.js";
import { YamlConfigManager } from "../config/yaml-config.js";
import { ILogger, SilentLogger } from "../utils/logger.js";
import { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

export interface EnhancedManagerConfig {
  // Legacy compatibility
  enableLegacyMode: boolean;
  
  // Resilience features
  resilience: Partial<SystemResilienceConfig>;
  
  // Server-specific resilience config
  serverDefaults: Partial<ResilienceConfig>;
  
  // Feature toggles
  features: {
    loadBalancing: boolean;
    circuitBreaker: boolean;
    healthChecking: boolean;
    autoRecovery: boolean;
    degradedMode: boolean;
    detailedMetrics: boolean;
  };
  
  // Migration settings
  migration: {
    enableGradualRollout: boolean;
    rolloutPercentage: number; // 0-100
    fallbackToLegacy: boolean;
  };
}

const DEFAULT_ENHANCED_CONFIG: EnhancedManagerConfig = {
  enableLegacyMode: false,
  
  resilience: {
    loadBalancing: {
      strategy: LoadBalancingStrategy.HEALTH_WEIGHTED,
      healthThreshold: 0.8,
      maxConcurrentRequests: 50,
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
      enableDetailedLogging: true
    }
  },
  
  serverDefaults: {
    maxRetryAttempts: 3,
    baseRetryDelayMs: 1000,
    healthCheck: {
      intervalMs: 30000,
      timeoutMs: 5000,
      strategy: HealthCheckStrategy.CAPABILITY_CHECK,
      consecutiveFailureThreshold: 3,
      recoveryCheckIntervalMs: 10000
    },
    degradedMode: {
      enabled: true,
      cacheResponsesMs: 300000,
      fallbackStrategies: ['cached_response', 'default_response']
    }
  },
  
  features: {
    loadBalancing: true,
    circuitBreaker: true,
    healthChecking: true,
    autoRecovery: true,
    degradedMode: true,
    detailedMetrics: true
  },
  
  migration: {
    enableGradualRollout: false,
    rolloutPercentage: 100,
    fallbackToLegacy: false
  }
};

export class EnhancedMCPProxyManager extends MCPProxyManager {
  private resilienceManager: ResilienceManager;
  private config: EnhancedManagerConfig;
  private enhancedLogger: ILogger;
  
  // Legacy compatibility tracking
  private legacyServers = new Set<string>();
  private enhancedServers = new Set<string>();
  private migrationDecision = new Map<string, boolean>(); // true = enhanced, false = legacy
  
  constructor(
    yamlConfigManager?: YamlConfigManager,
    logger?: ILogger,
    config: Partial<EnhancedManagerConfig> = {}
  ) {
    super(yamlConfigManager, logger);
    this.enhancedLogger = logger || new SilentLogger();
    this.config = { ...DEFAULT_ENHANCED_CONFIG, ...config };
    
    // Initialize resilience manager
    this.resilienceManager = new ResilienceManager(
      this.config.resilience,
      this.enhancedLogger
    );
    
    this.setupEventListeners();
    this.enhancedLogger.info('[ENHANCED-MGR] Enhanced MCP Proxy Manager initialized');
  }
  
  private setupEventListeners(): void {
    // Forward resilience events
    this.resilienceManager.on('alert', (alert) => {
      this.emit('alert', alert);
      this.enhancedLogger.warn(`[ENHANCED-MGR] Alert: ${alert.message}`, alert);
    });
    
    this.resilienceManager.on('metricsUpdated', (metrics) => {
      this.emit('metricsUpdated', metrics);
    });
    
    this.resilienceManager.on('serverAdded', (serverName) => {
      this.enhancedServers.add(serverName);
      this.emit('serverAdded', serverName);
    });
    
    this.resilienceManager.on('serverRemoved', (serverName) => {
      this.enhancedServers.delete(serverName);
      this.emit('serverRemoved', serverName);
    });
  }
  
  /**
   * Enhanced server addition with resilience features
   */
  async addServer(config: ExternalServerConfig): Promise<void> {
    const shouldUseEnhanced = this.shouldUseEnhancedMode(config.name);
    
    if (shouldUseEnhanced) {
      return this.addEnhancedServer(config);
    } else {
      return this.addLegacyServer(config);
    }
  }
  
  private async addEnhancedServer(config: ExternalServerConfig): Promise<void> {
    this.enhancedLogger.info(`[ENHANCED-MGR] Adding enhanced server: ${config.name}`);
    
    try {
      await this.resilienceManager.addServer(config, this.config.serverDefaults);
      this.migrationDecision.set(config.name, true);
      this.enhancedLogger.info(`[ENHANCED-MGR] Enhanced server added successfully: ${config.name}`);
      
      // Update aggregated capabilities 
      this.emit('capabilitiesUpdated');
      
    } catch (error) {
      this.enhancedLogger.error(`[ENHANCED-MGR] Failed to add enhanced server ${config.name}:`, error);
      
      // Fallback to legacy if configured
      if (this.config.migration.fallbackToLegacy) {
        this.enhancedLogger.warn(`[ENHANCED-MGR] Falling back to legacy mode for ${config.name}`);
        await this.addLegacyServer(config);
      } else {
        throw error;
      }
    }
  }
  
  private async addLegacyServer(config: ExternalServerConfig): Promise<void> {
    this.enhancedLogger.info(`[ENHANCED-MGR] Adding legacy server: ${config.name}`);
    
    try {
      await super.addServer(config);
      this.legacyServers.add(config.name);
      this.migrationDecision.set(config.name, false);
      this.enhancedLogger.info(`[ENHANCED-MGR] Legacy server added successfully: ${config.name}`);
    } catch (error) {
      this.enhancedLogger.error(`[ENHANCED-MGR] Failed to add legacy server ${config.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Enhanced server removal
   */
  async removeServer(name: string): Promise<void> {
    const isEnhanced = this.migrationDecision.get(name);
    
    if (isEnhanced) {
      this.enhancedLogger.info(`[ENHANCED-MGR] Removing enhanced server: ${name}`);
      await this.resilienceManager.removeServer(name);
      this.enhancedServers.delete(name);
    } else {
      this.enhancedLogger.info(`[ENHANCED-MGR] Removing legacy server: ${name}`);
      await super.removeServer(name);
      this.legacyServers.delete(name);
    }
    
    this.migrationDecision.delete(name);
    this.emit('capabilitiesUpdated');
  }
  
  /**
   * Enhanced tool calling with resilience
   */
  async callTool(toolName: string, args: unknown): Promise<CallToolResult> {
    // Determine which server should handle this tool
    const serverName = this.findToolServer(toolName);
    
    if (!serverName) {
      throw new Error(`Tool ${toolName} not found`);
    }
    
    const isEnhanced = this.migrationDecision.get(serverName);
    
    if (isEnhanced && this.config.features.loadBalancing) {
      this.enhancedLogger.debug(`[ENHANCED-MGR] Calling tool ${toolName} with resilience`);
      return await this.resilienceManager.callTool(toolName, args, serverName) as CallToolResult;
    } else {
      this.enhancedLogger.debug(`[ENHANCED-MGR] Calling tool ${toolName} in legacy mode`);
      return await super.callTool(toolName, args);
    }
  }
  
  /**
   * Enhanced resource reading with resilience
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    // Determine which server should handle this resource
    const serverName = this.findResourceServer(uri);
    
    if (!serverName) {
      throw new Error(`Resource ${uri} not found`);
    }
    
    const isEnhanced = this.migrationDecision.get(serverName);
    
    if (isEnhanced && this.config.features.loadBalancing) {
      this.enhancedLogger.debug(`[ENHANCED-MGR] Reading resource ${uri} with resilience`);
      return await this.resilienceManager.readResource(uri, serverName) as ReadResourceResult;
    } else {
      this.enhancedLogger.debug(`[ENHANCED-MGR] Reading resource ${uri} in legacy mode`);
      return await super.readResource(uri);
    }
  }
  
  /**
   * Enhanced health checking
   */
  async performHealthCheck(): Promise<Map<string, boolean>> {
    const legacyHealth = await super.performHealthCheck();
    const enhancedHealth = new Map<string, boolean>();
    
    // Get enhanced server health from resilience manager
    if (this.config.features.healthChecking) {
      const serverStats = this.resilienceManager.getServerStats();
      for (const stats of serverStats) {
        enhancedHealth.set(stats.serverName, stats.healthCheckStatus === 'healthy');
      }
    }
    
    // Combine results
    const combinedHealth = new Map<string, boolean>();
    for (const [name, healthy] of legacyHealth) {
      combinedHealth.set(name, healthy);
    }
    for (const [name, healthy] of enhancedHealth) {
      combinedHealth.set(name, healthy);
    }
    
    return combinedHealth;
  }
  
  /**
   * Get enhanced health status with detailed information
   */
  getEnhancedHealthStatus(): Record<string, unknown> {
    const baseHealth = super.getHealthStatus();
    const systemStatus = this.resilienceManager.getSystemStatus();
    const metrics = this.resilienceManager.getMetrics();
    
    return {
      ...baseHealth,
      system: {
        healthy: systemStatus.healthy,
        totalServers: systemStatus.totalServers,
        healthyServers: systemStatus.healthyServers,
        degradedServers: systemStatus.degradedServers,
        failedServers: systemStatus.failedServers,
        activeRecoveries: systemStatus.activeRecoveries,
        queueSize: systemStatus.queueSize
      },
      metrics: {
        averageResponseTime: metrics.averageResponseTimeMs,
        errorRate: metrics.errorRatePercent,
        totalRequests: metrics.totalRequests,
        successfulRequests: metrics.successfulRequests,
        failedRequests: metrics.failedRequests
      },
      servers: {
        legacy: Array.from(this.legacyServers),
        enhanced: Array.from(this.enhancedServers),
        total: this.legacyServers.size + this.enhancedServers.size
      }
    };
  }
  
  /**
   * Get comprehensive metrics
   */
  getMetrics(): SystemMetrics {
    return this.resilienceManager.getMetrics();
  }
  
  /**
   * Get server-specific statistics
   */
  getServerStatistics(serverName?: string): unknown {
    if (serverName) {
      const isEnhanced = this.migrationDecision.get(serverName);
      if (isEnhanced) {
        return this.resilienceManager.getServerStats(serverName)[0] || null;
      }
    }
    
    return this.resilienceManager.getServerStats(serverName);
  }
  
  /**
   * Manual server migration
   */
  async migrateServerToEnhanced(serverName: string): Promise<void> {
    if (!this.legacyServers.has(serverName)) {
      throw new Error(`Server ${serverName} is not in legacy mode`);
    }
    
    this.enhancedLogger.info(`[ENHANCED-MGR] Migrating server ${serverName} to enhanced mode`);
    
    // Get server configuration
    const serverInfo = this.getServerInfo(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} configuration not found`);
    }
    
    try {
      // Remove from legacy
      await super.removeServer(serverName);
      this.legacyServers.delete(serverName);
      
      // Add as enhanced
      await this.addEnhancedServer(serverInfo);
      
      this.enhancedLogger.info(`[ENHANCED-MGR] Successfully migrated ${serverName} to enhanced mode`);
    } catch (error) {
      this.enhancedLogger.error(`[ENHANCED-MGR] Failed to migrate ${serverName}:`, error);
      
      // Try to restore legacy mode
      try {
        await this.addLegacyServer(serverInfo);
      } catch (restoreError) {
        this.enhancedLogger.error(`[ENHANCED-MGR] Failed to restore legacy mode for ${serverName}:`, restoreError);
      }
      
      throw error;
    }
  }
  
  /**
   * Manual server migration to legacy
   */
  async migrateServerToLegacy(serverName: string): Promise<void> {
    if (!this.enhancedServers.has(serverName)) {
      throw new Error(`Server ${serverName} is not in enhanced mode`);
    }
    
    this.enhancedLogger.info(`[ENHANCED-MGR] Migrating server ${serverName} to legacy mode`);
    
    // Get server configuration
    const serverInfo = this.getServerInfo(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} configuration not found`);
    }
    
    try {
      // Remove from enhanced
      await this.resilienceManager.removeServer(serverName);
      this.enhancedServers.delete(serverName);
      
      // Add as legacy
      await this.addLegacyServer(serverInfo);
      
      this.enhancedLogger.info(`[ENHANCED-MGR] Successfully migrated ${serverName} to legacy mode`);
    } catch (error) {
      this.enhancedLogger.error(`[ENHANCED-MGR] Failed to migrate ${serverName}:`, error);
      throw error;
    }
  }
  
  /**
   * Force recovery of a specific server
   */
  async forceServerRecovery(serverName: string): Promise<void> {
    const isEnhanced = this.migrationDecision.get(serverName);
    
    if (isEnhanced) {
      await this.resilienceManager.forceRecovery(serverName);
    } else {
      // Legacy recovery - disconnect and reconnect
      await super.removeServer(serverName);
      const serverInfo = this.getServerInfo(serverName);
      if (serverInfo) {
        await this.addLegacyServer(serverInfo);
      }
    }
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EnhancedManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.resilience) {
      this.resilienceManager.updateConfig(newConfig.resilience);
    }
    
    this.enhancedLogger.info('[ENHANCED-MGR] Configuration updated');
  }
  
  // Helper methods
  private shouldUseEnhancedMode(serverName: string): boolean {
    if (this.config.enableLegacyMode) {
      return false;
    }
    
    if (this.config.migration.enableGradualRollout) {
      // Use deterministic hash for consistent rollout
      const hash = this.hashString(serverName);
      const percentage = (hash % 100) + 1;
      return percentage <= this.config.migration.rolloutPercentage;
    }
    
    return true;
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  private findToolServer(toolName: string): string | null {
    // Find which server provides this tool
    const aggregatedTools = this.getAggregatedTools();
    const tool = aggregatedTools.find(t => t.name === toolName);
    
    if (tool && typeof tool === 'object' && 'serverName' in tool) {
      return (tool as unknown as { serverName: string }).serverName;
    }
    
    return null;
  }
  
  private findResourceServer(uri: string): string | null {
    // Find which server provides this resource
    const aggregatedResources = this.getAggregatedResources();
    const resource = aggregatedResources.find(r => r.uri === uri);
    
    if (resource && typeof resource === 'object' && 'serverName' in resource) {
      return (resource as unknown as { serverName: string }).serverName;
    }
    
    return null;
  }
  
  private getServerInfo(_serverName: string): ExternalServerConfig | null {
    // This would need to be implemented based on how server configs are stored
    // For now, return null as placeholder
    return null;
  }
  
  /**
   * Enhanced cleanup with graceful shutdown
   */
  async cleanup(): Promise<void> {
    this.enhancedLogger.info('[ENHANCED-MGR] Starting enhanced cleanup...');
    
    // Shutdown resilience manager
    await this.resilienceManager.shutdown();
    
    // Cleanup legacy connections (if cleanup method exists)
    try {
      const baseManager = this as MCPProxyManager & { cleanup?: () => void };
      if (typeof baseManager.cleanup === 'function') {
        baseManager.cleanup();
      }
    } catch (error) {
      this.enhancedLogger.warn('[ENHANCED-MGR] Legacy cleanup error:', error);
    }
    
    this.enhancedLogger.info('[ENHANCED-MGR] Enhanced cleanup completed');
  }
  
  /**
   * Get operational insights
   */
  getOperationalInsights(): {
    migration: {
      legacyServers: string[];
      enhancedServers: string[];
      migrationDecisions: Record<string, 'legacy' | 'enhanced'>;
    };
    performance: {
      totalRequests: number;
      successRate: number;
      averageResponseTime: number;
      errorRate: number;
    };
    health: {
      systemHealth: boolean;
      serverHealth: Record<string, boolean>;
      activeRecoveries: number;
      pendingRequests: number;
    };
  } {
    const metrics = this.resilienceManager.getMetrics();
    const systemStatus = this.resilienceManager.getSystemStatus();
    const serverStats = this.resilienceManager.getServerStats();
    
    const migrationDecisions: Record<string, 'legacy' | 'enhanced'> = {};
    for (const [serverName, isEnhanced] of this.migrationDecision.entries()) {
      migrationDecisions[serverName] = isEnhanced ? 'enhanced' : 'legacy';
    }
    
    const serverHealth: Record<string, boolean> = {};
    for (const stats of serverStats) {
      serverHealth[stats.serverName] = stats.healthCheckStatus === 'healthy';
    }
    
    return {
      migration: {
        legacyServers: Array.from(this.legacyServers),
        enhancedServers: Array.from(this.enhancedServers),
        migrationDecisions
      },
      performance: {
        totalRequests: metrics.totalRequests,
        successRate: metrics.totalRequests > 0 ? 
          ((metrics.successfulRequests / metrics.totalRequests) * 100) : 0,
        averageResponseTime: metrics.averageResponseTimeMs,
        errorRate: metrics.errorRatePercent
      },
      health: {
        systemHealth: systemStatus.healthy,
        serverHealth,
        activeRecoveries: systemStatus.activeRecoveries,
        pendingRequests: systemStatus.queueSize
      }
    };
  }
}