import { SandboxedExecutor, SandboxOptions, ExecutionResult } from '../../../src/security/sandboxed-executor';
import { CommandValidator, CommandExecution } from '../../../src/security/command-validator';
import { AuditLogger } from '../../../src/security/audit-logger';
import { SecurityPolicyManager } from '../../../src/security/security-policy';
import { ChildProcess } from 'child_process';

// Mock dependencies
jest.mock('../../../src/security/command-validator');
jest.mock('../../../src/security/audit-logger');
jest.mock('../../../src/security/security-policy');
jest.mock('child_process');

describe('SandboxedExecutor', () => {
  let executor: SandboxedExecutor;
  let mockValidator: jest.Mocked<CommandValidator>;
  let mockAuditLogger: jest.Mocked<AuditLogger>;
  let mockPolicyManager: jest.Mocked<SecurityPolicyManager>;

  beforeEach(() => {
    // Reset singletons
    (SecurityPolicyManager as any).instance = null;
    (AuditLogger as any).instance = null;

    mockValidator = {
      validateCommand: jest.fn(),
      validateMCPServerConfig: jest.fn()
    } as any;

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
    } as any;

    mockPolicyManager = {
      getPolicy: jest.fn(),
      updatePolicy: jest.fn(),
      isCommandAllowed: jest.fn(),
      isPathAllowed: jest.fn(),
      validateArguments: jest.fn()
    } as any;

    (CommandValidator as jest.MockedClass<typeof CommandValidator>).mockImplementation(() => mockValidator);
    (AuditLogger.getInstance as jest.Mock).mockReturnValue(mockAuditLogger);
    (SecurityPolicyManager.getInstance as jest.Mock).mockReturnValue(mockPolicyManager);

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
    } as any);

    executor = new SandboxedExecutor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Command Execution', () => {
    test('should execute valid command successfully', async () => {
      const execution: CommandExecution = {
        command: 'python',
        args: ['-V'],
        source: 'test'
      };

      mockValidator.validateCommand.mockReturnValue({
        allowed: true,
        sanitizedArgs: ['-V']
      });

      // Mock spawn to return a successful process
      const mockProcess = {
        pid: 12345,
        on: jest.fn(),
        kill: jest.fn()
      } as any;

      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      // Simulate successful spawn
      const executePromise = executor.executeCommand(execution);
      
      // Trigger spawn event
      setTimeout(() => {
        const spawnCallback = mockProcess.on.mock.calls.find((call: any) => call[0] === 'spawn')[1];
        spawnCallback();
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.pid).toBe(12345);
      expect(result.process).toBe(mockProcess);
      expect(mockAuditLogger.logCommandExecution).toHaveBeenCalledWith(execution, 12345);
    });

    test('should reject invalid command', async () => {
      const execution: CommandExecution = {
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
      const execution: CommandExecution = {
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
      } as any;

      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const executePromise = executor.executeCommand(execution);
      
      // Trigger error event
      setTimeout(() => {
        const errorCallback = mockProcess.on.mock.calls.find((call: any) => call[0] === 'error')[1];
        errorCallback(new Error('Spawn failed'));
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Spawn failed');
    });

    test('should handle process timeout', async () => {
      const execution: CommandExecution = {
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
      } as any;

      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      // Use fake timers to control timeout
      jest.useFakeTimers();

      const executePromise = executor.executeCommand(execution);

      // Fast-forward time past the timeout
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
      const execution: CommandExecution = {
        command: 'python',
        args: ['-V'],
        cwd: '/tmp',
        env: { TEST_VAR: 'value' },
        source: 'test'
      };

      const options: SandboxOptions = {
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
      } as any;

      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const executePromise = executor.executeCommand(execution, options);
      
      setTimeout(() => {
        const spawnCallback = mockProcess.on.mock.calls.find((call: any) => call[0] === 'spawn')[1];
        spawnCallback();
      }, 10);

      await executePromise;

      expect(spawn).toHaveBeenCalledWith(
        'python',
        ['-V'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          windowsHide: true,
          detached: false,
          cwd: '/tmp'
        })
      );
    });

    test('should sanitize environment variables', async () => {
      const execution: CommandExecution = {
        command: 'python',
        args: ['-V'],
        env: {
          PORT: '3000',
          GITHUB_TOKEN: 'token123',
          LD_PRELOAD: '/malicious/lib', // Should be filtered out
          PATH: '/malicious/path' // Should be filtered out
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
      } as any;

      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const executePromise = executor.executeCommand(execution);
      
      setTimeout(() => {
        const spawnCallback = mockProcess.on.mock.calls.find((call: any) => call[0] === 'spawn')[1];
        spawnCallback();
      }, 10);

      await executePromise;

      const spawnCall = spawn.mock.calls[0];
      const spawnOptions = spawnCall[2];
      
      expect(spawnOptions.env).not.toHaveProperty('LD_PRELOAD');
      expect(spawnOptions.env).not.toHaveProperty('PATH'); // Should be replaced with safe PATH
      expect(spawnOptions.env.NODE_ENV).toBeDefined();
      expect(spawnOptions.env.USER).toBe('sandbox');
    });

    test('should use safe working directory when none provided', async () => {
      const execution: CommandExecution = {
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
      } as any;

      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const executePromise = executor.executeCommand(execution);
      
      setTimeout(() => {
        const spawnCallback = mockProcess.on.mock.calls.find((call: any) => call[0] === 'spawn')[1];
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
          maxRSS: 1024 * 1024 // 1GB in KB
        }),
        kill: jest.fn()
      } as any;

      const options: SandboxOptions = {
        maxMemory: 512 // 512MB limit
      };

      jest.useFakeTimers();

      executor.monitorProcess(mockProcess, options);

      // Advance time to trigger monitoring check
      jest.advanceTimersByTime(6000);

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(mockAuditLogger.logSuspiciousActivity).toHaveBeenCalledWith(
        expect.stringContaining('exceeded memory limit'),
        expect.any(Object)
      );

      jest.useRealTimers();
    });

    test('should stop monitoring when process exits', () => {
      const mockProcess = {
        pid: undefined, // Process already exited
        killed: false
      } as any;

      jest.useFakeTimers();

      executor.monitorProcess(mockProcess);

      // Advance time - should not crash or log anything
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
      } as any;

      jest.useFakeTimers();

      // Should not throw
      expect(() => {
        executor.monitorProcess(mockProcess);
        jest.advanceTimersByTime(6000);
      }).not.toThrow();

      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    test('should handle validator initialization errors', async () => {
      (CommandValidator as jest.MockedClass<typeof CommandValidator>).mockImplementation(() => {
        throw new Error('Validator initialization failed');
      });

      const execution: CommandExecution = {
        command: 'python',
        args: ['-V'],
        source: 'test'
      };

      const newExecutor = new SandboxedExecutor();
      const result = await newExecutor.executeCommand(execution);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Execution error');
    });

    test('should handle policy manager errors', async () => {
      mockPolicyManager.getPolicy.mockImplementation(() => {
        throw new Error('Policy error');
      });

      const execution: CommandExecution = {
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
      
      // Test Linux
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      const execution: CommandExecution = {
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
      } as any;

      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const executePromise = executor.executeCommand(execution);
      
      setTimeout(() => {
        const spawnCallback = mockProcess.on.mock.calls.find((call: any) => call[0] === 'spawn')[1];
        spawnCallback();
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(true);

      // Restore original platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });
});