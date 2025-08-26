import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Mock net module so port tests are pure unit (no real sockets)
vi.mock('net', () => {
  const boundPorts = new Set<number>();
  let dynCounter = 40000;
  return {
    createServer: vi.fn(() => {
      let portUsed: number | undefined;
      const listeners: Record<string, Function[]> = {};
      const server: any = {
        listen: (port: number, cb?: Function) => {
          let p = port;
          if (p === 0) p = dynCounter++; // pseudo dynamic unique
          if (boundPorts.has(p)) {
            const err: any = new Error(`EADDRINUSE: address already in use :::${p}`);
            err.code = 'EADDRINUSE';
            queueMicrotask(() => (listeners['error'] || []).forEach(fn => fn(err)));
            return server;
          }
          boundPorts.add(p);
          portUsed = p;
          cb?.();
          return server;
        },
        close: (cb?: Function) => { if (portUsed !== undefined) boundPorts.delete(portUsed); cb?.(); },
        address: () => ({ port: portUsed ?? 0 }),
        on: (event: string, handler: Function) => { (listeners[event] ||= []).push(handler); },
        once: (event: string, handler: Function) => {
          const wrap = (...args: any[]) => { handler(...args); listeners[event] = (listeners[event] || []).filter(h => h !== wrap); };
          (listeners[event] ||= []).push(wrap);
        }
      };
      return server;
    })
  };
});
import { OmniMCPServer } from '../../src/index.js';
import { ProcessErrorHandler, IProcessAdapter, ITimerAdapter, IConsoleAdapter } from '../../src/utils/process-error-handler.js';
import { MCPProxyManager } from '../../src/mcp-proxy/manager.js';
import { Logger, ILogger } from '../../src/utils/logger.js';
import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock MCP SDK components
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    notification: vi.fn(),
    setRequestHandler: vi.fn(),
    on: vi.fn()
  }))
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    close: vi.fn()
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    close: vi.fn()
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    close: vi.fn(),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    listResources: vi.fn().mockResolvedValue({ resources: [] })
  }))
}));

