"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_server_manager_1 = require("../../../src/mcp/mcp-server-manager");
const sandboxed_executor_1 = require("../../../src/security/sandboxed-executor");
const command_validator_1 = require("../../../src/security/command-validator");
const audit_logger_1 = require("../../../src/security/audit-logger");
jest.mock('../../../src/security/sandboxed-executor');
jest.mock('../../../src/security/command-validator');
jest.mock('../../../src/security/audit-logger', () => ({
    AuditLogger: {
        getInstance: jest.fn()
    }
}));
jest.mock('child_process');
jest.useFakeTimers();
const MockSandboxedExecutor = sandboxed_executor_1.SandboxedExecutor;
const MockCommandValidator = command_validator_1.CommandValidator;
describe('MCPServerClient', () => {
    let mockProcess;
    let client;
    beforeEach(() => {
        mockProcess = {
            stdout: {
                on: jest.fn()
            },
            stdin: {
                write: jest.fn()
            }
        };
        client = new mcp_server_manager_1.MCPServerClient(mockProcess);
    });
    describe('constructor', () => {
        it('should initialize with process and setup message handling', () => {
            expect(mockProcess.stdout?.on).toHaveBeenCalledWith('data', expect.any(Function));
        });
    });
    describe('initialize', () => {
        it('should send initialize request and notification', async () => {
            const mockRequest = jest.spyOn(client, 'request').mockResolvedValue({});
            const mockSendNotification = jest.spyOn(client, 'sendNotification').mockImplementation();
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
            const mockStdin = mockProcess.stdin;
            mockStdin.write = jest.fn();
            const mockRequest = jest.spyOn(client, 'request').mockResolvedValue({ success: true });
            const result = await client.request('ping', {});
            expect(mockRequest).toHaveBeenCalledWith('ping', {});
            expect(result).toEqual({ success: true });
        });
        it('should handle request timeout', async () => {
            jest.useFakeTimers();
            const promise = client.request('ping', {});
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
            const mockRequest = jest.spyOn(client, 'request').mockResolvedValue({});
            await client.ping();
            expect(mockRequest).toHaveBeenCalledWith('ping', {});
        });
    });
    describe('listTools', () => {
        it('should send tools/list request', async () => {
            const mockRequest = jest.spyOn(client, 'request').mockResolvedValue({});
            jest.spyOn(client, 'request').mockResolvedValueOnce({});
            jest.spyOn(client, 'sendNotification').mockImplementation();
            await client.initialize();
            await client.listTools();
            expect(mockRequest).toHaveBeenCalledWith('tools/list');
        });
    });
    describe('callTool', () => {
        it('should send tools/call request', async () => {
            const mockRequest = jest.spyOn(client, 'request').mockResolvedValue({});
            jest.spyOn(client, 'request').mockResolvedValueOnce({});
            jest.spyOn(client, 'sendNotification').mockImplementation();
            await client.initialize();
            await client.callTool('test-tool', { arg1: 'value1' });
            expect(mockRequest).toHaveBeenCalledWith('tools/call', {
                name: 'test-tool',
                arguments: { arg1: 'value1' }
            });
        });
    });
});
describe('MCPServerManager', () => {
    let manager;
    let mockSandboxedExecutor;
    let mockCommandValidator;
    let mockAuditLogger;
    beforeEach(() => {
        jest.clearAllMocks();
        mockSandboxedExecutor = {
            executeCommand: jest.fn(),
            monitorProcess: jest.fn()
        };
        mockCommandValidator = {
            validateMCPServerConfig: jest.fn(),
            validateCommand: jest.fn()
        };
        mockAuditLogger = {
            logConfigurationValidation: jest.fn(),
            logCommandFailure: jest.fn()
        };
        MockSandboxedExecutor.mockImplementation(() => mockSandboxedExecutor);
        MockCommandValidator.mockImplementation(() => mockCommandValidator);
        audit_logger_1.AuditLogger.getInstance.mockReturnValue(mockAuditLogger);
        manager = new mcp_server_manager_1.MCPServerManager();
    });
    describe('constructor', () => {
        it('should initialize with security components', () => {
            expect(MockSandboxedExecutor).toHaveBeenCalled();
            expect(MockCommandValidator).toHaveBeenCalled();
            expect(audit_logger_1.AuditLogger.getInstance).toHaveBeenCalled();
        });
    });
    describe('startServer', () => {
        const mockConfig = {
            name: 'test-server',
            command: 'python',
            args: ['-m', 'test'],
            enabled: true
        };
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
            };
            mockSandboxedExecutor.executeCommand.mockResolvedValue({
                success: true,
                process: mockProcess
            });
            jest.spyOn(mcp_server_manager_1.MCPServerClient.prototype, 'initialize').mockResolvedValue();
            const instance = await manager.startServer(mockConfig);
            const spawnHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'spawn')[1];
            spawnHandler();
            expect(instance.name).toBe('test-server');
            expect(instance.config).toBe(mockConfig);
            expect(instance.status).toBe('running');
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
        it('should handle install command', async () => {
            const configWithInstall = {
                ...mockConfig,
                install_command: 'pip install test-package'
            };
            mockCommandValidator.validateMCPServerConfig.mockReturnValue({ allowed: true });
            mockCommandValidator.validateCommand.mockReturnValue({ allowed: true });
            mockSandboxedExecutor.executeCommand
                .mockResolvedValueOnce({ success: false })
                .mockResolvedValueOnce({ success: true })
                .mockResolvedValue({
                success: true,
                process: { on: jest.fn(), stdout: { on: jest.fn() }, stdin: { write: jest.fn() } }
            });
            jest.spyOn(mcp_server_manager_1.MCPServerClient.prototype, 'initialize').mockResolvedValue();
            const instance = await manager.startServer(configWithInstall);
            expect(instance.name).toBe('test-server');
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
            };
            const instance = {
                name: 'test-server',
                config: {},
                process: mockProcess,
                client: {},
                status: 'running'
            };
            manager.servers.set('test-server', instance);
            await manager.stopServer('test-server');
            expect(mockProcess.kill).toHaveBeenCalled();
            expect(manager.getServer('test-server')).toBeUndefined();
        });
        it('should throw error for non-existent server', async () => {
            await expect(manager.stopServer('nonexistent')).rejects.toThrow('Server nonexistent not found');
        });
    });
    describe('stopAllServers', () => {
        it('should stop all running servers', async () => {
            const mockProcess1 = { kill: jest.fn(), on: jest.fn(), stdout: { on: jest.fn() }, stdin: { write: jest.fn() } };
            const mockProcess2 = { kill: jest.fn(), on: jest.fn(), stdout: { on: jest.fn() }, stdin: { write: jest.fn() } };
            manager.servers.set('server1', { process: mockProcess1 });
            manager.servers.set('server2', { process: mockProcess2 });
            await manager.stopAllServers();
            expect(mockProcess1.kill).toHaveBeenCalled();
            expect(mockProcess2.kill).toHaveBeenCalled();
            expect(manager.getAllServers()).toHaveLength(0);
        });
    });
    describe('getServer', () => {
        it('should return server instance', () => {
            const instance = {};
            manager.servers.set('test-server', instance);
            expect(manager.getServer('test-server')).toBe(instance);
        });
        it('should return undefined for non-existent server', () => {
            expect(manager.getServer('nonexistent')).toBeUndefined();
        });
    });
    describe('getAllServers', () => {
        it('should return all server instances', () => {
            const instance1 = {};
            const instance2 = {};
            manager.servers.set('server1', instance1);
            manager.servers.set('server2', instance2);
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
            manager.servers.set('server1', {
                name: 'server1',
                status: 'running',
                client: mockClient1
            });
            manager.servers.set('server2', {
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
            manager.servers.set('server1', {
                name: 'server1',
                status: 'running',
                client: mockClient
            });
            const tools = await manager.getAllTools();
            expect(tools).toHaveLength(0);
        });
        it('should skip non-running servers', async () => {
            manager.servers.set('server1', {
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
            manager.servers.set('server1', {
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
            manager.servers.set('server1', {
                name: 'server1',
                status: 'stopped'
            });
            await expect(manager.callTool('server1__tool1', {})).rejects.toThrow('Server server1 is not running');
        });
    });
    describe('ensureInstalledSecurely', () => {
        it('should skip if no install command', async () => {
            const config = { name: 'test', command: 'python' };
            await manager.ensureInstalledSecurely(config);
            expect(mockSandboxedExecutor.executeCommand).not.toHaveBeenCalled();
        });
        it('should install package if not found', async () => {
            const config = {
                name: 'test',
                command: 'python',
                install_command: 'pip install test-package'
            };
            mockCommandValidator.validateCommand.mockReturnValue({ allowed: true });
            mockSandboxedExecutor.executeCommand
                .mockResolvedValueOnce({ success: false })
                .mockResolvedValueOnce({ success: true });
            await manager.ensureInstalledSecurely(config);
            expect(mockSandboxedExecutor.executeCommand).toHaveBeenCalledTimes(2);
        });
        it('should handle install validation failure', async () => {
            const config = {
                name: 'test',
                command: 'python',
                install_command: 'pip install test-package'
            };
            mockCommandValidator.validateCommand.mockReturnValue({
                allowed: false,
                reason: 'Dangerous command'
            });
            await expect(manager.ensureInstalledSecurely(config)).rejects.toThrow('Install command validation failed for test: Dangerous command');
        });
    });
    describe('extractPackageName', () => {
        it('should extract pip package name', () => {
            const result = manager.extractPackageName('pip install test-package', 'pip install');
            expect(result).toBe('test-package');
        });
        it('should extract npm package name', () => {
            const result = manager.extractPackageName('npm install -g test-package', 'npm install');
            expect(result).toBe('-g');
        });
        it('should throw error for invalid format', () => {
            expect(() => {
                manager.extractPackageName('invalid command', 'pip install');
            }).toThrow('Could not extract package name from: invalid command');
        });
    });
    describe('getCheckCommand', () => {
        it('should return pip check command', () => {
            const config = {
                install_command: 'pip install test-package',
                command: 'python'
            };
            const result = manager.getCheckCommand(config);
            expect(result).toBe('python -c "import test_package"');
        });
        it('should return npm check command', () => {
            const config = {
                install_command: 'npm install test-package',
                command: 'node'
            };
            const result = manager.getCheckCommand(config);
            expect(result).toBe('npm list test-package');
        });
        it('should return generic check command', () => {
            const config = {
                install_command: 'custom install',
                command: 'custom-command'
            };
            const result = manager.getCheckCommand(config);
            expect(result).toBe('custom-command --help');
        });
    });
});
