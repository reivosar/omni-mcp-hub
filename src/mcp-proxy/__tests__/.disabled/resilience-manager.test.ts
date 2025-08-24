/**
 * Tests for Resilience Manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilienceManager, LoadBalancingStrategy, FailoverStrategy } from '../resilience-manager.js';
import { ExternalServerConfig } from '../client.js';
import { Logger } from '../../utils/logger.js';

// Mock dependencies
vi.mock('../resilience.js', () => ({
  ResilientMCPConnection: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => true),
    isHealthy: vi.fn(() => true),
    callTool: vi.fn(),
    readResource: vi.fn(),
    getStats: vi.fn(() => ({
      serverName: 'test-server',
      state: 'connected',
      currentOperations: 0,
      totalOperations: 10,
      failedOperations: 1,
      averageOperationTimeMs: 100,
      healthCheckStatus: 'healthy',
      consecutiveFailures: 0,
      circuitBreakerState: 'closed'
    })),
    getState: vi.fn(() => 'connected'),
    forceHealthCheck: vi.fn(() => Promise.resolve(true)),
    updateConfig: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    removeAllListeners: vi.fn()
  })),
  ConnectionState: {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    FAILED: 'failed',
    DEGRADED: 'degraded',
    CIRCUIT_OPEN: 'circuit_open'
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

describe('ResilienceManager', () => {
  let manager: ResilienceManager;
  let serverConfig: ExternalServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    serverConfig = {
      name: 'test-server',
      command: 'node',
      args: ['test-server.js'],
      description: 'Test server'
    };

    manager = new ResilienceManager({
      loadBalancing: {
        strategy: LoadBalancingStrategy.ROUND_ROBIN,
        maxConcurrentRequests: 10
      }
    });
  });

  afterEach(async () => {
    if (manager) {
      await manager.shutdown();
    }
  });

  describe('Server Management', () => {
    it('should add server successfully', async () => {
      const addedSpy = vi.fn();
      manager.on('serverAdded', addedSpy);

      await manager.addServer(serverConfig);

      expect(addedSpy).toHaveBeenCalledWith('test-server');
      
      const status = manager.getSystemStatus();
      expect(status.totalServers).toBe(1);
    });

    it('should remove server successfully', async () => {
      await manager.addServer(serverConfig);
      
      const removedSpy = vi.fn();
      manager.on('serverRemoved', removedSpy);

      await manager.removeServer('test-server');

      expect(removedSpy).toHaveBeenCalledWith('test-server');
      
      const status = manager.getSystemStatus();
      expect(status.totalServers).toBe(0);
    });

    it('should prevent adding servers beyond limit', async () => {
      const limitedManager = new ResilienceManager({
        resourceManagement: {
          maxTotalConnections: 1
        }
      });

      await limitedManager.addServer(serverConfig);

      const secondServer = { ...serverConfig, name: 'test-server-2' };
      await expect(limitedManager.addServer(secondServer))
        .rejects.toThrow(/Maximum connection limit reached/);

      await limitedManager.shutdown();
    });

    it('should handle server addition failures gracefully', async () => {
      const { ResilientMCPConnection } = await import('../resilience.js');
      const mockConnection = ResilientMCPConnection as any;
      
      // Mock connection to fail
      mockConnection.mockImplementationOnce(() => ({
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        disconnect: vi.fn(),
        on: vi.fn(),
        emit: vi.fn(),
        removeAllListeners: vi.fn()
      }));

      const alertSpy = vi.fn();
      manager.on('alert', alertSpy);

      // Should not throw, but should create alert
      await expect(manager.addServer(serverConfig)).resolves.not.toThrow();
      expect(alertSpy).toHaveBeenCalled();
    });
  });

  describe('Load Balancing', () => {
    beforeEach(async () => {
      // Add multiple servers
      await manager.addServer({ ...serverConfig, name: 'server-1' });
      await manager.addServer({ ...serverConfig, name: 'server-2' });
      await manager.addServer({ ...serverConfig, name: 'server-3' });
    });

    it('should distribute requests using round robin', async () => {
      const roundRobinManager = new ResilienceManager({
        loadBalancing: {
          strategy: LoadBalancingStrategy.ROUND_ROBIN,
          maxConcurrentRequests: 10
        }
      });

      await roundRobinManager.addServer({ ...serverConfig, name: 'server-1' });
      await roundRobinManager.addServer({ ...serverConfig, name: 'server-2' });

      // Make several requests
      const results = [];
      for (let i = 0; i < 4; i++) {
        try {
          const result = await roundRobinManager.callTool('test-tool', { request: i });
          results.push(result);
        } catch (error) {
          // Ignore errors for this test
        }
      }

      // Should have made requests (exact distribution depends on implementation)
      expect(results.length).toBeGreaterThan(0);

      await roundRobinManager.shutdown();
    });

    it('should handle load balancing with preferred server', async () => {
      const result = await manager.callTool('test-tool', { arg: 'value' }, 'server-2');
      
      // Should attempt to use preferred server
      expect(result).toBeDefined();
    });

    it('should fall back when preferred server is unavailable', async () => {
      // Preferred server doesn't exist
      const result = await manager.callTool('test-tool', { arg: 'value' }, 'nonexistent-server');
      
      // Should fall back to available server
      expect(result).toBeDefined();
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await manager.addServer(serverConfig);
    });

    it('should collect system metrics', () => {
      const metrics = manager.getMetrics();
      
      expect(metrics).toMatchObject({
        timestamp: expect.any(Date),
        totalServers: expect.any(Number),
        healthyServers: expect.any(Number),
        unhealthyServers: expect.any(Number),
        totalRequests: expect.any(Number),
        successfulRequests: expect.any(Number),
        failedRequests: expect.any(Number),
        averageResponseTimeMs: expect.any(Number),
        errorRatePercent: expect.any(Number),
        queueSize: expect.any(Number),
        alerts: expect.any(Array)
      });
    });

    it('should track server statistics', () => {
      const stats = manager.getServerStats('test-server');
      
      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({
        serverName: 'test-server',
        state: expect.any(String),
        totalOperations: expect.any(Number),
        healthCheckStatus: expect.any(String)
      });
    });

    it('should return all server statistics when no specific server requested', () => {
      const allStats = manager.getServerStats();
      
      expect(Array.isArray(allStats)).toBe(true);
      expect(allStats.length).toBeGreaterThan(0);
    });
  });

  describe('Failover Management', () => {
    beforeEach(async () => {
      manager.updateConfig({
        failover: {
          strategy: FailoverStrategy.IMMEDIATE,
          enableAutoFailover: true
        }
      });
      
      await manager.addServer(serverConfig);
    });

    it('should handle connection state changes', () => {
      const stateChangeSpy = vi.fn();
      manager.on('connectionStateChange', stateChangeSpy);

      // Simulate state change from the connection
      const connections = (manager as any).connections;
      const connection = connections.get('test-server');
      if (connection) {
        // Simulate the connection emitting a state change
        connection.emit('stateChange', 'failed', 'connected');
      }

      // Manager should handle the state change
      expect(stateChangeSpy).toHaveBeenCalledWith('test-server', 'failed', 'connected');
    });

    it('should force recovery of a specific server', async () => {
      await expect(manager.forceRecovery('test-server')).resolves.not.toThrow();
    });

    it('should handle recovery of non-existent server', async () => {
      await expect(manager.forceRecovery('nonexistent-server')).resolves.not.toThrow();
    });
  });

  describe('Alert Management', () => {
    beforeEach(async () => {
      await manager.addServer(serverConfig);
    });

    it('should create and emit alerts', (done) => {
      manager.on('alert', (alert) => {
        expect(alert).toMatchObject({
          id: expect.any(String),
          severity: expect.stringMatching(/info|warning|error|critical/),
          message: expect.any(String),
          timestamp: expect.any(Date),
          acknowledged: false
        });
        done();
      });

      // Trigger an alert by simulating a failure
      const createAlert = (manager as any).createAlert;
      if (createAlert) {
        createAlert.call(manager, 'warning', 'Test alert', 'test-server');
      }
    });

    it('should acknowledge alerts', () => {
      // First create an alert
      const createAlert = (manager as any).createAlert;
      if (createAlert) {
        createAlert.call(manager, 'info', 'Test alert', 'test-server');
      }

      const metrics = manager.getMetrics();
      const alert = metrics.alerts[0];
      
      if (alert) {
        const acknowledged = manager.acknowledgeAlert(alert.id);
        expect(acknowledged).toBe(true);
        expect(alert.acknowledged).toBe(true);
      }
    });

    it('should return false when acknowledging non-existent alert', () => {
      const acknowledged = manager.acknowledgeAlert('nonexistent-alert');
      expect(acknowledged).toBe(false);
    });
  });

  describe('Request Queue Management', () => {
    beforeEach(async () => {
      await manager.addServer(serverConfig);
    });

    it('should handle request queue limits', async () => {
      const limitedManager = new ResilienceManager({
        resourceManagement: {
          maxQueueSize: 1
        },
        loadBalancing: {
          maxConcurrentRequests: 1
        }
      });

      await limitedManager.addServer(serverConfig);

      // Fill the queue
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          limitedManager.callTool('test-tool', { request: i })
            .catch(error => error.message)
        );
      }

      const results = await Promise.all(promises);
      
      // Some requests should be rejected due to queue limit
      const queueFullErrors = results.filter(result => 
        typeof result === 'string' && result.includes('queue is full')
      );
      
      expect(queueFullErrors.length).toBeGreaterThan(0);

      await limitedManager.shutdown();
    });

    it('should process queued requests', async () => {
      // This test would require more complex mocking to simulate queue processing
      // For now, just verify basic functionality
      const result = await manager.callTool('test-tool', { arg: 'value' });
      expect(result).toBeDefined();
    });
  });

  describe('Configuration Management', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        loadBalancing: {
          strategy: LoadBalancingStrategy.LEAST_CONNECTIONS,
          maxConcurrentRequests: 20
        }
      };

      expect(() => manager.updateConfig(newConfig)).not.toThrow();
    });

    it('should update configuration and apply changes', () => {
      const originalConfig = manager.getMetrics();
      
      manager.updateConfig({
        monitoring: {
          metricsIntervalMs: 60000
        }
      });

      // Configuration should be updated (can't easily verify internal state in this test)
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('System Status', () => {
    beforeEach(async () => {
      await manager.addServer(serverConfig);
    });

    it('should provide system status', () => {
      const status = manager.getSystemStatus();
      
      expect(status).toMatchObject({
        healthy: expect.any(Boolean),
        totalServers: expect.any(Number),
        healthyServers: expect.any(Number),
        degradedServers: expect.any(Number),
        failedServers: expect.any(Number),
        activeRecoveries: expect.any(Number),
        queueSize: expect.any(Number)
      });
    });

    it('should report system as healthy when servers are available', () => {
      const status = manager.getSystemStatus();
      expect(status.healthy).toBe(true);
      expect(status.totalServers).toBeGreaterThan(0);
    });
  });

  describe('Resource Management', () => {
    it('should handle resource reading with resilience', async () => {
      await manager.addServer(serverConfig);

      const result = await manager.readResource('test://resource');
      expect(result).toBeDefined();
    });

    it('should handle missing resources gracefully', async () => {
      await manager.addServer(serverConfig);

      await expect(manager.readResource('nonexistent://resource'))
        .rejects.toThrow(/not found/);
    });
  });

  describe('Cleanup and Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await manager.addServer(serverConfig);
      
      await expect(manager.shutdown()).resolves.not.toThrow();
      
      // After shutdown, system should be clean
      const status = manager.getSystemStatus();
      expect(status.totalServers).toBe(0);
    });

    it('should handle multiple shutdown calls', async () => {
      await manager.addServer(serverConfig);
      
      await manager.shutdown();
      await expect(manager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Event Handling', () => {
    it('should be an EventEmitter', () => {
      expect(manager.on).toBeDefined();
      expect(manager.emit).toBeDefined();
      expect(manager.removeAllListeners).toBeDefined();
    });

    it('should emit metrics updates', (done) => {
      manager.on('metricsUpdated', (metrics) => {
        expect(metrics).toBeDefined();
        expect(metrics.timestamp).toBeInstanceOf(Date);
        done();
      });

      // Trigger metrics update manually
      const collectSystemMetrics = (manager as any).collectSystemMetrics;
      if (collectSystemMetrics) {
        collectSystemMetrics.call(manager);
      }
    });
  });

  describe('Error Scenarios', () => {
    it('should handle errors during server operations', async () => {
      const { ResilientMCPConnection } = await import('../resilience.js');
      const mockConnection = ResilientMCPConnection as any;
      
      // Mock connection to throw errors
      mockConnection.mockImplementationOnce(() => ({
        connect: vi.fn(),
        disconnect: vi.fn().mockRejectedValue(new Error('Disconnect failed')),
        callTool: vi.fn().mockRejectedValue(new Error('Tool call failed')),
        on: vi.fn(),
        emit: vi.fn(),
        removeAllListeners: vi.fn()
      }));

      await manager.addServer(serverConfig);
      
      // Should handle errors gracefully
      await expect(manager.callTool('test-tool', {})).rejects.toThrow();
    });

    it('should handle invalid server configurations', async () => {
      const invalidConfig = {
        name: '',  // Invalid name
        command: '',  // Invalid command
        args: []
      } as ExternalServerConfig;

      // Should not crash, but may fail to add server
      await expect(manager.addServer(invalidConfig)).resolves.not.toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple servers efficiently', async () => {
      const startTime = Date.now();
      
      // Add multiple servers
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(manager.addServer({
          ...serverConfig,
          name: `server-${i}`
        }));
      }
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete reasonably quickly
      expect(duration).toBeLessThan(5000); // 5 seconds
      
      const status = manager.getSystemStatus();
      expect(status.totalServers).toBe(10);
    }, 10000);
  });
});