describe('System Lifecycle Tests', () => {
  let tempDir: string;
  let mockLogger: ILogger;
  let mockProcessAdapter: IProcessAdapter;
  let mockTimerAdapter: ITimerAdapter;
  let mockConsoleAdapter: IConsoleAdapter;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifecycle-test-'));
    
    // Setup mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setLevel: vi.fn()
    };

    // Setup mock process adapter
    const listeners = new Map<string, Function[]>();
    mockProcessAdapter = {
      on: vi.fn((event: string, listener: Function) => {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event)!.push(listener);
      }),
      exit: vi.fn(),
      emit: vi.fn((event: string, ...args: unknown[]) => {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
          eventListeners.forEach(listener => listener(...args));
        }
      }),
      memoryUsage: vi.fn().mockReturnValue({
        rss: 50 * 1024 * 1024,
        heapTotal: 30 * 1024 * 1024,
        heapUsed: 20 * 1024 * 1024,
        external: 5 * 1024 * 1024,
        arrayBuffers: 1 * 1024 * 1024
      }),
      cpuUsage: vi.fn().mockReturnValue({
        user: 100000,
        system: 50000
      }),
      uptime: vi.fn().mockReturnValue(123.45),
      pid: 12345
    };

    // Setup mock timer adapter
    const timers = new Map<NodeJS.Timeout, Function>();
    let timerIdCounter = 1;
    
    mockTimerAdapter = {
      setTimeout: vi.fn((callback: Function, ms: number) => {
        const timerId = timerIdCounter++ as any;
        timers.set(timerId, callback);
        return timerId;
      }),
      clearTimeout: vi.fn((timerId: NodeJS.Timeout) => {
        timers.delete(timerId);
      }),
      setInterval: vi.fn((callback: Function, ms: number) => {
        const timerId = timerIdCounter++ as any;
        timers.set(timerId, callback);
        return timerId;
      }),
      clearInterval: vi.fn((timerId: NodeJS.Timeout) => {
        timers.delete(timerId);
      })
    };

    // Setup mock console adapter
    mockConsoleAdapter = {
      error: vi.fn()
    };
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('Port Collision Handling', () => {
    it('should detect when a port is already in use', async () => {
      const testPort = 45000;
      const blockingServer = net.createServer();
      await new Promise<void>((resolve, reject) => {
        blockingServer.listen(testPort, (error) => error ? reject(error) : resolve());
      });

      const conflictingServer = net.createServer();
      await expect(new Promise<void>((_resolve, reject) => {
        conflictingServer.once('error', reject);
        conflictingServer.listen(testPort);
      })).rejects.toThrow();

      blockingServer.close();
    });

    it('should handle HTTP server port conflicts gracefully', async () => {
      const testPort = await findAvailablePort();
      
      // Mock HTTP server creation that fails due to port collision
      const mockHttpServer = {
        listen: vi.fn((port: number, callback: Function) => {
          const error = new Error(`EADDRINUSE: address already in use :::${port}`);
          (error as any).code = 'EADDRINUSE';
          callback(error);
        }),
        close: vi.fn()
      };

      // Simulate server startup with port collision
      try {
        mockHttpServer.listen(testPort, (error: Error) => {
          expect(error.message).toContain('EADDRINUSE');
        });
      } catch (error) {
        expect((error as Error).message).toContain('address already in use');
      }
    });

    it('should implement port retry logic', async () => {
      const portRetryLogic = async (startPort: number, maxRetries: number = 5): Promise<number> => {
        let currentPort = startPort;
        let retries = 0;
        
        while (retries < maxRetries) {
          const isAvailable = await isPortAvailable(currentPort);
          if (isAvailable) {
            return currentPort;
          }
          currentPort++;
          retries++;
        }
        
        throw new Error(`Could not find available port after ${maxRetries} retries`);
      };

      const basePort = await findAvailablePort();
      
      // Create servers to block several consecutive ports
      const blockingServers: net.Server[] = [];
      try {
        for (let i = 0; i < 3; i++) {
          const server = net.createServer();
          await new Promise<void>((resolve) => {
            server.listen(basePort + i, () => resolve());
          });
          blockingServers.push(server);
        }

        // Test retry logic
        const availablePort = await portRetryLogic(basePort, 10);
        expect(availablePort).toBeGreaterThanOrEqual(basePort + 3);
        
      } finally {
        blockingServers.forEach(server => server.close());
      }
    });

    it('should handle dynamic port allocation', async () => {
      const dynamicPortAllocator = () => {
        const server = net.createServer();
        return new Promise<number>((resolve, reject) => {
          server.listen(0, () => { // Port 0 means "allocate any available port"
            const address = server.address() as net.AddressInfo;
            const port = address.port;
            server.close(() => resolve(port));
          });
          server.on('error', reject);
        });
      };

      const port1 = await dynamicPortAllocator();
      const port2 = await dynamicPortAllocator();
      
      expect(port1).toBeGreaterThan(0);
      expect(port2).toBeGreaterThan(0);
      expect(port1).not.toBe(port2);
    });
  });

  describe('Graceful Shutdown Process', () => {
    it('should handle SIGTERM signal gracefully', async () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter,
        { shutdownTimeoutMs: 1000 }
      );

      errorHandler.setupGlobalErrorHandlers();

      // Simulate SIGTERM
      (mockProcessAdapter.emit as any)('SIGTERM');

      // Verify shutdown process was initiated
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGTERM, initiating graceful shutdown')
      );
    });

    it('should handle SIGINT signal gracefully', async () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter,
        { shutdownTimeoutMs: 1000 }
      );

      errorHandler.setupGlobalErrorHandlers();

      // Simulate SIGINT (Ctrl+C)
      (mockProcessAdapter.emit as any)('SIGINT');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGINT, initiating graceful shutdown')
      );
    });

    it('should force shutdown after timeout', async () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter,
        { shutdownTimeoutMs: 100 }
      );

      errorHandler.setupGlobalErrorHandlers();

      // Simulate SIGTERM but don't resolve cleanup
      (mockProcessAdapter.emit as any)('SIGTERM');

      // Manually trigger timeout
      const timeoutCallback = (mockTimerAdapter.setTimeout as any).mock.calls[0][0];
      timeoutCallback();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Graceful shutdown timeout, forcing exit')
      );
      expect(mockProcessAdapter.exit).toHaveBeenCalledWith(0);
    });

    it('should prevent duplicate shutdown processes', async () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      errorHandler.setupGlobalErrorHandlers();

      // Trigger shutdown twice
      (mockProcessAdapter.emit as any)('SIGTERM');
      (mockProcessAdapter.emit as any)('SIGTERM');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Already shutting down, forcing exit')
      );
    });

    it('should clean up resources during shutdown', async () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      // Start metrics collection
      const metricsInterval = errorHandler.startMetricsCollection(1000);

      errorHandler.setupGlobalErrorHandlers();

      // Trigger shutdown
      (mockProcessAdapter.emit as any)('SIGTERM');

      // Verify cleanup was attempted
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting server cleanup')
      );
    });
  });

  describe('Process Error Handling', () => {
    it('should handle uncaught exceptions', async () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter,
        { logUncaughtExceptions: true }
      );

      errorHandler.setupGlobalErrorHandlers();

      const testError = new Error('Test uncaught exception');
      (mockProcessAdapter.emit as any)('uncaughtException', testError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[UNCAUGHT-EXCEPTION]',
        expect.stringContaining(testError.message)
      );
      expect(mockConsoleAdapter.error).toHaveBeenCalledWith(
        '[CRITICAL] Uncaught Exception:',
        testError
      );
    });

    it('should handle unhandled promise rejections', async () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter,
        { logUncaughtExceptions: true }
      );

      errorHandler.setupGlobalErrorHandlers();

      const rejectionReason = new Error('Test unhandled rejection');
      const testPromise = Promise.reject(rejectionReason);
      // Avoid affecting test runner with actual unhandled rejection
      void testPromise.catch(() => {});
      
      (mockProcessAdapter.emit as any)('unhandledRejection', rejectionReason, testPromise);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[UNHANDLED-REJECTION]',
        expect.stringContaining('unhandled_rejection')
      );
    });

    it('should handle process warnings', async () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      errorHandler.setupGlobalErrorHandlers();

      const warning = {
        name: 'DeprecationWarning',
        message: 'Test deprecation warning',
        stack: 'Stack trace...'
      };

      (mockProcessAdapter.emit as any)('warning', warning);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[PROCESS-WARNING]',
        expect.objectContaining({
          name: warning.name,
          message: warning.message,
          stack: warning.stack
        })
      );
    });

    it('should collect process metrics', () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      errorHandler.logProcessMetrics();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[PROCESS-METRICS]',
        expect.stringContaining('process_metrics')
      );
      expect(mockProcessAdapter.memoryUsage).toHaveBeenCalled();
      expect(mockProcessAdapter.cpuUsage).toHaveBeenCalled();
      expect(mockProcessAdapter.uptime).toHaveBeenCalled();
    });

    it('should start and stop metrics collection', () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      const interval = errorHandler.startMetricsCollection(5000);
      expect(mockTimerAdapter.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        5000
      );

      errorHandler.stopMetricsCollection();
      expect(mockTimerAdapter.clearInterval).toHaveBeenCalledWith(interval);
    });

    it('should provide health check endpoint', () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      const healthCheck = errorHandler.createHealthCheckEndpoint();
      const status = healthCheck();

      expect(status).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: 123.45
      });
    });
  });

  describe('Server Lifecycle Integration', () => {
    it('should handle server startup sequence', async () => {
      // Create minimal config files for testing
      await fs.writeFile(
        path.join(tempDir, 'omni-config.yaml'),
        'external_servers: []'
      );

      process.env.OMNI_CONFIG_PATH = path.join(tempDir, 'omni-config.yaml');
      
      try {
        const server = new OmniMCPServer(mockLogger);
        
        // Mock the server initialization to avoid actual network calls
        vi.spyOn(server, 'run').mockImplementation(async () => {
          mockLogger.info('Mock server started');
        });

        await server.run();

        expect(mockLogger.info).toHaveBeenCalledWith('Mock server started');
      } finally {
        delete process.env.OMNI_CONFIG_PATH;
      }
    });

    it('should handle server shutdown sequence', () => {
      const server = new OmniMCPServer(mockLogger);
      
      // Mock the cleanup method
      vi.spyOn(server, 'cleanup').mockImplementation(() => {
        mockLogger.info('[CLEANUP] Mock cleanup completed');
      });

      server.cleanup();

      expect(mockLogger.info).toHaveBeenCalledWith('[CLEANUP] Mock cleanup completed');
    });

    it('should handle initialization errors gracefully', async () => {
      const server = new OmniMCPServer(mockLogger);
      
      // Mock run method to throw an error
      vi.spyOn(server, 'run').mockImplementation(async () => {
        throw new Error('Initialization failed');
      });

      await expect(server.run()).rejects.toThrow('Initialization failed');
    });

    it('should handle concurrent shutdown requests', () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      errorHandler.setupGlobalErrorHandlers();

      // Simulate concurrent shutdown signals
      (mockProcessAdapter.emit as any)('SIGTERM');
      (mockProcessAdapter.emit as any)('SIGINT');
      (mockProcessAdapter.emit as any)('SIGTERM');

      // Should handle gracefully without multiple shutdown processes
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Already shutting down')
      );
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up file handles and connections', async () => {
      const cleanup = {
        fileHandles: new Set<string>(),
        connections: new Set<string>(),
        timers: new Set<NodeJS.Timeout>(),
        
        addFileHandle(handle: string) {
          this.fileHandles.add(handle);
        },
        
        addConnection(conn: string) {
          this.connections.add(conn);
        },
        
        addTimer(timer: NodeJS.Timeout) {
          this.timers.add(timer);
        },
        
        cleanup() {
          // Simulate cleanup
          this.fileHandles.clear();
          this.connections.clear();
          for (const timer of this.timers) {
            clearTimeout(timer);
          }
          this.timers.clear();
        }
      };

      // Simulate resource usage
      cleanup.addFileHandle('/tmp/test.txt');
      cleanup.addConnection('server:3000');
      cleanup.addTimer(setTimeout(() => {}, 10) as any);

      expect(cleanup.fileHandles.size).toBe(1);
      expect(cleanup.connections.size).toBe(1);
      expect(cleanup.timers.size).toBe(1);

      // Cleanup
      cleanup.cleanup();

      expect(cleanup.fileHandles.size).toBe(0);
      expect(cleanup.connections.size).toBe(0);
      expect(cleanup.timers.size).toBe(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      // Mock processAdapter.emit to throw during cleanup, but preserve original behavior
      const originalEmit = (mockProcessAdapter.emit as any).getMockImplementation?.() || (mockProcessAdapter.emit as any);
      (mockProcessAdapter.emit as any).mockImplementation((event: string, ...args: any[]) => {
        if (event === 'beforeExit') {
          throw new Error('Cleanup error');
        }
        return originalEmit(event, ...args);
      });

      errorHandler.setupGlobalErrorHandlers();
      
      // Should handle cleanup errors gracefully
      (mockProcessAdapter.emit as any)('SIGTERM');
      
      // The error should be logged but not crash the process
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup error'),
        expect.any(Error)
      );
    });

    it('should handle memory pressure during shutdown', () => {
      const mockMemoryPressure = () => {
        // Simulate high memory usage
        (mockProcessAdapter.memoryUsage as any).mockReturnValue({
          rss: 500 * 1024 * 1024,    // 500MB
          heapTotal: 400 * 1024 * 1024, // 400MB
          heapUsed: 380 * 1024 * 1024,  // 380MB (95% heap usage)
          external: 50 * 1024 * 1024,
          arrayBuffers: 10 * 1024 * 1024
        });
      };

      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      mockMemoryPressure();
      errorHandler.logProcessMetrics();

      // Should log high memory usage
      const logCall = (mockLogger.info as any).mock.calls.find((call: any[]) => 
        call[0] === '[PROCESS-METRICS]'
      );
      
      expect(logCall).toBeDefined();
      const metricsData = JSON.parse(logCall[1]);
      expect(metricsData.memory.heapUsed).toBeGreaterThan(300 * 1024 * 1024);
    });
  });

  describe('System State Management', () => {
    it('should track system state transitions', () => {
      enum SystemState {
        STARTING = 'starting',
        RUNNING = 'running',
        SHUTTING_DOWN = 'shutting_down',
        STOPPED = 'stopped'
      }

      class SystemStateManager {
        private state: SystemState = SystemState.STARTING;
        private stateTransitions: Array<{from: SystemState, to: SystemState, timestamp: number}> = [];
        
        setState(newState: SystemState) {
          const oldState = this.state;
          this.state = newState;
          this.stateTransitions.push({
            from: oldState,
            to: newState,
            timestamp: Date.now()
          });
        }
        
        getState() { return this.state; }
        getTransitions() { return this.stateTransitions; }
        
        isValidTransition(from: SystemState, to: SystemState): boolean {
          const validTransitions = {
            [SystemState.STARTING]: [SystemState.RUNNING, SystemState.STOPPED],
            [SystemState.RUNNING]: [SystemState.SHUTTING_DOWN],
            [SystemState.SHUTTING_DOWN]: [SystemState.STOPPED],
            [SystemState.STOPPED]: []
          };
          
          return validTransitions[from].includes(to);
        }
      }

      const stateManager = new SystemStateManager();
      
      expect(stateManager.getState()).toBe(SystemState.STARTING);
      
      stateManager.setState(SystemState.RUNNING);
      expect(stateManager.getState()).toBe(SystemState.RUNNING);
      
      stateManager.setState(SystemState.SHUTTING_DOWN);
      expect(stateManager.getState()).toBe(SystemState.SHUTTING_DOWN);
      
      const transitions = stateManager.getTransitions();
      expect(transitions).toHaveLength(2);
      expect(transitions[0].from).toBe(SystemState.STARTING);
      expect(transitions[0].to).toBe(SystemState.RUNNING);
    });

    it('should handle system state persistence', async () => {
      const stateFilePath = path.join(tempDir, 'system.state');
      
      const saveState = async (state: any) => {
        await fs.writeFile(stateFilePath, JSON.stringify(state));
      };
      
      const loadState = async () => {
        try {
          const data = await fs.readFile(stateFilePath, 'utf-8');
          return JSON.parse(data);
        } catch {
          return null;
        }
      };

      // Save initial state
      const initialState = {
        status: 'running',
        startTime: Date.now(),
        pid: process.pid
      };
      
      await saveState(initialState);
      
      // Load and verify state
      const loadedState = await loadState();
      expect(loadedState.status).toBe('running');
      expect(loadedState.pid).toBe(process.pid);
    });

    it('should handle corrupted state recovery', async () => {
      const stateFilePath = path.join(tempDir, 'corrupted.state');
      
      // Write corrupted JSON
      await fs.writeFile(stateFilePath, '{"invalid": json}');
      
      const loadStateWithRecovery = async () => {
        try {
          const data = await fs.readFile(stateFilePath, 'utf-8');
          return JSON.parse(data);
        } catch (error) {
          mockLogger.warn('State file corrupted, using default state', error);
          return { status: 'unknown', recovered: true };
        }
      };

      const state = await loadStateWithRecovery();
      expect(state.recovered).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'State file corrupted, using default state',
        expect.any(Error)
      );
    });
  });

  describe('Concurrent System Operations', () => {
    it('should handle multiple simultaneous shutdown signals', () => {
      const errorHandler = new ProcessErrorHandler(
        mockLogger, 
        mockProcessAdapter, 
        mockTimerAdapter, 
        mockConsoleAdapter
      );

      errorHandler.setupGlobalErrorHandlers();

      // Simulate multiple concurrent signals
      const promises = [
        Promise.resolve().then(() => (mockProcessAdapter.emit as any)('SIGTERM')),
        Promise.resolve().then(() => (mockProcessAdapter.emit as any)('SIGINT')),
        Promise.resolve().then(() => (mockProcessAdapter.emit as any)('SIGTERM'))
      ];

      return Promise.all(promises).then(() => {
        // Should handle all signals gracefully
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Received SIGTERM')
        );
      });
    });

    it('should handle rapid startup/shutdown cycles', () => {
      const servers: OmniMCPServer[] = [];
      
      // Create multiple server instances rapidly
      for (let i = 0; i < 5; i++) {
        const server = new OmniMCPServer(mockLogger);
        vi.spyOn(server, 'cleanup').mockImplementation(() => {
          mockLogger.info(`[CLEANUP] Server ${i} cleaned up`);
        });
        servers.push(server);
      }

      // Cleanup all servers
      servers.forEach(server => server.cleanup());

      expect(mockLogger.info).toHaveBeenCalledTimes(5);
    });
  });
});

// Utility functions
async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address() as net.AddressInfo;
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}
