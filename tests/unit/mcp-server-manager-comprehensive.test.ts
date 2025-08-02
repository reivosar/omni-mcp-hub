import { MCPServerManager, MCPServerClient, MCPServerInstance } from '../../src/mcp/mcp-server-manager';
import { MCPServerConfig } from '../../src/config/source-config-manager';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as child_process from 'child_process';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockExec = child_process.exec as jest.MockedFunction<typeof child_process.exec>;

// Mock process for testing
class MockChildProcess extends EventEmitter {
  stdin = {
    write: jest.fn()
  };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = jest.fn();
  pid = 12345;

  constructor() {
    super();
  }
}

describe('MCP Server Manager - Comprehensive Tests', () => {
  let manager: MCPServerManager;
  let mockProcess: MockChildProcess;

  beforeEach(() => {
    manager = new MCPServerManager();
    mockProcess = new MockChildProcess();
    mockSpawn.mockReturnValue(mockProcess as any);
    
    // Mock exec for install commands
    mockExec.mockImplementation((command: string, callback: any) => {
      if (callback) {
        if (command.includes('--help')) {
          callback(null, { stdout: 'help output', stderr: '' });
        } else if (command.includes('install')) {
          callback(null, { stdout: 'installation complete', stderr: '' });
        } else {
          callback(new Error('Command not found'));
        }
      }
      return {} as any;
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('MCPServerClient', () => {
    let client: MCPServerClient;

    beforeEach(() => {
      client = new MCPServerClient(mockProcess as any);
    });

    test('should create client with process', () => {
      expect(client).toBeInstanceOf(MCPServerClient);
    });

    test('should handle JSON messages from stdout', (done) => {
      const testMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: { test: 'data' }
      };

      // Set up a pending request
      client.request('test', {}).then((result) => {
        expect(result).toEqual({ test: 'data' });
        done();
      });

      // Simulate server response
      mockProcess.stdout.emit('data', JSON.stringify(testMessage) + '\n');
    });

    test('should handle error responses', (done) => {
      const errorMessage = {
        jsonrpc: '2.0',
        id: 1,
        error: { message: 'Test error' }
      };

      client.request('test', {}).catch((error) => {
        expect(error.message).toBe('Test error');
        done();
      });

      mockProcess.stdout.emit('data', JSON.stringify(errorMessage) + '\n');
    });

    test('should handle malformed JSON gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockProcess.stdout.emit('data', 'invalid json\n');
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse MCP message:', 'invalid json');
      consoleSpy.mockRestore();
    });

    test('should timeout requests after 30 seconds', (done) => {
      jest.useFakeTimers();
      
      const promise = client.request('test', {});
      
      promise.catch((error) => {
        expect(error.message).toBe('Request timeout for method: test');
        done();
      });

      jest.advanceTimersByTime(30001);
      jest.useRealTimers();
    });

    test('should initialize with proper protocol version', async () => {
      const initPromise = client.initialize();

      // Simulate server response
      setTimeout(() => {
        const initResponse = {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'test-server', version: '1.0.0' }
          }
        };
        mockProcess.stdout.emit('data', JSON.stringify(initResponse) + '\n');
      }, 10);

      await initPromise;

      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('"method":"initialize"')
      );
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('"method":"initialized"')
      );
    });

    test('should reject requests before initialization except initialize and ping', async () => {
      await expect(client.listTools()).rejects.toThrow(
        'MCP server not initialized. Call initialize() first.'
      );
    });

    test('should allow ping before initialization', async () => {
      const pingPromise = client.ping();

      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: {}
        };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 10);

      await expect(pingPromise).resolves.toBeDefined();
    });

    test('should call tools with correct parameters', async () => {
      // Initialize first
      const initPromise = client.initialize();
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 10);
      await initPromise;

      const toolPromise = client.callTool('test-tool', { param: 'value' });

      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 2,
          result: { output: 'success' }
        };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 10);

      const result = await toolPromise;
      expect(result).toEqual({ output: 'success' });
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('"method":"tools/call"')
      );
    });

    test('should list tools correctly', async () => {
      // Initialize first
      const initPromise = client.initialize();
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 10);
      await initPromise;

      const listPromise = client.listTools();

      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 2,
          result: {
            tools: [{ name: 'tool1' }, { name: 'tool2' }]
          }
        };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 10);

      const result = await listPromise;
      expect(result.tools).toHaveLength(2);
    });
  });

  describe('MCPServerManager', () => {
    test('should start server with valid configuration', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'python',
        args: ['-m', 'test_module'],
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      // Simulate process spawn
      setTimeout(() => {
        mockProcess.emit('spawn');
      }, 100);

      // Simulate initialization response
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: {}
        };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      const instance = await startPromise;

      expect(instance.name).toBe('test-server');
      expect(instance.status).toBe('running');
      expect(mockSpawn).toHaveBeenCalledWith('python', ['-m', 'test_module'], expect.any(Object));

      jest.useRealTimers();
    });

    test('should reject disabled servers', async () => {
      const config: MCPServerConfig = {
        name: 'disabled-server',
        command: 'python',
        enabled: false
      };

      await expect(manager.startServer(config)).rejects.toThrow(
        'Server disabled-server is disabled'
      );
    });

    test('should handle server installation', async () => {
      const config: MCPServerConfig = {
        name: 'installable-server',
        command: 'python',
        install_command: 'pip install test-package',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: {}
        };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('pip install test-package'),
        expect.any(Function)
      );

      jest.useRealTimers();
    });

    test('should handle installation failures', async () => {
      const config: MCPServerConfig = {
        name: 'failing-server',
        command: 'python',
        install_command: 'pip install non-existent-package',
        enabled: true
      };

      // Mock exec to fail for install command
      mockExec.mockImplementation((command: string, callback: any) => {
        if (callback) {
          if (command.includes('pip install non-existent-package')) {
            callback(new Error('Package not found'));
          } else {
            callback(new Error('Command not found'));
          }
        }
        return {} as any;
      });

      await expect(manager.startServer(config)).rejects.toThrow(
        'Installation failed for failing-server'
      );
    });

    test('should stop server correctly', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: {}
        };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      await manager.stopServer('test-server');

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(manager.getServer('test-server')).toBeUndefined();

      jest.useRealTimers();
    });

    test('should handle stopping non-existent server', async () => {
      await expect(manager.stopServer('non-existent')).rejects.toThrow(
        'Server non-existent not found'
      );
    });

    test('should stop all servers', async () => {
      const config1: MCPServerConfig = {
        name: 'server1',
        command: 'python',
        enabled: true
      };
      const config2: MCPServerConfig = {
        name: 'server2',
        command: 'node',
        enabled: true
      };

      jest.useFakeTimers();

      // Start two servers
      const mockProcess2 = new MockChildProcess();
      mockSpawn.mockReturnValueOnce(mockProcess as any)
               .mockReturnValueOnce(mockProcess2 as any);

      const start1 = manager.startServer(config1);
      const start2 = manager.startServer(config2);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess2.emit('spawn');
        
        const response = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
        
        const response2 = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess2.stdout.emit('data', JSON.stringify(response2) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await Promise.all([start1, start2]);

      await manager.stopAllServers();

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(mockProcess2.kill).toHaveBeenCalled();
      expect(manager.getAllServers()).toHaveLength(0);

      jest.useRealTimers();
    });

    test('should get all tools with prefixes', async () => {
      const config: MCPServerConfig = {
        name: 'tool-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        const initResponse = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess.stdout.emit('data', JSON.stringify(initResponse) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      const instance = await startPromise;

      // Mock tools list response
      const toolsPromise = manager.getAllTools();
      setTimeout(() => {
        const toolsResponse = {
          jsonrpc: '2.0',
          id: 2,
          result: {
            tools: [
              { name: 'search', description: 'Search tool' },
              { name: 'process', description: 'Process tool' }
            ]
          }
        };
        mockProcess.stdout.emit('data', JSON.stringify(toolsResponse) + '\n');
      }, 100);

      jest.advanceTimersByTime(200);
      const tools = await toolsPromise;

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('tool-server__search');
      expect(tools[0]._server).toBe('tool-server');
      expect(tools[0]._originalName).toBe('search');
      expect(tools[1].name).toBe('tool-server__process');

      jest.useRealTimers();
    });

    test('should call tool with server prefix', async () => {
      const config: MCPServerConfig = {
        name: 'call-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        const initResponse = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess.stdout.emit('data', JSON.stringify(initResponse) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      const callPromise = manager.callTool('call-server__test-tool', { param: 'value' });
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 2,
          result: { output: 'tool result' }
        };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 100);

      jest.advanceTimersByTime(200);
      const result = await callPromise;

      expect(result).toEqual({ output: 'tool result' });

      jest.useRealTimers();
    });

    test('should handle invalid tool name format', async () => {
      await expect(manager.callTool('invalid-tool-name', {})).rejects.toThrow(
        'Invalid tool name format: invalid-tool-name'
      );
    });

    test('should handle calling tool on non-existent server', async () => {
      await expect(manager.callTool('missing__tool', {})).rejects.toThrow(
        'Server missing not found'
      );
    });

    test('should handle calling tool on stopped server', async () => {
      const config: MCPServerConfig = {
        name: 'stopped-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        const response = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      const instance = await startPromise;

      // Simulate server exit
      instance.status = 'stopped';

      await expect(manager.callTool('stopped-server__tool', {})).rejects.toThrow(
        'Server stopped-server is not running'
      );

      jest.useRealTimers();
    });

    test('should handle server process errors', async () => {
      const config: MCPServerConfig = {
        name: 'error-server',
        command: 'python',
        enabled: true
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('error', new Error('Process error'));
      }, 100);

      setTimeout(() => {
        const response = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      const instance = await startPromise;

      expect(instance.status).toBe('error');
      expect(consoleSpy).toHaveBeenCalledWith(
        'MCP server error-server error:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
      jest.useRealTimers();
    });

    test('should handle server process exit', async () => {
      const config: MCPServerConfig = {
        name: 'exit-server',
        command: 'python',
        enabled: true
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        const response = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      const instance = await startPromise;

      // Simulate process exit
      mockProcess.emit('exit', 0);

      expect(instance.status).toBe('stopped');
      expect(manager.getServer('exit-server')).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        'MCP server exit-server exited with code 0'
      );

      consoleSpy.mockRestore();
      jest.useRealTimers();
    });

    test('should handle different package managers for installation checks', () => {
      const configs = [
        {
          name: 'pip-server',
          command: 'python',
          install_command: 'pip install test-package',
          enabled: true
        },
        {
          name: 'npm-server', 
          command: 'node',
          install_command: 'npm install -g test-package',
          enabled: true
        },
        {
          name: 'uvx-server',
          command: 'uvx',
          install_command: 'uvx install test-package',
          enabled: true
        }
      ];

      configs.forEach(config => {
        jest.useFakeTimers();
        const startPromise = manager.startServer(config);

        setTimeout(() => {
          mockProcess.emit('spawn');
          const response = { jsonrpc: '2.0', id: 1, result: {} };
          mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
        }, 1100);

        jest.advanceTimersByTime(2000);
        
        // Should not throw
        expect(startPromise).resolves.toBeDefined();
        jest.useRealTimers();
      });
    });

    test('should extract package names correctly', async () => {
      const config: MCPServerConfig = {
        name: 'extract-test',
        command: 'python',
        install_command: 'pip install some-complex-package-name',
        enabled: true
      };

      // Mock check command to fail (package not found)
      mockExec.mockImplementation((command: string, callback: any) => {
        if (callback) {
          if (command.includes('import some_complex_package_name')) {
            callback(new Error('Module not found'));
          } else if (command.includes('pip install')) {
            callback(null, { stdout: 'installed', stderr: '' });
          }
        }
        return {} as any;
      });

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        const response = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      expect(mockExec).toHaveBeenCalledWith(
        'python -c "import some_complex_package_name"',
        expect.any(Function)
      );

      jest.useRealTimers();
    });

    test('should handle getAllTools with server errors gracefully', async () => {
      const config: MCPServerConfig = {
        name: 'failing-tools-server',
        command: 'python',
        enabled: true
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        const response = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      // Mock tools list to fail
      const toolsPromise = manager.getAllTools();
      setTimeout(() => {
        const errorResponse = {
          jsonrpc: '2.0',
          id: 2,
          error: { message: 'Tools not available' }
        };
        mockProcess.stdout.emit('data', JSON.stringify(errorResponse) + '\n');
      }, 100);

      jest.advanceTimersByTime(200);
      const tools = await toolsPromise;

      expect(tools).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to get tools from failing-tools-server:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle multiple simultaneous requests', async () => {
      const client = new MCPServerClient(mockProcess as any);
      
      // Initialize client
      const initPromise = client.initialize();
      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 10);
      await initPromise;

      // Send multiple requests
      const promises = [
        client.request('method1', {}),
        client.request('method2', {}),
        client.request('method3', {})
      ];

      // Respond to all requests
      setTimeout(() => {
        for (let i = 2; i <= 4; i++) {
          mockProcess.stdout.emit('data', JSON.stringify({
            jsonrpc: '2.0',
            id: i,
            result: { method: i }
          }) + '\n');
        }
      }, 10);

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ method: 2 });
      expect(results[1]).toEqual({ method: 3 });
      expect(results[2]).toEqual({ method: 4 });
    });

    test('should handle empty or partial JSON messages', () => {
      const client = new MCPServerClient(mockProcess as any);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Emit various malformed data
      mockProcess.stdout.emit('data', '\n\n\n');
      mockProcess.stdout.emit('data', '{"incomplete":');
      mockProcess.stdout.emit('data', '}\n');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should handle server environment variables correctly', async () => {
      const config: MCPServerConfig = {
        name: 'env-server',
        command: 'python',
        env: {
          CUSTOM_VAR: 'test-value',
          ANOTHER_VAR: 'another-value'
        },
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        const response = { jsonrpc: '2.0', id: 1, result: {} };
        mockProcess.stdout.emit('data', JSON.stringify(response) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'python',
        [],
        expect.objectContaining({
          env: expect.objectContaining({
            CUSTOM_VAR: 'test-value',
            ANOTHER_VAR: 'another-value'
          })
        })
      );

      jest.useRealTimers();
    });
  });
});