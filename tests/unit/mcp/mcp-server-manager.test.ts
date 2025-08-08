import { MCPServerManager, MCPServerClient, MCPServerInstance } from '../../../src/mcp/mcp-server-manager';
import { MCPServerConfig } from '../../../src/config/source-config-manager';
import { SandboxedExecutor } from '../../../src/security/sandboxed-executor';
import { CommandValidator } from '../../../src/security/command-validator';
import { AuditLogger } from '../../../src/security/audit-logger';
import { ChildProcess } from 'child_process';

// Mock ALL external dependencies
jest.mock('../../../src/security/sandboxed-executor');
jest.mock('../../../src/security/command-validator');
jest.mock('../../../src/security/audit-logger', () => ({
  AuditLogger: {
    getInstance: jest.fn()
  }
}));
jest.mock('child_process');

// Mock timers to avoid real delays
jest.useFakeTimers();

const MockSandboxedExecutor = SandboxedExecutor as jest.MockedClass<typeof SandboxedExecutor>;
const MockCommandValidator = CommandValidator as jest.MockedClass<typeof CommandValidator>;

describe('MCPServerClient', () => {
  let mockProcess: Partial<ChildProcess>;
  let client: MCPServerClient;

  beforeEach(() => {
    mockProcess = {
      stdout: {
        on: jest.fn()
      } as any,
      stdin: {
        write: jest.fn()
      } as any
    };
    
    client = new MCPServerClient(mockProcess as ChildProcess);
  });

  describe('constructor', () => {
    it('should initialize with process and setup message handling', () => {
      expect(mockProcess.stdout?.on).toHaveBeenCalledWith('data', expect.any(Function));
    });
  });

  describe('initialize', () => {
    it('should send initialize request and notification', async () => {
      const mockRequest = jest.spyOn(client as any, 'request').mockResolvedValue({});
      const mockSendNotification = jest.spyOn(client as any, 'sendNotification').mockImplementation();

      await client.initialize();

      expect(mockRequest).toHaveBeenCalledWith('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        clientInfo: { name: 'omni-mcp-hub', version: '1.0.0' }
      });
      expect(mockSendNotification).toHaveBeenCalledWith('initialized', {});
    });
  });

  describe('request', () => {
    it('should send request and handle response', async () => {
      const mockStdin = mockProcess.stdin as any;
      mockStdin.write = jest.fn();

      // Mock the request method to resolve immediately instead of waiting
      const mockRequest = jest.spyOn(client as any, 'request').mockResolvedValue({ success: true });

      const result = await client.request('ping', {});

      expect(mockRequest).toHaveBeenCalledWith('ping', {});
      expect(result).toEqual({ success: true });
    });

    it('should handle request timeout', async () => {
      jest.useFakeTimers();
      
      const promise = client.request('ping', {});
      
      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(30001);
      
      await expect(promise).rejects.toThrow('Request timeout for method: ping');
      
      jest.useRealTimers();
    });

    it('should reject uninitialized requests', async () => {
      await expect(client.request('tools/list')).rejects.toThrow('MCP server not initialized');
    });
  });

  describe('ping', () => {
    it('should send ping request', async () => {
      const mockRequest = jest.spyOn(client as any, 'request').mockResolvedValue({});
      
      await client.ping();
      
      expect(mockRequest).toHaveBeenCalledWith('ping', {});
    });
  });

  describe('listTools', () => {
    it('should send tools/list request', async () => {
      const mockRequest = jest.spyOn(client as any, 'request').mockResolvedValue({});
      
      // Initialize first
      jest.spyOn(client as any, 'request').mockResolvedValueOnce({});
      jest.spyOn(client as any, 'sendNotification').mockImplementation();
      await client.initialize();
      
      await client.listTools();
      
      expect(mockRequest).toHaveBeenCalledWith('tools/list');
    });
  });

  describe('callTool', () => {
    it('should send tools/call request', async () => {
      const mockRequest = jest.spyOn(client as any, 'request').mockResolvedValue({});
      
      // Initialize first
      jest.spyOn(client as any, 'request').mockResolvedValueOnce({});
      jest.spyOn(client as any, 'sendNotification').mockImplementation();
      await client.initialize();
      
      await client.callTool('test-tool', { arg1: 'value1' });
      
      expect(mockRequest).toHaveBeenCalledWith('tools/call', {
        name: 'test-tool',
        arguments: { arg1: 'value1' }
      });
    });
  });
});

