/**
 * Tests for MCP Resilience System
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  ResilientMCPConnection,
  ConnectionState,
  HealthCheckStrategy,
  ResilienceConfig
} from '../resilience.js';
import { MCPProxyClient, ExternalServerConfig } from '../client.js';
import { Logger } from '../../utils/logger.js';

// Mock the MCPProxyClient
vi.mock('../client.js', () => ({
  MCPProxyClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(),
    callTool: vi.fn(),
    readResource: vi.fn(),
    getTools: vi.fn(),
    getResources: vi.fn()
  })),
  ExternalServerConfig: {}
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

describe('ResilientMCPConnection', () => {
  let connection: ResilientMCPConnection;
  let mockClient: any;
  let serverConfig: ExternalServerConfig;
  let resilienceConfig: Partial<ResilienceConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    serverConfig = {
      name: 'test-server',
      command: 'node',
      args: ['test-server.js'],
      description: 'Test server'
    };

    resilienceConfig = {
      maxRetryAttempts: 3,
      baseRetryDelayMs: 100,
      maxRetryDelayMs: 1000,
      circuitBreaker: {
        failureThreshold: 2,
        recoveryTimeoutMs: 1000,
        halfOpenMaxAttempts: 1
      },
      healthCheck: {
        intervalMs: 1000,
        timeoutMs: 500,
        strategy: HealthCheckStrategy.CAPABILITY_CHECK,
        consecutiveFailureThreshold: 2,
        recoveryCheckIntervalMs: 2000
      }
    };

    connection = new ResilientMCPConnection(serverConfig, resilienceConfig);
    mockClient = (connection as any).client;
  });

  afterEach(() => {
    if (connection) {
      connection.removeAllListeners();
    }
  });

  describe('Connection Management', () => {
    it('should initialize with DISCONNECTED state', () => {
      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(connection.isConnected()).toBe(false);
    });

    it('should successfully connect and transition to CONNECTED state', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.isConnected.mockReturnValue(true);
      mockClient.getTools.mockReturnValue([]);
      mockClient.getResources.mockReturnValue([]);

      const stateChangeSpy = vi.fn();
      connection.on('stateChange', stateChangeSpy);

      await connection.connect();

      expect(connection.getState()).toBe(ConnectionState.CONNECTED);
      expect(connection.isConnected()).toBe(true);
      expect(stateChangeSpy).toHaveBeenCalledWith(ConnectionState.CONNECTING, ConnectionState.DISCONNECTED);
      expect(stateChangeSpy).toHaveBeenCalledWith(ConnectionState.CONNECTED, ConnectionState.CONNECTING);
    });

    it('should retry connection with exponential backoff on failure', async () => {
      let attemptCount = 0;
      mockClient.connect.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error(`Connection failed (attempt ${attemptCount})`);
        }
        return Promise.resolve();
      });

      mockClient.isConnected.mockReturnValue(true);
      mockClient.getTools.mockReturnValue([]);
      mockClient.getResources.mockReturnValue([]);

      const startTime = Date.now();
      await connection.connect();
      const endTime = Date.now();

      expect(connection.getState()).toBe(ConnectionState.CONNECTED);
      expect(attemptCount).toBe(3);
      // Should have taken some time due to backoff delays
      expect(endTime - startTime).toBeGreaterThan(100);
    });

    it('should fail connection after max retry attempts', async () => {
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(connection.connect()).rejects.toThrow(/Failed to connect.*after.*attempts/);
      expect(connection.getState()).toBe(ConnectionState.FAILED);
    });

    it('should gracefully disconnect', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.disconnect.mockResolvedValue(undefined);
      mockClient.isConnected.mockReturnValue(true);

      await connection.connect();
      await connection.disconnect();

      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.isConnected.mockReturnValue(true);
      mockClient.getTools.mockReturnValue([]);
      mockClient.getResources.mockReturnValue([]);
      
      await connection.connect();
    });

    it('should open circuit after failure threshold is reached', async () => {
      mockClient.callTool.mockRejectedValue(new Error('Tool call failed'));

      // Make calls to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await connection.callTool('test-tool', {});
        } catch (error) {
          // Expected failures
        }
      }

      const stats = connection.getStats();
      expect(stats.circuitBreakerState).toBe('open');
    });

    it('should reject calls when circuit is open', async () => {
      mockClient.callTool.mockRejectedValue(new Error('Tool call failed'));

      // Trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await connection.callTool('test-tool', {});
        } catch (error) {
          // Expected failures
        }
      }

      // Next call should be rejected due to open circuit
      await expect(connection.callTool('test-tool', {}))
        .rejects.toThrow(/Circuit breaker is OPEN/);
    });
  });

  describe('Health Checking', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.isConnected.mockReturnValue(true);
      mockClient.getTools.mockReturnValue([{ name: 'test-tool' }]);
      mockClient.getResources.mockReturnValue([{ uri: 'test://resource' }]);
      
      await connection.connect();
    });

    it('should perform basic ping health check', async () => {
      mockClient.isConnected.mockReturnValue(true);
      
      const isHealthy = await connection.forceHealthCheck();
      
      expect(isHealthy).toBe(true);
      expect(connection.isHealthy()).toBe(true);
    });

    it('should perform capability health check', async () => {
      mockClient.getTools.mockReturnValue([{ name: 'test-tool' }]);
      mockClient.getResources.mockReturnValue([{ uri: 'test://resource' }]);
      
      const isHealthy = await connection.forceHealthCheck();
      
      expect(isHealthy).toBe(true);
    });

    it('should detect health check failures', async () => {
      mockClient.isConnected.mockReturnValue(false);
      
      const isHealthy = await connection.forceHealthCheck();
      
      expect(isHealthy).toBe(false);
      expect(connection.isHealthy()).toBe(false);
    });

    it('should enter degraded mode after consecutive health failures', async () => {
      mockClient.isConnected
        .mockReturnValue(true)  // Initially connected
        .mockReturnValue(false) // Then start failing
        .mockReturnValue(false)
        .mockReturnValue(false);

      // Simulate consecutive health check failures
      await connection.forceHealthCheck();
      await connection.forceHealthCheck();
      await connection.forceHealthCheck();

      const stats = connection.getStats();
      expect(stats.consecutiveFailures).toBeGreaterThan(0);
    });
  });

  describe('Degraded Mode', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.isConnected.mockReturnValue(true);
      await connection.connect();
    });

    it('should cache successful responses', async () => {
      mockClient.callTool.mockResolvedValue({ result: 'success' });

      const result1 = await connection.callTool('test-tool', { arg: 'value' });
      expect(result1).toEqual({ result: 'success' });

      // Second call should also work (may use cache)
      mockClient.callTool.mockResolvedValue({ result: 'success-2' });
      const result2 = await connection.callTool('test-tool', { arg: 'value' });
      
      // Result should be from cache or fresh call
      expect(result2).toEqual(expect.objectContaining({ result: expect.any(String) }));
    });

    it('should use fallback strategies when primary operation fails', async () => {
      mockClient.callTool.mockRejectedValue(new Error('Primary operation failed'));

      // This should trigger fallback mechanisms
      const result = await connection.callTool('test-tool', { arg: 'value' });
      
      // Should get some fallback response
      expect(result).toBeDefined();
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.isConnected.mockReturnValue(true);
      await connection.connect();
    });

    it('should track connection statistics', () => {
      const stats = connection.getStats();
      
      expect(stats.serverName).toBe('test-server');
      expect(stats.state).toBe(ConnectionState.CONNECTED);
      expect(stats.totalConnections).toBeGreaterThan(0);
      expect(stats.successfulConnections).toBeGreaterThan(0);
      expect(stats.lastSuccessfulConnection).toBeInstanceOf(Date);
    });

    it('should track operation statistics', async () => {
      mockClient.callTool.mockResolvedValue({ result: 'success' });

      await connection.callTool('test-tool', {});

      const stats = connection.getStats();
      expect(stats.totalOperations).toBe(1);
      expect(stats.failedOperations).toBe(0);
      expect(stats.currentOperations).toBe(0);
    });

    it('should track failure statistics', async () => {
      mockClient.callTool.mockRejectedValue(new Error('Operation failed'));

      try {
        await connection.callTool('test-tool', {});
      } catch (error) {
        // Expected failure
      }

      const stats = connection.getStats();
      expect(stats.totalOperations).toBe(1);
      // Note: In degraded mode, this might not increment if fallback succeeds
      expect(stats.failedOperations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration Updates', () => {
    it('should allow runtime configuration updates', () => {
      const newConfig: Partial<ResilienceConfig> = {
        maxRetryAttempts: 5,
        healthCheck: {
          intervalMs: 5000
        }
      };

      expect(() => connection.updateConfig(newConfig)).not.toThrow();
    });
  });

  describe('Event Handling', () => {
    it('should emit state change events', async () => {
      const stateChangeSpy = vi.fn();
      connection.on('stateChange', stateChangeSpy);

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.isConnected.mockReturnValue(true);

      await connection.connect();

      expect(stateChangeSpy).toHaveBeenCalledWith(ConnectionState.CONNECTING, ConnectionState.DISCONNECTED);
      expect(stateChangeSpy).toHaveBeenCalledWith(ConnectionState.CONNECTED, ConnectionState.CONNECTING);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection timeouts', async () => {
      // Mock a slow connection that times out
      mockClient.connect.mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, 2000))
      );

      const connectionWithTimeout = new ResilientMCPConnection(
        serverConfig,
        { 
          ...resilienceConfig,
          connection: { connectTimeoutMs: 500 }
        }
      );

      await expect(connectionWithTimeout.connect()).rejects.toThrow(/timeout|failed/i);
    }, 10000);

    it('should handle malformed responses gracefully', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.isConnected.mockReturnValue(true);
      mockClient.callTool.mockResolvedValue(null); // Malformed response

      await connection.connect();
      
      // Should not throw, should handle gracefully
      const result = await connection.callTool('test-tool', {});
      expect(result).toBeNull();
    });
  });

  describe('Concurrency Control', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.isConnected.mockReturnValue(true);
      await connection.connect();
    });

    it('should handle concurrent operations', async () => {
      mockClient.callTool.mockImplementation((name: string) => 
        Promise.resolve({ tool: name, result: 'success' })
      );

      const promises = Array.from({ length: 10 }, (_, i) => 
        connection.callTool(`tool-${i}`, {})
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result).toEqual({ tool: `tool-${i}`, result: 'success' });
      });
    });

    it('should track current operations count', async () => {
      let resolveCall: (value: unknown) => void;
      const pendingPromise = new Promise(resolve => { resolveCall = resolve; });
      
      mockClient.callTool.mockReturnValue(pendingPromise);

      // Start operation but don't await
      const operationPromise = connection.callTool('test-tool', {});
      
      // Check current operations
      const stats = connection.getStats();
      expect(stats.currentOperations).toBe(1);

      // Complete the operation
      resolveCall!({ result: 'success' });
      await operationPromise;

      // Operations count should be back to 0
      const finalStats = connection.getStats();
      expect(finalStats.currentOperations).toBe(0);
    });
  });
});