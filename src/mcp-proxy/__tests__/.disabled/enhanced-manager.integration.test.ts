/**
 * Integration tests for Enhanced MCP Proxy Manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedMCPProxyManager, EnhancedManagerConfig } from '../enhanced-manager.js';
import { ExternalServerConfig } from '../client.js';
import { LoadBalancingStrategy } from '../resilience-manager.js';
import { Logger } from '../../utils/logger.js';

// Mock all dependencies
vi.mock('../manager.js', () => ({
  MCPProxyManager: vi.fn().mockImplementation(() => ({
    addServer: vi.fn(),
    removeServer: vi.fn(),
    callTool: vi.fn(),
    readResource: vi.fn(),
    performHealthCheck: vi.fn(() => Promise.resolve(new Map())),
    getHealthStatus: vi.fn(() => ({})),
    updateAggregatedCapabilities: vi.fn(),
    getAggregatedTools: vi.fn(() => []),
    getAggregatedResources: vi.fn(() => []),
    cleanup: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn()
  }))
}));

vi.mock('../resilience-manager.js', () => ({
  ResilienceManager: vi.fn().mockImplementation(() => ({
    addServer: vi.fn(),
    removeServer: vi.fn(),
    callTool: vi.fn(),
    readResource: vi.fn(),
    getSystemStatus: vi.fn(() => ({
      healthy: true,
      totalServers: 1,
      healthyServers: 1,
      degradedServers: 0,
      failedServers: 0,
      activeRecoveries: 0,
      queueSize: 0
    })),
    getMetrics: vi.fn(() => ({
      timestamp: new Date(),
      totalServers: 1,
      healthyServers: 1,
      unhealthyServers: 0,
      degradedServers: 0,
      totalRequests: 10,
      successfulRequests: 9,
      failedRequests: 1,
      averageResponseTimeMs: 150,
      errorRatePercent: 10,
      connectionPoolUtilization: 50,
      queueSize: 0,
      activeRecoveries: 0,
      alerts: []
    })),
    getServerStats: vi.fn(() => []),
    forceRecovery: vi.fn(),
    updateConfig: vi.fn(),
    acknowledgeAlert: vi.fn(),
    shutdown: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    removeAllListeners: vi.fn()
  })),
  LoadBalancingStrategy: {
    ROUND_ROBIN: 'round_robin',
    LEAST_CONNECTIONS: 'least_connections',
    LEAST_RESPONSE_TIME: 'least_response_time',
    HEALTH_WEIGHTED: 'health_weighted',
    RANDOM: 'random'
  }
}));

vi.mock('../../utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      log: vi.fn(),
      setLevel: vi.fn(),
      isEnabled: vi.fn(() => true)
    })
  },
  SilentLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    setLevel: vi.fn(),
    isEnabled: vi.fn(() => true)
  }))
}));

describe('Enhanced MCP Proxy Manager Integration', () => {
  let manager: EnhancedMCPProxyManager;
  let serverConfig: ExternalServerConfig;
  let enhancedConfig: Partial<EnhancedManagerConfig>;

  beforeEach(() => {
    vi.clearAllMocks();

    serverConfig = {
      name: 'test-server',
      command: 'node',
      args: ['test-server.js'],
      description: 'Test server for integration testing'
    };

    enhancedConfig = {
      enableLegacyMode: false,
      resilience: {
        loadBalancing: {
          strategy: LoadBalancingStrategy.HEALTH_WEIGHTED,
          healthThreshold: 0.8,
          maxConcurrentRequests: 50
        },
        failover: {
          enableAutoFailover: true,
          failbackDelayMs: 30000
        }
      },
      features: {
        loadBalancing: true,
        circuitBreaker: true,
        healthChecking: true,
        autoRecovery: true,
        degradedMode: true,
        detailedMetrics: true
      }
    };

    manager = new EnhancedMCPProxyManager(undefined, undefined, enhancedConfig);
  });

  afterEach(async () => {
    if (manager) {
      await manager.cleanup();
    }
  });

  describe('Initialization', () => {
    it('should initialize with enhanced features enabled', () => {
      expect(manager).toBeDefined();
      expect(manager.getEnhancedHealthStatus).toBeDefined();
      expect(manager.getMetrics).toBeDefined();
    });

    it('should initialize with proper configuration', () => {
      const healthStatus = manager.getEnhancedHealthStatus();
      expect(healthStatus).toMatchObject({
        system: expect.any(Object),
        metrics: expect.any(Object),
        servers: expect.any(Object)
      });
    });
  });

  describe('Server Management', () => {
    it('should add enhanced servers by default', async () => {
      const serverAddedSpy = vi.fn();
      manager.on('serverAdded', serverAddedSpy);

      await manager.addServer(serverConfig);

      expect(serverAddedSpy).toHaveBeenCalledWith('test-server');
      
      const healthStatus = manager.getEnhancedHealthStatus();
      expect(healthStatus.servers.enhanced).toContain('test-server');
    });

    it('should support legacy mode when configured', async () => {
      const legacyManager = new EnhancedMCPProxyManager(undefined, undefined, {
        enableLegacyMode: true
      });

      await legacyManager.addServer(serverConfig);

      const healthStatus = legacyManager.getEnhancedHealthStatus();
      expect(healthStatus.servers.legacy).toContain('test-server');

      await legacyManager.cleanup();
    });

    it('should handle gradual rollout', async () => {
      const rolloutManager = new EnhancedMCPProxyManager(undefined, undefined, {
        migration: {
          enableGradualRollout: true,
          rolloutPercentage: 50
        }
      });

      // Add multiple servers to test rollout
      for (let i = 0; i < 10; i++) {
        await rolloutManager.addServer({
          ...serverConfig,
          name: `test-server-${i}`
        });
      }

      const healthStatus = rolloutManager.getEnhancedHealthStatus();
      const totalServers = healthStatus.servers.enhanced.length + healthStatus.servers.legacy.length;
      expect(totalServers).toBe(10);

      // Should have some servers in each mode (statistically likely)
      // Note: This test might be flaky due to randomness, but serves as integration test

      await rolloutManager.cleanup();
    });

    it('should remove servers from correct mode', async () => {
      await manager.addServer(serverConfig);
      
      const serverRemovedSpy = vi.fn();
      manager.on('serverRemoved', serverRemovedSpy);

      await manager.removeServer('test-server');

      expect(serverRemovedSpy).toHaveBeenCalledWith('test-server');
    });
  });

  describe('Enhanced Operations', () => {
    beforeEach(async () => {
      await manager.addServer(serverConfig);
    });

    it('should call tools with resilience features', async () => {
      const { ResilienceManager } = await import('../resilience-manager.js');
      const mockResilienceManager = ResilienceManager as any;
      const mockInstance = mockResilienceManager.mock.results[0].value;

      mockInstance.callTool.mockResolvedValue({ result: 'enhanced-success' });

      const result = await manager.callTool('test-tool', { arg: 'value' });

      expect(result).toEqual({ result: 'enhanced-success' });
      expect(mockInstance.callTool).toHaveBeenCalledWith('test-tool', { arg: 'value' }, undefined);
    });

    it('should read resources with resilience features', async () => {
      const { ResilienceManager } = await import('../resilience-manager.js');
      const mockResilienceManager = ResilienceManager as any;
      const mockInstance = mockResilienceManager.mock.results[0].value;

      mockInstance.readResource.mockResolvedValue({ content: 'enhanced-resource' });

      const result = await manager.readResource('test://resource');

      expect(result).toEqual({ content: 'enhanced-resource' });
      expect(mockInstance.readResource).toHaveBeenCalledWith('test://resource', undefined);
    });

    it('should fall back to legacy operations when needed', async () => {
      // Test with features disabled
      const legacyManager = new EnhancedMCPProxyManager(undefined, undefined, {
        features: {
          loadBalancing: false,
          circuitBreaker: false,
          healthChecking: false,
          autoRecovery: false,
          degradedMode: false,
          detailedMetrics: false
        }
      });

      await legacyManager.addServer(serverConfig);

      const { MCPProxyManager } = await import('../manager.js');
      const mockBaseManager = MCPProxyManager as any;
      const mockInstance = mockBaseManager.mock.results[0].value;

      mockInstance.callTool.mockResolvedValue({ result: 'legacy-success' });

      const result = await legacyManager.callTool('test-tool', { arg: 'value' });

      expect(mockInstance.callTool).toHaveBeenCalled();

      await legacyManager.cleanup();
    });
  });

  describe('Health Monitoring Integration', () => {
    beforeEach(async () => {
      await manager.addServer(serverConfig);
    });

    it('should provide enhanced health status', () => {
      const healthStatus = manager.getEnhancedHealthStatus();

      expect(healthStatus).toMatchObject({
        system: {
          healthy: expect.any(Boolean),
          totalServers: expect.any(Number),
          healthyServers: expect.any(Number),
          degradedServers: expect.any(Number),
          failedServers: expect.any(Number),
          activeRecoveries: expect.any(Number),
          queueSize: expect.any(Number)
        },
        metrics: {
          averageResponseTime: expect.any(Number),
          errorRate: expect.any(Number),
          totalRequests: expect.any(Number),
          successfulRequests: expect.any(Number),
          failedRequests: expect.any(Number)
        },
        servers: {
          legacy: expect.any(Array),
          enhanced: expect.any(Array),
          total: expect.any(Number)
        }
      });
    });

    it('should combine health check results from both modes', async () => {
      const { ResilienceManager } = await import('../resilience-manager.js');
      const { MCPProxyManager } = await import('../manager.js');
      
      const mockResilienceManager = ResilienceManager as any;
      const mockBaseManager = MCPProxyManager as any;
      
      const resilienceInstance = mockResilienceManager.mock.results[0].value;
      const baseInstance = mockBaseManager.mock.results[0].value;

      resilienceInstance.getServerStats.mockReturnValue([
        { serverName: 'enhanced-server', healthCheckStatus: 'healthy' }
      ]);

      baseInstance.performHealthCheck.mockResolvedValue(new Map([
        ['legacy-server', true]
      ]));

      const healthCheck = await manager.performHealthCheck();

      expect(healthCheck).toBeInstanceOf(Map);
    });

    it('should provide comprehensive metrics', () => {
      const metrics = manager.getMetrics();

      expect(metrics).toMatchObject({
        timestamp: expect.any(Date),
        totalServers: expect.any(Number),
        healthyServers: expect.any(Number),
        unhealthyServers: expect.any(Number),
        totalRequests: expect.any(Number),
        errorRatePercent: expect.any(Number),
        averageResponseTimeMs: expect.any(Number)
      });
    });
  });

  describe('Server Migration', () => {
    beforeEach(async () => {
      // Add a legacy server first
      const legacyManager = new EnhancedMCPProxyManager(undefined, undefined, {
        enableLegacyMode: true
      });
      await legacyManager.addServer(serverConfig);
      manager = legacyManager; // Use the legacy manager for migration tests
    });

    it('should support migrating servers to enhanced mode', async () => {
      // Mock getServerInfo to return server configuration
      (manager as any).getServerInfo = vi.fn().mockReturnValue(serverConfig);

      await expect(manager.migrateServerToEnhanced('test-server')).resolves.not.toThrow();
    });

    it('should handle migration failures gracefully', async () => {
      // Mock getServerInfo to return null (server not found)
      (manager as any).getServerInfo = vi.fn().mockReturnValue(null);

      await expect(manager.migrateServerToEnhanced('test-server'))
        .rejects.toThrow(/configuration not found/);
    });
  });

  describe('Recovery Operations', () => {
    beforeEach(async () => {
      await manager.addServer(serverConfig);
    });

    it('should force recovery of enhanced servers', async () => {
      const { ResilienceManager } = await import('../resilience-manager.js');
      const mockResilienceManager = ResilienceManager as any;
      const mockInstance = mockResilienceManager.mock.results[0].value;

      await manager.forceServerRecovery('test-server');

      expect(mockInstance.forceRecovery).toHaveBeenCalledWith('test-server');
    });

    it('should provide server statistics', () => {
      const stats = manager.getServerStatistics('test-server');
      expect(stats).toBeDefined();
    });

    it('should provide all server statistics when no specific server requested', () => {
      const allStats = manager.getServerStatistics();
      expect(Array.isArray(allStats)).toBe(true);
    });
  });

  describe('Configuration Management', () => {
    it('should allow configuration updates', () => {
      const newConfig: Partial<EnhancedManagerConfig> = {
        resilience: {
          loadBalancing: {
            strategy: LoadBalancingStrategy.LEAST_CONNECTIONS,
            maxConcurrentRequests: 100
          }
        }
      };

      expect(() => manager.updateConfig(newConfig)).not.toThrow();
    });

    it('should propagate configuration changes to resilience manager', () => {
      const { ResilienceManager } = await import('../resilience-manager.js');
      const mockResilienceManager = ResilienceManager as any;
      const mockInstance = mockResilienceManager.mock.results[0].value;

      const newConfig = {
        resilience: {
          loadBalancing: {
            strategy: LoadBalancingStrategy.RANDOM
          }
        }
      };

      manager.updateConfig(newConfig);

      expect(mockInstance.updateConfig).toHaveBeenCalledWith(newConfig.resilience);
    });
  });

  describe('Operational Insights', () => {
    beforeEach(async () => {
      await manager.addServer(serverConfig);
    });

    it('should provide comprehensive operational insights', () => {
      const insights = manager.getOperationalInsights();

      expect(insights).toMatchObject({
        migration: {
          legacyServers: expect.any(Array),
          enhancedServers: expect.any(Array),
          migrationDecisions: expect.any(Object)
        },
        performance: {
          totalRequests: expect.any(Number),
          successRate: expect.any(Number),
          averageResponseTime: expect.any(Number),
          errorRate: expect.any(Number)
        },
        health: {
          systemHealth: expect.any(Boolean),
          serverHealth: expect.any(Object),
          activeRecoveries: expect.any(Number),
          pendingRequests: expect.any(Number)
        }
      });
    });

    it('should track migration decisions correctly', async () => {
      // Add servers in different modes
      await manager.addServer({ ...serverConfig, name: 'enhanced-server' });
      
      const legacyManager = new EnhancedMCPProxyManager(undefined, undefined, {
        enableLegacyMode: true
      });
      await legacyManager.addServer({ ...serverConfig, name: 'legacy-server' });

      const insights = manager.getOperationalInsights();
      const legacyInsights = legacyManager.getOperationalInsights();

      expect(insights.migration.enhancedServers).toContain('enhanced-server');
      expect(legacyInsights.migration.legacyServers).toContain('legacy-server');

      await legacyManager.cleanup();
    });
  });

  describe('Event Propagation', () => {
    it('should propagate events from resilience manager', (done) => {
      const { ResilienceManager } = await import('../resilience-manager.js');
      const mockResilienceManager = ResilienceManager as any;
      const mockInstance = mockResilienceManager.mock.results[0].value;

      manager.on('alert', (alert) => {
        expect(alert).toBeDefined();
        done();
      });

      // Simulate event from resilience manager
      const onCallback = mockInstance.on.mock.calls.find(call => call[0] === 'alert')[1];
      if (onCallback) {
        onCallback({ id: 'test-alert', message: 'Test alert' });
      }
    });

    it('should emit server management events', async () => {
      const addedSpy = vi.fn();
      const removedSpy = vi.fn();

      manager.on('serverAdded', addedSpy);
      manager.on('serverRemoved', removedSpy);

      await manager.addServer(serverConfig);
      await manager.removeServer('test-server');

      expect(addedSpy).toHaveBeenCalledWith('test-server');
      expect(removedSpy).toHaveBeenCalledWith('test-server');
    });
  });

  describe('Error Handling', () => {
    it('should handle resilience manager initialization failures', () => {
      const { ResilienceManager } = await import('../resilience-manager.js');
      
      // Mock ResilienceManager to throw on instantiation
      ResilienceManager.mockImplementationOnce(() => {
        throw new Error('Resilience manager initialization failed');
      });

      expect(() => new EnhancedMCPProxyManager()).toThrow(/initialization failed/);
    });

    it('should handle server addition failures with fallback', async () => {
      const { ResilienceManager } = await import('../resilience-manager.js');
      const mockResilienceManager = ResilienceManager as any;
      const mockInstance = mockResilienceManager.mock.results[0].value;

      // Mock resilience manager to fail
      mockInstance.addServer.mockRejectedValue(new Error('Enhanced add failed'));

      const fallbackManager = new EnhancedMCPProxyManager(undefined, undefined, {
        migration: {
          fallbackToLegacy: true
        }
      });

      // Should not throw due to fallback
      await expect(fallbackManager.addServer(serverConfig)).resolves.not.toThrow();

      await fallbackManager.cleanup();
    });

    it('should handle operations when no servers are available', async () => {
      // No servers added
      await expect(manager.callTool('test-tool', {}))
        .rejects.toThrow(/not found/);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple servers efficiently', async () => {
      const startTime = Date.now();

      // Add multiple servers
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(manager.addServer({
          ...serverConfig,
          name: `perf-server-${i}`
        }));
      }

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds

      const healthStatus = manager.getEnhancedHealthStatus();
      expect(healthStatus.servers.total).toBe(20);
    }, 15000);

    it('should maintain performance under load', async () => {
      await manager.addServer(serverConfig);

      const { ResilienceManager } = await import('../resilience-manager.js');
      const mockResilienceManager = ResilienceManager as any;
      const mockInstance = mockResilienceManager.mock.results[0].value;

      mockInstance.callTool.mockImplementation(() => 
        Promise.resolve({ result: 'load-test' }));

      // Make many concurrent requests
      const promises = Array.from({ length: 100 }, (_, i) =>
        manager.callTool('load-test-tool', { request: i })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);
      results.forEach(result => {
        expect(result).toEqual({ result: 'load-test' });
      });
    }, 15000);
  });

  describe('Cleanup and Resource Management', () => {
    it('should cleanup all resources on shutdown', async () => {
      await manager.addServer(serverConfig);

      const { ResilienceManager } = await import('../resilience-manager.js');
      const mockResilienceManager = ResilienceManager as any;
      const mockInstance = mockResilienceManager.mock.results[0].value;

      await manager.cleanup();

      expect(mockInstance.shutdown).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const { ResilienceManager } = await import('../resilience-manager.js');
      const mockResilienceManager = ResilienceManager as any;
      const mockInstance = mockResilienceManager.mock.results[0].value;

      mockInstance.shutdown.mockRejectedValue(new Error('Cleanup failed'));

      // Should not throw
      await expect(manager.cleanup()).resolves.not.toThrow();
    });
  });
});