describe('MCPServerClient - Message Handling', () => {
  let mockProcess: Partial<ChildProcess>;
  let client: MCPServerClient;

  beforeEach(() => {
    mockProcess = {
      stdout: {
        on: jest.fn()
      } as any,
      stdin: {
        write: jest.fn()
      } as any
    };
    
    client = new MCPServerClient(mockProcess as ChildProcess);
  });

  describe('message parsing', () => {
    it('should handle multiple JSON messages in stdout data', () => {
      const dataHandler = (mockProcess.stdout?.on as jest.Mock).mock.calls.find(call => call[0] === 'data')?.[1];
      const handleMessageSpy = jest.spyOn(client as any, 'handleMessage');
      
      if (dataHandler) {
        dataHandler(Buffer.from('{"id":1,"result":"test1"}\n{"id":2,"result":"test2"}\n'));
        
        expect(handleMessageSpy).toHaveBeenCalledTimes(2);
        expect(handleMessageSpy).toHaveBeenCalledWith({id: 1, result: "test1"});
        expect(handleMessageSpy).toHaveBeenCalledWith({id: 2, result: "test2"});
      }
    });

    it('should handle malformed JSON messages', () => {
      const dataHandler = (mockProcess.stdout?.on as jest.Mock).mock.calls.find(call => call[0] === 'data')?.[1];
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      if (dataHandler) {
        dataHandler(Buffer.from('invalid json\n'));
        
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to parse MCP message:', 'invalid json');
      }
      
      consoleErrorSpy.mockRestore();
    });

    it('should resolve pending requests on response', () => {
      const client = new MCPServerClient(mockProcess as ChildProcess);
      const mockResolve = jest.fn();
      const mockReject = jest.fn();
      
      // Set up pending request
      (client as any).pendingRequests.set(1, { resolve: mockResolve, reject: mockReject });
      
      // Handle response message
      (client as any).handleMessage({ id: 1, result: 'test' });
      
      expect(mockResolve).toHaveBeenCalledWith('test');
      expect((client as any).pendingRequests.has(1)).toBe(false);
    });

    it('should reject pending requests on error response', () => {
      const client = new MCPServerClient(mockProcess as ChildProcess);
      const mockResolve = jest.fn();
      const mockReject = jest.fn();
      
      // Set up pending request
      (client as any).pendingRequests.set(1, { resolve: mockResolve, reject: mockReject });
      
      // Handle error response
      (client as any).handleMessage({ id: 1, error: { message: 'test error' } });
      
      expect(mockReject).toHaveBeenCalledWith(expect.objectContaining({
        message: 'test error'
      }));
      expect((client as any).pendingRequests.has(1)).toBe(false);
    });

    it('should send notification', () => {
      (client as any).sendNotification('test-method', { param: 'value' });
      
      expect(mockProcess.stdin?.write).toHaveBeenCalledWith(
        '{"jsonrpc":"2.0","method":"test-method","params":{"param":"value"}}\n'
      );
    });
  });
});

