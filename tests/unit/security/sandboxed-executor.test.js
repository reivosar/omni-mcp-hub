"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sandboxed_executor_1 = require("../../../src/security/sandboxed-executor");
const command_validator_1 = require("../../../src/security/command-validator");
const audit_logger_1 = require("../../../src/security/audit-logger");
const security_policy_1 = require("../../../src/security/security-policy");
jest.mock('../../../src/security/command-validator');
jest.mock('../../../src/security/audit-logger');
jest.mock('../../../src/security/security-policy');
jest.mock('child_process');
describe('SandboxedExecutor', () => {
    let executor;
    let mockValidator;
    let mockAuditLogger;
    let mockPolicyManager;
    beforeEach(() => {
        security_policy_1.SecurityPolicyManager.instance = null;
        audit_logger_1.AuditLogger.instance = null;
        mockValidator = {
            validateCommand: jest.fn(),
            validateMCPServerConfig: jest.fn()
        };
        mockAuditLogger = {
            logValidationAttempt: jest.fn(),
            logValidationSuccess: jest.fn(),
            logSecurityViolation: jest.fn(),
            logCommandExecution: jest.fn(),
            logCommandFailure: jest.fn(),
            logConfigurationValidation: jest.fn(),
            logPolicyUpdate: jest.fn(),
            logSuspiciousActivity: jest.fn(),
            getRecentLogs: jest.fn(),
            getSecurityViolations: jest.fn()
        };
        mockPolicyManager = {
            getPolicy: jest.fn(),
            updatePolicy: jest.fn(),
            isCommandAllowed: jest.fn(),
            isPathAllowed: jest.fn(),
            validateArguments: jest.fn()
        };
        command_validator_1.CommandValidator.mockImplementation(() => mockValidator);
        audit_logger_1.AuditLogger.getInstance.mockReturnValue(mockAuditLogger);
        security_policy_1.SecurityPolicyManager.getInstance.mockReturnValue(mockPolicyManager);
        mockPolicyManager.getPolicy.mockReturnValue({
            sandboxEnabled: true,
            auditEnabled: true,
            allowedCommands: ['python', 'node'],
            blockedCommands: ['rm', 'sudo'],
            allowedPaths: [process.cwd(), '/tmp'],
            blockedPaths: ['/etc', '/bin'],
            maxArguments: 50,
            allowedArgumentPatterns: [/^[a-zA-Z0-9._\-\/]+$/],
            blockedArgumentPatterns: [/rm\s+-rf/],
        });
        executor = new sandboxed_executor_1.SandboxedExecutor();
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('Command Execution', () => {
        test('should execute valid command successfully', async () => {
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test'
            };
            mockValidator.validateCommand.mockReturnValue({
                allowed: true,
                sanitizedArgs: ['-V']
            });
            const mockProcess = {
                pid: 12345,
                on: jest.fn(),
                kill: jest.fn()
            };
            const { spawn } = require('child_process');
            spawn.mockReturnValue(mockProcess);
            const executePromise = executor.executeCommand(execution);
            setTimeout(() => {
                const spawnCallback = mockProcess.on.mock.calls.find((call) => call[0] === 'spawn')[1];
                spawnCallback();
            }, 10);
            const result = await executePromise;
            expect(result.success).toBe(true);
            expect(result.pid).toBe(12345);
            expect(result.process).toBe(mockProcess);
            expect(mockAuditLogger.logCommandExecution).toHaveBeenCalledWith(execution, 12345);
        });
        test('should reject invalid command', async () => {
            const execution = {
                command: 'rm',
                args: ['-rf', '/'],
                source: 'test'
            };
            mockValidator.validateCommand.mockReturnValue({
                allowed: false,
                reason: 'Blocked command'
            });
            const result = await executor.executeCommand(execution);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Security validation failed');
            expect(mockAuditLogger.logCommandFailure).toHaveBeenCalled();
        });
        test('should handle spawn errors', async () => {
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test'
            };
            mockValidator.validateCommand.mockReturnValue({
                allowed: true,
                sanitizedArgs: ['-V']
            });
            const mockProcess = {
                pid: undefined,
                on: jest.fn(),
                kill: jest.fn()
            };
            const { spawn } = require('child_process');
            spawn.mockReturnValue(mockProcess);
            const executePromise = executor.executeCommand(execution);
            setTimeout(() => {
                const errorCallback = mockProcess.on.mock.calls.find((call) => call[0] === 'error')[1];
                errorCallback(new Error('Spawn failed'));
            }, 10);
            const result = await executePromise;
            expect(result.success).toBe(false);
            expect(result.error).toContain('Spawn failed');
        });
        test('should handle process timeout', async () => {
            const execution = {
                command: 'python',
                args: ['-c', 'import time; time.sleep(100)'],
                source: 'test'
            };
            mockValidator.validateCommand.mockReturnValue({
                allowed: true,
                sanitizedArgs: ['-c', 'import time; time.sleep(100)']
            });
            const mockProcess = {
                pid: 12345,
                on: jest.fn(),
                kill: jest.fn()
            };
            const { spawn } = require('child_process');
            spawn.mockReturnValue(mockProcess);
            jest.useFakeTimers();
            const executePromise = executor.executeCommand(execution);
            jest.advanceTimersByTime(35000);
            const result = await executePromise;
            expect(result.success).toBe(false);
            expect(result.error).toContain('timed out');
            expect(result.timedOut).toBe(true);
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
            jest.useRealTimers();
        });
    });
    describe('Sandbox Configuration', () => {
        test('should apply sandbox options correctly', async () => {
            const execution = {
                command: 'python',
                args: ['-V'],
                cwd: '/tmp',
                env: { TEST_VAR: 'value' },
                source: 'test'
            };
            const options = {
                timeout: 10000,
                maxMemory: 256,
                allowNetworking: false,
                allowFileWrite: false,
                restrictToPath: '/tmp'
            };
            mockValidator.validateCommand.mockReturnValue({
                allowed: true,
                sanitizedArgs: ['-V']
            });
            mockPolicyManager.isPathAllowed.mockReturnValue(true);
            const mockProcess = {
                pid: 12345,
                on: jest.fn(),
                kill: jest.fn()
            };
            const { spawn } = require('child_process');
            spawn.mockReturnValue(mockProcess);
            const executePromise = executor.executeCommand(execution, options);
            setTimeout(() => {
                const spawnCallback = mockProcess.on.mock.calls.find((call) => call[0] === 'spawn')[1];
                spawnCallback();
            }, 10);
            await executePromise;
            expect(spawn).toHaveBeenCalledWith('python', ['-V'], expect.objectContaining({
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,
                windowsHide: true,
                detached: false,
                cwd: '/tmp'
            }));
        });
        test('should sanitize environment variables', async () => {
            const execution = {
                command: 'python',
                args: ['-V'],
                env: {
                    PORT: '3000',
                    GITHUB_TOKEN: 'token123',
                    LD_PRELOAD: '/malicious/lib',
                    PATH: '/malicious/path'
                },
                source: 'test'
            };
            mockValidator.validateCommand.mockReturnValue({
                allowed: true,
                sanitizedArgs: ['-V']
            });
            const mockProcess = {
                pid: 12345,
                on: jest.fn(),
                kill: jest.fn()
            };
            const { spawn } = require('child_process');
            spawn.mockReturnValue(mockProcess);
            const executePromise = executor.executeCommand(execution);
            setTimeout(() => {
                const spawnCallback = mockProcess.on.mock.calls.find((call) => call[0] === 'spawn')[1];
                spawnCallback();
            }, 10);
            await executePromise;
            const spawnCall = spawn.mock.calls[0];
            const spawnOptions = spawnCall[2];
            expect(spawnOptions.env).not.toHaveProperty('LD_PRELOAD');
            expect(spawnOptions.env.PATH).toBeDefined();
            expect(spawnOptions.env.NODE_ENV).toBeDefined();
            expect(spawnOptions.env.USER).toBe('sandbox');
        });
        test('should use safe working directory when none provided', async () => {
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test'
            };
            mockValidator.validateCommand.mockReturnValue({
                allowed: true,
                sanitizedArgs: ['-V']
            });
            const mockProcess = {
                pid: 12345,
                on: jest.fn(),
                kill: jest.fn()
            };
            const { spawn } = require('child_process');
            spawn.mockReturnValue(mockProcess);
            const executePromise = executor.executeCommand(execution);
            setTimeout(() => {
                const spawnCallback = mockProcess.on.mock.calls.find((call) => call[0] === 'spawn')[1];
                spawnCallback();
            }, 10);
            await executePromise;
            const spawnCall = spawn.mock.calls[0];
            const spawnOptions = spawnCall[2];
            expect(spawnOptions.cwd).toBe(process.cwd());
        });
    });
    describe('Process Monitoring', () => {
        test('should monitor process memory usage', () => {
            const mockProcess = {
                pid: 12345,
                killed: false,
                resourceUsage: jest.fn().mockReturnValue({
                    maxRSS: 1024 * 1024
                }),
                kill: jest.fn()
            };
            const options = {
                maxMemory: 512
            };
            jest.useFakeTimers();
            executor.monitorProcess(mockProcess, options);
            jest.advanceTimersByTime(6000);
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
            expect(mockAuditLogger.logSuspiciousActivity).toHaveBeenCalledWith(expect.stringContaining('exceeded memory limit'), expect.any(Object));
            jest.useRealTimers();
        });
        test('should stop monitoring when process exits', () => {
            const mockProcess = {
                pid: undefined,
                killed: false
            };
            jest.useFakeTimers();
            executor.monitorProcess(mockProcess);
            jest.advanceTimersByTime(10000);
            expect(mockAuditLogger.logSuspiciousActivity).not.toHaveBeenCalled();
            jest.useRealTimers();
        });
        test('should handle monitoring errors gracefully', () => {
            const mockProcess = {
                pid: 12345,
                killed: false,
                resourceUsage: jest.fn().mockImplementation(() => {
                    throw new Error('Resource monitoring not available');
                })
            };
            jest.useFakeTimers();
            expect(() => {
                executor.monitorProcess(mockProcess);
                jest.advanceTimersByTime(6000);
            }).not.toThrow();
            jest.useRealTimers();
        });
    });
    describe('Error Handling', () => {
        test('should handle validator initialization errors', async () => {
            command_validator_1.CommandValidator.mockImplementation(() => {
                throw new Error('Validator initialization failed');
            });
            expect(() => {
                new sandboxed_executor_1.SandboxedExecutor();
            }).toThrow('Validator initialization failed');
        });
        test('should handle policy manager errors', async () => {
            mockPolicyManager.getPolicy.mockImplementation(() => {
                throw new Error('Policy error');
            });
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test'
            };
            mockValidator.validateCommand.mockReturnValue({
                allowed: true,
                sanitizedArgs: ['-V']
            });
            const result = await executor.executeCommand(execution);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Execution error');
        });
    });
    describe('Platform-Specific Behavior', () => {
        test('should handle different platforms gracefully', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux' });
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test'
            };
            mockValidator.validateCommand.mockReturnValue({
                allowed: true,
                sanitizedArgs: ['-V']
            });
            const mockProcess = {
                pid: 12345,
                on: jest.fn(),
                kill: jest.fn()
            };
            const { spawn } = require('child_process');
            spawn.mockReturnValue(mockProcess);
            const executePromise = executor.executeCommand(execution);
            setTimeout(() => {
                const spawnCallback = mockProcess.on.mock.calls.find((call) => call[0] === 'spawn')[1];
                spawnCallback();
            }, 10);
            const result = await executePromise;
            expect(result.success).toBe(true);
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });
    });
});
