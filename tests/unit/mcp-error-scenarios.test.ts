import { MCPServerManager, MCPServerClient } from '../../src/mcp/mcp-server-manager';
import { MCPHandler } from '../../src/handlers/mcp-handler';
import { SourceConfigManager, MCPServerConfig } from '../../src/config/source-config-manager';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('child_process');
jest.mock('../../src/utils/content-validator');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

class MockChildProcess extends EventEmitter {
  stdin = {
    write: jest.fn().mockReturnValue(true),
    end: jest.fn(),
    destroy: jest.fn()
  };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = jest.fn().mockReturnValue(true);
  pid = 12345;
  killed = false;
  exitCode: number | null = null;

  constructor() {
    super();
  }

  simulateExit(code: number) {
    this.exitCode = code;
    this.killed = true;
    this.emit('exit', code);
  }

  simulateError(error: Error) {
    this.emit('error', error);
  }

  simulateStdout(data: string) {
    this.stdout.emit('data', data);
  }

  simulateStderr(data: string) {
    this.stderr.emit('data', data);
  }
}

describe('MCP Error Scenarios and Edge Cases', () => {
  let manager: MCPServerManager;
  let mockProcess: MockChildProcess;

  beforeEach(() => {
    manager = new MCPServerManager();
    mockProcess = new MockChildProcess();
    mockSpawn.mockReturnValue(mockProcess as any);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Process Management Failures', () => {
    test('should handle process spawn failures', async () => {
      const config: MCPServerConfig = {
        name: 'failing-server',
        command: 'non-existent-command',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      // Simulate spawn failure
      setTimeout(() => {
        mockProcess.simulateError(new Error('spawn ENOENT'));
      }, 100);

      jest.advanceTimersByTime(2000);

      const instance = await startPromise;
      expect(instance.status).toBe('error');

      jest.useRealTimers();
    });

    test('should handle immediate process exit', async () => {
      const config: MCPServerConfig = {
        name: 'quick-exit-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      // Simulate immediate exit
      setTimeout(() => {
        mockProcess.simulateExit(1);
      }, 500);

      jest.advanceTimersByTime(2000);

      const instance = await startPromise;
      expect(instance.status).toBe('stopped');
      expect(manager.getServer('quick-exit-server')).toBeUndefined();

      jest.useRealTimers();
    });

    test('should handle process kill failures', async () => {
      const config: MCPServerConfig = {
        name: 'unkillable-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      const instance = await startPromise;

      // Mock kill to fail
      mockProcess.kill.mockReturnValue(false);

      await manager.stopServer('unkillable-server');

      // Should still remove from tracking even if kill fails
      expect(manager.getServer('unkillable-server')).toBeUndefined();

      jest.useRealTimers();
    });

    test('should handle zombie processes', async () => {
      const config: MCPServerConfig = {
        name: 'zombie-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      // Simulate process becoming unresponsive
      mockProcess.stdin.write.mockReturnValue(false);

      // Should handle unresponsive process
      await expect(manager.callTool('zombie-server__test', {})).rejects.toThrow();

      jest.useRealTimers();
    });
  });

  describe('Communication Failures', () => {
    test('should handle broken stdin pipe', async () => {
      const client = new MCPServerClient(mockProcess as any);

      // Simulate broken pipe
      mockProcess.stdin.write.mockImplementation(() => {
        throw new Error('EPIPE: broken pipe');
      });

      await expect(client.request('test', {})).rejects.toThrow();
    });

    test('should handle stdout stream errors', () => {
      const client = new MCPServerClient(mockProcess as any);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Simulate stdout error
      mockProcess.stdout.emit('error', new Error('Stream error'));

      expect(consoleSpy).not.toHaveBeenCalled(); // Should handle gracefully
      consoleSpy.mockRestore();
    });

    test('should handle malformed JSON responses', () => {
      const client = new MCPServerClient(mockProcess as any);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Send malformed JSON
      mockProcess.simulateStdout('{"invalid": json}\n');
      mockProcess.simulateStdout('incomplete json');
      mockProcess.simulateStdout('{"valid": "json"}\n');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse MCP message:',
        '{"invalid": json}'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse MCP message:',
        'incomplete json'
      );

      consoleSpy.mockRestore();
    });

    test('should handle missing response IDs', () => {
      const client = new MCPServerClient(mockProcess as any);

      // Send response without ID
      mockProcess.simulateStdout(JSON.stringify({
        jsonrpc: '2.0',
        result: { data: 'test' }
      }) + '\n');

      // Should not crash
      expect(true).toBe(true);
    });

    test('should handle duplicate response IDs', async () => {
      const client = new MCPServerClient(mockProcess as any);

      const promise1 = client.request('test1', {});
      const promise2 = client.request('test2', {});

      // Send same response ID twice
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: { data: 'first' }
      };

      mockProcess.simulateStdout(JSON.stringify(response) + '\n');
      mockProcess.simulateStdout(JSON.stringify({
        ...response,
        result: { data: 'second' }
      }) + '\n');

      const result1 = await promise1;
      expect(result1).toEqual({ data: 'first' });

      // Second request should timeout since its response was consumed
      jest.useFakeTimers();
      setTimeout(() => {
        const response2 = {
          jsonrpc: '2.0',
          id: 2,
          result: { data: 'second_correct' }
        };
        mockProcess.simulateStdout(JSON.stringify(response2) + '\n');
      }, 1000);

      jest.advanceTimersByTime(1000);
      const result2 = await promise2;
      expect(result2).toEqual({ data: 'second_correct' });

      jest.useRealTimers();
    });
  });

  describe('Installation Failures', () => {
    test('should handle network failures during installation', async () => {
      const config: MCPServerConfig = {
        name: 'network-fail-server',
        command: 'python',
        install_command: 'pip install non-existent-package-xyz',
        enabled: true
      };

      // Mock exec to simulate network failure
      const child_process = require('child_process');
      const mockExec = jest.spyOn(child_process, 'exec');
      
      mockExec.mockImplementation((...args: unknown[]) => {
        const command = args[0] as string;
        const callback = args[1] as any;
        if (command.includes('pip install')) {
          const error = new Error('Network error');
          (error as any).code = 'ENETUNREACH';
          callback(error);
        } else {
          callback(new Error('Command not found'));
        }
        return {} as any;
      });

      await expect(manager.startServer(config)).rejects.toThrow(
        'Installation failed for network-fail-server'
      );

      mockExec.mockRestore();
    });

    test('should handle permission errors during installation', async () => {
      const config: MCPServerConfig = {
        name: 'permission-fail-server',
        command: 'python',
        install_command: 'pip install test-package',
        enabled: true
      };

      const child_process = require('child_process');
      const mockExec = jest.spyOn(child_process, 'exec');
      
      mockExec.mockImplementation((...args: unknown[]) => {
        const command = args[0] as string;
        const callback = args[1] as any;
        if (command.includes('pip install')) {
          const error = new Error('Permission denied');
          (error as any).code = 'EACCES';
          callback(error);
        } else {
          callback(new Error('Command not found'));
        }
        return {} as any;
      });

      await expect(manager.startServer(config)).rejects.toThrow('Permission denied');

      mockExec.mockRestore();
    });

    test('should handle corrupted package installations', async () => {
      const config: MCPServerConfig = {
        name: 'corrupted-server',
        command: 'python',
        install_command: 'pip install test-package',
        enabled: true
      };

      const child_process = require('child_process');
      const mockExec = jest.spyOn(child_process, 'exec');
      
      // Installation succeeds but package is corrupted
      mockExec.mockImplementation((...args: unknown[]) => {
        const command = args[0] as string;
        const callback = args[1] as any;
        if (command.includes('import test_package')) {
          callback(new Error('ModuleNotFoundError: No module named test_package'));
        } else if (command.includes('pip install')) {
          callback(null, { stdout: 'Successfully installed', stderr: '' });
        } else {
          callback(new Error('Command not found'));
        }
        return {} as any;
      });

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      
      // Should start despite installation check failure
      const instance = await startPromise;
      expect(instance).toBeDefined();

      mockExec.mockRestore();
      jest.useRealTimers();
    });
  });

  describe('Resource Exhaustion', () => {
    test('should handle too many concurrent servers', async () => {
      const configs = Array.from({ length: 100 }, (_, i) => ({
        name: `server-${i}`,
        command: 'python',
        enabled: true
      }));

      const processes = configs.map(() => new MockChildProcess());
      mockSpawn.mockImplementation(() => {
        const process = processes.shift() || new MockChildProcess();
        return process as any;
      });

      jest.useFakeTimers();

      const startPromises = configs.map(config => {
        const promise = manager.startServer(config);
        
        // Simulate successful starts for some servers
        if (parseInt(config.name.split('-')[1]) < 50) {
          setTimeout(() => {
            const process = processes[parseInt(config.name.split('-')[1])];
            if (process) {
              process.emit('spawn');
              process.simulateStdout(JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: {}
              }) + '\n');
            }
          }, 1100);
        }
        
        return promise;
      });

      jest.advanceTimersByTime(3000);

      // Should handle partial failures gracefully
      const results = await Promise.allSettled(startPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful + failed).toBe(100);
      expect(successful).toBeGreaterThan(0);

      jest.useRealTimers();
    });

    test('should handle memory pressure', async () => {
      const config: MCPServerConfig = {
        name: 'memory-hungry-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        // Simulate memory pressure by stderr output
        mockProcess.simulateStderr('MemoryError: Unable to allocate memory');
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);

      const instance = await startPromise;
      expect(instance).toBeDefined();

      jest.useRealTimers();
    });

    test('should handle file descriptor exhaustion', async () => {
      const config: MCPServerConfig = {
        name: 'fd-exhaustion-server',
        command: 'python',
        enabled: true
      };

      // Mock spawn to throw EMFILE error
      mockSpawn.mockImplementationOnce(() => {
        const error = new Error('spawn EMFILE');
        (error as any).code = 'EMFILE';
        throw error;
      });

      await expect(manager.startServer(config)).rejects.toThrow('spawn EMFILE');
    });
  });

  describe('Protocol Violations', () => {
    test('should handle servers that dont respond to initialize', async () => {
      const config: MCPServerConfig = {
        name: 'silent-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        // Don't send any response to initialize
      }, 1100);

      jest.advanceTimersByTime(32000); // Past timeout

      const instance = await startPromise;
      expect(instance).toBeDefined();
      // Should continue despite initialization failure

      jest.useRealTimers();
    });

    test('should handle servers that send malformed initialize response', async () => {
      const config: MCPServerConfig = {
        name: 'malformed-server',
        command: 'python',
        enabled: true
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        // Send malformed response
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { invalid: 'response', missing: 'required fields' }
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);

      const instance = await startPromise;
      expect(instance).toBeDefined();

      consoleSpy.mockRestore();
      jest.useRealTimers();
    });

    test('should handle servers that disconnect unexpectedly', async () => {
      const config: MCPServerConfig = {
        name: 'disconnect-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      const instance = await startPromise;

      // Simulate unexpected disconnect
      mockProcess.simulateExit(null as any); // null exit code indicates abnormal termination

      expect(instance.status).toBe('stopped');
      expect(manager.getServer('disconnect-server')).toBeUndefined();

      jest.useRealTimers();
    });
  });

  describe('Tool Execution Failures', () => {
    test('should handle tool execution timeouts', async () => {
      const config: MCPServerConfig = {
        name: 'slow-tool-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      // Call tool but don't respond
      const toolPromise = manager.callTool('slow-tool-server__slow-tool', {});

      jest.advanceTimersByTime(30001); // Past timeout

      await expect(toolPromise).rejects.toThrow('Request timeout');

      jest.useRealTimers();
    });

    test('should handle tool execution errors', async () => {
      const config: MCPServerConfig = {
        name: 'error-tool-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      const toolPromise = manager.callTool('error-tool-server__error-tool', {});

      setTimeout(() => {
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          error: {
            code: -32000,
            message: 'Tool execution failed',
            data: { details: 'Internal tool error' }
          }
        }) + '\n');
      }, 100);

      jest.advanceTimersByTime(200);

      await expect(toolPromise).rejects.toThrow('Tool execution failed');

      jest.useRealTimers();
    });

    test('should handle invalid tool arguments', async () => {
      const config: MCPServerConfig = {
        name: 'strict-tool-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      const toolPromise = manager.callTool('strict-tool-server__strict-tool', {
        invalid: 'arguments'
      });

      setTimeout(() => {
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          error: {
            code: -32602,
            message: 'Invalid params',
            data: { required: ['valid_arg'], provided: ['invalid'] }
          }
        }) + '\n');
      }, 100);

      jest.advanceTimersByTime(200);

      await expect(toolPromise).rejects.toThrow('Invalid params');

      jest.useRealTimers();
    });
  });

  describe('Concurrent Operation Failures', () => {
    test('should handle concurrent start/stop operations', async () => {
      const config: MCPServerConfig = {
        name: 'concurrent-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();

      // Start server
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      // Try to stop and start simultaneously
      const stopPromise = manager.stopServer('concurrent-server');
      
      // Should handle concurrent operations gracefully
      await expect(stopPromise).resolves.toBeUndefined();
      expect(manager.getServer('concurrent-server')).toBeUndefined();

      jest.useRealTimers();
    });

    test('should handle concurrent tool calls', async () => {
      const config: MCPServerConfig = {
        name: 'multi-tool-server',
        command: 'python',
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);
      await startPromise;

      // Make multiple concurrent tool calls
      const toolPromises = Array.from({ length: 5 }, (_, i) =>
        manager.callTool('multi-tool-server__tool', { index: i })
      );

      // Respond to all tool calls
      setTimeout(() => {
        for (let i = 2; i <= 6; i++) {
          mockProcess.simulateStdout(JSON.stringify({
            jsonrpc: '2.0',
            id: i,
            result: { index: i - 2 }
          }) + '\n');
        }
      }, 100);

      jest.advanceTimersByTime(200);

      const results = await Promise.all(toolPromises);
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.index).toBe(index);
      });

      jest.useRealTimers();
    });
  });

  describe('Configuration Edge Cases', () => {
    test('should handle missing required configuration fields', async () => {
      const invalidConfig = {
        name: 'incomplete-server',
        // Missing command field
        enabled: true
      } as MCPServerConfig;

      await expect(manager.startServer(invalidConfig)).rejects.toThrow();
    });

    test('should handle invalid environment variables', async () => {
      const config: MCPServerConfig = {
        name: 'env-server',
        command: 'python',
        env: {
          INVALID_VAR: null as any,
          UNDEFINED_VAR: undefined as any,
          NUMERIC_VAR: 12345 as any
        },
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        mockProcess.emit('spawn');
        mockProcess.simulateStdout(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {}
        }) + '\n');
      }, 1100);

      jest.advanceTimersByTime(2000);

      // Should handle invalid env vars gracefully
      const instance = await startPromise;
      expect(instance).toBeDefined();

      jest.useRealTimers();
    });

    test('should handle extremely long command arguments', async () => {
      const config: MCPServerConfig = {
        name: 'long-args-server',
        command: 'python',
        args: ['-c', 'x'.repeat(10000)], // Very long argument
        enabled: true
      };

      jest.useFakeTimers();
      const startPromise = manager.startServer(config);

      setTimeout(() => {
        // Might fail due to argument length limits
        const error = new Error('Argument list too long');
        (error as any).code = 'E2BIG';
        mockProcess.simulateError(error);
      }, 100);

      jest.advanceTimersByTime(2000);

      const instance = await startPromise;
      expect(instance.status).toBe('error');

      jest.useRealTimers();
    });
  });
});