describe('MCPServerManager', () => {
  let manager: MCPServerManager;
  let mockSandboxedExecutor: jest.Mocked<SandboxedExecutor>;
  let mockCommandValidator: jest.Mocked<CommandValidator>;
  let mockAuditLogger: jest.Mocked<AuditLogger>;
  let mockConfig: MCPServerConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      name: 'test-server',
      command: 'python',
      args: ['-m', 'test'],
      enabled: true
    };

    mockSandboxedExecutor = {
      executeCommand: jest.fn(),
      monitorProcess: jest.fn()
    } as any;

    mockCommandValidator = {
      validateMCPServerConfig: jest.fn(),
      validateCommand: jest.fn()
    } as any;

    mockAuditLogger = {
      logConfigurationValidation: jest.fn(),
      logCommandFailure: jest.fn()
    } as any;

    MockSandboxedExecutor.mockImplementation(() => mockSandboxedExecutor);
    MockCommandValidator.mockImplementation(() => mockCommandValidator);
    (AuditLogger.getInstance as jest.Mock).mockReturnValue(mockAuditLogger);

    manager = new MCPServerManager();
  });

  describe('constructor', () => {
    it('should initialize with security components', () => {
      expect(MockSandboxedExecutor).toHaveBeenCalled();
      expect(MockCommandValidator).toHaveBeenCalled();
      expect(AuditLogger.getInstance).toHaveBeenCalled();
    });
  });

  describe('startServer', () => {

    it('should reject disabled servers', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      
      await expect(manager.startServer(disabledConfig)).rejects.toThrow('Server test-server is disabled');
    });

    it('should reject servers that fail security validation', async () => {
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({
        allowed: false,
        reason: 'Security violation'
      });

      await expect(manager.startServer(mockConfig)).rejects.toThrow('Security validation failed for test-server: Security violation');
      expect(mockAuditLogger.logConfigurationValidation).toHaveBeenCalledWith(mockConfig, false, 'Security violation');
    });

    it('should start server successfully', async () => {
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() },
        emit: jest.fn()
      } as any;

      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: true,
        process: mockProcess
      });

      // Mock client initialization
      jest.spyOn(MCPServerClient.prototype, 'initialize').mockResolvedValue();

      const instance = await manager.startServer(mockConfig);

      // Simulate the spawn event after the server is started
      const spawnHandler = mockProcess.on.mock.calls.find((call: any) => call[0] === 'spawn')[1];
      spawnHandler();

      expect(instance).toBeDefined();
      expect(instance!.name).toBe('test-server');
      expect(instance!.config).toBe(mockConfig);
      expect(instance!.status).toBe('running');
      expect(mockAuditLogger.logConfigurationValidation).toHaveBeenCalledWith(mockConfig, true);
    });

    it('should handle server startup failure', async () => {
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: false,
        error: 'Command failed'
      });

      await expect(manager.startServer(mockConfig)).rejects.toThrow('Failed to start MCP server test-server: Command failed');
    });

    it('should handle disabled server', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      
      await expect(manager.startServer(disabledConfig)).rejects.toThrow('Server test-server is disabled');
    });

    it('should handle HTTP server type', async () => {
      const httpConfig = { ...mockConfig, type: 'http' as const };
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const instance = await manager.startServer(httpConfig);
      
      expect(instance).toBeDefined();
      expect(instance!.process).toBeNull();
      expect(instance!.status).toBe('running');
      expect(manager.getServer('test-server')).toBe(instance);
    });

    it('should handle NPM package verification success', async () => {
      const npxConfig = {
        ...mockConfig,
        command: 'npx',
        args: ['-y', '@test/package', 'arg1']
      };
      
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const mockExec = jest.fn().mockImplementation((cmd, options, callback) => {
        callback(null, '1.0.0\n'); // Package exists
      });
      require('child_process').exec = mockExec;
      
      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() },
        stderr: { on: jest.fn() },
        emit: jest.fn()
      } as any;

      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: true,
        process: mockProcess
      });

      jest.spyOn(MCPServerClient.prototype, 'initialize').mockResolvedValue();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const instance = await manager.startServer(npxConfig);

      expect(mockExec).toHaveBeenCalledWith(
        'npm view @test/package version',
        { timeout: 10000 },
        expect.any(Function)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Package @test/package exists, version: 1.0.0')
      );
      
      consoleLogSpy.mockRestore();
    });

    it('should handle NPM package verification failure', async () => {
      const npxConfig = {
        ...mockConfig,
        command: 'npx',
        args: ['-y', '@nonexistent/package', 'arg1']
      };
      
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const mockExec = jest.fn().mockImplementation((cmd, options, callback) => {
        callback(new Error('Package not found'), ''); // Package doesn't exist
      });
      require('child_process').exec = mockExec;
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await manager.startServer(npxConfig);

      expect(result).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping MCP server test-server: Package @nonexistent/package does not exist')
      );
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle NPM package verification error gracefully', async () => {
      const npxConfig = {
        ...mockConfig,
        command: 'npx',
        args: ['-y', '@test/package', 'arg1']
      };
      
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const mockExec = jest.fn().mockImplementation(() => {
        throw new Error('Network error');
      });
      require('child_process').exec = mockExec;
      
      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() },
        stderr: { on: jest.fn() },
        emit: jest.fn()
      } as any;

      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: true,
        process: mockProcess
      });

      jest.spyOn(MCPServerClient.prototype, 'initialize').mockResolvedValue();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await manager.startServer(npxConfig);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not verify package @test/package for server test-server, continuing anyway:'),
        expect.any(Error)
      );
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle server process error events', async () => {
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() },
        stderr: { on: jest.fn() },
        emit: jest.fn()
      } as any;

      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: true,
        process: mockProcess
      });

      jest.spyOn(MCPServerClient.prototype, 'initialize').mockResolvedValue();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const instance = await manager.startServer(mockConfig);

      // Simulate error event
      const errorHandler = mockProcess.on.mock.calls.find((call: any) => call[0] === 'error')[1];
      const testError = new Error('Process error');
      errorHandler(testError);

      expect(consoleErrorSpy).toHaveBeenCalledWith('MCP server test-server error:', testError);
      expect(instance!.status).toBe('error');
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle server process exit events', async () => {
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() },
        stderr: { on: jest.fn() },
        emit: jest.fn()
      } as any;

      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: true,
        process: mockProcess
      });

      jest.spyOn(MCPServerClient.prototype, 'initialize').mockResolvedValue();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const instance = await manager.startServer(mockConfig);

      // Simulate exit event
      const exitHandler = mockProcess.on.mock.calls.find((call: any) => call[0] === 'exit')[1];
      exitHandler(0);

      expect(consoleLogSpy).toHaveBeenCalledWith('MCP server test-server exited with code 0');
      expect(instance!.status).toBe('stopped');
      expect(manager.getServer('test-server')).toBeUndefined();
      
      consoleLogSpy.mockRestore();
    });

    it('should handle server stderr output', async () => {
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() },
        stderr: { on: jest.fn() },
        emit: jest.fn()
      } as any;

      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: true,
        process: mockProcess
      });

      jest.spyOn(MCPServerClient.prototype, 'initialize').mockResolvedValue();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await manager.startServer(mockConfig);

      // Simulate stderr data
      const stderrHandler = mockProcess.stderr.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      stderrHandler(Buffer.from('Error message from server\n'));

      expect(consoleErrorSpy).toHaveBeenCalledWith('MCP server test-server stderr:', 'Error message from server\n');
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle client initialization failure gracefully', async () => {
      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() },
        stderr: { on: jest.fn() },
        emit: jest.fn()
      } as any;

      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: true,
        process: mockProcess
      });

      jest.spyOn(MCPServerClient.prototype, 'initialize').mockRejectedValue(new Error('MCP init failed'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const instance = await manager.startServer(mockConfig);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to initialize MCP server test-server:', expect.any(Error));
      expect(instance).toBeDefined(); // Should still return instance
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle install command', async () => {
      const configWithInstall = {
        ...mockConfig,
        install_command: 'pip install test-package'
      };

      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      mockCommandValidator.validateCommand.mockReturnValue({ allowed: true });
      
      // Mock check command failure (package not installed)
      mockSandboxedExecutor.executeCommand
        .mockResolvedValueOnce({ success: false }) // check command fails
        .mockResolvedValueOnce({ success: true }) // install command succeeds
        .mockResolvedValue({ // start command succeeds
          success: true,
          process: { on: jest.fn(), stdout: { on: jest.fn() }, stdin: { write: jest.fn() } } as any
        });

      jest.spyOn(MCPServerClient.prototype, 'initialize').mockResolvedValue();

      const instance = await manager.startServer(configWithInstall);

      expect(instance).toBeDefined();
      expect(instance!.name).toBe('test-server');
      expect(mockSandboxedExecutor.executeCommand).toHaveBeenCalledTimes(3);
    });
  });

  describe('stopServer', () => {
    it('should stop existing server', async () => {
      const mockProcess = {
        kill: jest.fn(),
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() }
      } as any;

      const instance: MCPServerInstance = {
        name: 'test-server',
        config: {} as any,
        process: mockProcess,
        client: {} as any,
        status: 'running'
      };

      (manager as any).servers.set('test-server', instance);

      await manager.stopServer('test-server');

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(manager.getServer('test-server')).toBeUndefined();
    });

    it('should throw error for non-existent server', async () => {
      await expect(manager.stopServer('nonexistent')).rejects.toThrow('Server nonexistent not found');
    });
  });

  describe('initializeServers', () => {
    it('should initialize multiple servers successfully', async () => {
      const configs = [
        { ...mockConfig, name: 'server1' },
        { ...mockConfig, name: 'server2', enabled: false },
        { ...mockConfig, name: 'server3' }
      ];

      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() },
        stderr: { on: jest.fn() }
      } as any;

      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: true,
        process: mockProcess
      });

      jest.spyOn(MCPServerClient.prototype, 'initialize').mockResolvedValue();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await manager.initializeServers(configs);

      expect(consoleLogSpy).toHaveBeenCalledWith('Initializing 3 MCP servers...');
      expect(consoleLogSpy).toHaveBeenCalledWith('Initialized 2 MCP servers');
      
      consoleLogSpy.mockRestore();
    });

    it('should handle server initialization failures', async () => {
      const configs = [
        { ...mockConfig, name: 'good-server' },
        { ...mockConfig, name: 'bad-server' }
      ];

      mockCommandValidator.validateMCPServerConfig
        .mockReturnValueOnce({ allowed: true })
        .mockReturnValueOnce({ allowed: false, reason: 'Security policy violation' });

      const mockProcess = {
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() },
        stderr: { on: jest.fn() }
      } as any;

      mockSandboxedExecutor.executeCommand.mockResolvedValue({
        success: true,
        process: mockProcess
      });

      jest.spyOn(MCPServerClient.prototype, 'initialize').mockResolvedValue();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await manager.initializeServers(configs);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to initialize MCP server bad-server:',
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('should skip servers that return undefined from startServer', async () => {
      const configs = [{ ...mockConfig }];

      mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
      
      // Mock NPX package check to return undefined (skipped server)
      const mockExec = jest.fn().mockImplementation((cmd, options, callback) => {
        callback(new Error('Package not found'), '');
      });
      require('child_process').exec = mockExec;

      const npxConfig = {
        ...mockConfig,
        command: 'npx',
        args: ['-y', '@nonexistent/package']
      };

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await manager.initializeServers([npxConfig]);

      expect(consoleLogSpy).toHaveBeenCalledWith('Skipped MCP server test-server');
      
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('stopServer', () => {
    it('should throw error for non-existent server', async () => {
      await expect(manager.stopServer('nonexistent')).rejects.toThrow('Server nonexistent not found');
    });

    it('should kill server process and remove from servers map', async () => {
      const mockProcess = { 
        kill: jest.fn(),
        on: jest.fn(),
        stdout: { on: jest.fn() },
        stdin: { write: jest.fn() }
      } as any;

      const instance = {
        name: 'test-server',
        process: mockProcess,
        status: 'running' as const
      } as MCPServerInstance;

      (manager as any).servers.set('test-server', instance);

      await manager.stopServer('test-server');

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(manager.getServer('test-server')).toBeUndefined();
    });

    it('should handle HTTP servers (null process)', async () => {
      const instance = {
        name: 'http-server',
        process: null,
        status: 'running' as const
      } as MCPServerInstance;

      (manager as any).servers.set('http-server', instance);

      await manager.stopServer('http-server');

      expect(manager.getServer('http-server')).toBeUndefined();
    });
  });

  describe('stopAllServers', () => {
    it('should stop all running servers', async () => {
      const mockProcess1 = { kill: jest.fn(), on: jest.fn(), stdout: { on: jest.fn() }, stdin: { write: jest.fn() } } as any;
      const mockProcess2 = { kill: jest.fn(), on: jest.fn(), stdout: { on: jest.fn() }, stdin: { write: jest.fn() } } as any;

      (manager as any).servers.set('server1', { process: mockProcess1 } as any);
      (manager as any).servers.set('server2', { process: mockProcess2 } as any);

      await manager.stopAllServers();

      expect(mockProcess1.kill).toHaveBeenCalled();
      expect(mockProcess2.kill).toHaveBeenCalled();
      expect(manager.getAllServers()).toHaveLength(0);
    });
  });

  describe('getServer', () => {
    it('should return server instance', () => {
      const instance = {} as MCPServerInstance;
      (manager as any).servers.set('test-server', instance);

      expect(manager.getServer('test-server')).toBe(instance);
    });

    it('should return undefined for non-existent server', () => {
      expect(manager.getServer('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllServers', () => {
    it('should return all server instances', () => {
      const instance1 = {} as MCPServerInstance;
      const instance2 = {} as MCPServerInstance;
      
      (manager as any).servers.set('server1', instance1);
      (manager as any).servers.set('server2', instance2);

      const servers = manager.getAllServers();
      expect(servers).toHaveLength(2);
      expect(servers).toContain(instance1);
      expect(servers).toContain(instance2);
    });
  });

  describe('getAllTools', () => {
    it('should collect tools from all running servers', async () => {
      const mockClient1 = {
        listTools: jest.fn().mockResolvedValue({
          tools: [
            { name: 'tool1', description: 'Tool 1' },
            { name: 'tool2', description: 'Tool 2' }
          ]
        })
      };

      const mockClient2 = {
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool3', description: 'Tool 3' }]
        })
      };

      (manager as any).servers.set('server1', {
        name: 'server1',
        status: 'running',
        client: mockClient1
      });

      (manager as any).servers.set('server2', {
        name: 'server2',
        status: 'running',
        client: mockClient2
      });

      const tools = await manager.getAllTools();

      expect(tools).toHaveLength(3);
      expect(tools[0]).toMatchObject({
        name: 'server1__tool1',
        _server: 'server1',
        _originalName: 'tool1'
      });
      expect(tools[2]).toMatchObject({
        name: 'server2__tool3',
        _server: 'server2',
        _originalName: 'tool3'
      });
    });

    it('should handle server errors gracefully', async () => {
      const mockClient = {
        listTools: jest.fn().mockRejectedValue(new Error('Server error'))
      };

      (manager as any).servers.set('server1', {
        name: 'server1',
        status: 'running',
        client: mockClient
      });

      const tools = await manager.getAllTools();

      expect(tools).toHaveLength(0);
    });

    it('should skip non-running servers', async () => {
      (manager as any).servers.set('server1', {
        name: 'server1',
        status: 'stopped',
        client: {}
      });

      const tools = await manager.getAllTools();

      expect(tools).toHaveLength(0);
    });
  });

  describe('callTool', () => {
    it('should call tool on correct server', async () => {
      const mockClient = {
        callTool: jest.fn().mockResolvedValue({ result: 'success' })
      };

      (manager as any).servers.set('server1', {
        name: 'server1',
        status: 'running',
        client: mockClient
      });

      const result = await manager.callTool('server1__tool1', { arg: 'value' });

      expect(mockClient.callTool).toHaveBeenCalledWith('tool1', { arg: 'value' });
      expect(result).toEqual({ result: 'success' });
    });

    it('should throw error for invalid tool name format', async () => {
      await expect(manager.callTool('invalid-tool-name', {})).rejects.toThrow('Invalid tool name format: invalid-tool-name');
    });

    it('should throw error for non-existent server', async () => {
      await expect(manager.callTool('nonexistent__tool1', {})).rejects.toThrow('Server nonexistent not found');
    });

    it('should throw error for non-running server', async () => {
      (manager as any).servers.set('server1', {
        name: 'server1',
        status: 'stopped'
      });

      await expect(manager.callTool('server1__tool1', {})).rejects.toThrow('Server server1 is not running');
    });
  });

  describe('ensureInstalledSecurely', () => {
    it('should skip if no install command', async () => {
      const config = { name: 'test', command: 'python' } as MCPServerConfig;
      
      await (manager as any).ensureInstalledSecurely(config);
      
      expect(mockSandboxedExecutor.executeCommand).not.toHaveBeenCalled();
    });

    it('should install package if not found', async () => {
      const config = {
        name: 'test',
        command: 'python',
        install_command: 'pip install test-package'
      } as MCPServerConfig;

      mockCommandValidator.validateCommand.mockReturnValue({ allowed: true });
      mockSandboxedExecutor.executeCommand
        .mockResolvedValueOnce({ success: false }) // check fails
        .mockResolvedValueOnce({ success: true }); // install succeeds

      await (manager as any).ensureInstalledSecurely(config);

      expect(mockSandboxedExecutor.executeCommand).toHaveBeenCalledTimes(2);
    });

    it('should handle install validation failure', async () => {
      const config = {
        name: 'test',
        command: 'python',
        install_command: 'pip install test-package'
      } as MCPServerConfig;

      mockCommandValidator.validateCommand.mockReturnValue({
        allowed: false,
        reason: 'Dangerous command'
      });

      await expect((manager as any).ensureInstalledSecurely(config)).rejects.toThrow('Install command validation failed for test: Dangerous command');
    });
  });

  describe('extractPackageName', () => {
    it('should extract pip package name', () => {
      const result = (manager as any).extractPackageName('pip install test-package', 'pip install');
      expect(result).toBe('test-package');
    });

    it('should extract npm package name', () => {
      const result = (manager as any).extractPackageName('npm install -g test-package', 'npm install');
      expect(result).toBe('-g');
    });

    it('should throw error for invalid format', () => {
      expect(() => {
        (manager as any).extractPackageName('invalid command', 'pip install');
      }).toThrow('Could not extract package name from: invalid command');
    });
  });

  describe('getCheckCommand', () => {
    it('should return pip check command', () => {
      const config = {
        install_command: 'pip install test-package',
        command: 'python'
      } as MCPServerConfig;

      const result = (manager as any).getCheckCommand(config);
      expect(result).toBe('python -c "import test_package"');
    });

    it('should return npm check command', () => {
      const config = {
        install_command: 'npm install test-package',
        command: 'node'
      } as MCPServerConfig;

      const result = (manager as any).getCheckCommand(config);
      expect(result).toBe('npm list test-package');
    });

    it('should return generic check command', () => {
      const config = {
        install_command: 'custom install',
        command: 'custom-command'
      } as MCPServerConfig;

      const result = (manager as any).getCheckCommand(config);
      expect(result).toBe('custom-command --help');
    });
  });
});