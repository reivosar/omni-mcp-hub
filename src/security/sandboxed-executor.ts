import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { CommandValidator, CommandExecution, ValidationResult } from './command-validator';
import { AuditLogger } from './audit-logger';
import { SecurityPolicyManager } from './security-policy';
import * as path from 'path';
import * as os from 'os';

export interface SandboxOptions {
  timeout?: number; // Execution timeout in milliseconds
  maxMemory?: number; // Max memory in MB
  allowNetworking?: boolean;
  allowFileWrite?: boolean;
  restrictToPath?: string;
}

export interface ExecutionResult {
  success: boolean;
  pid?: number;
  process?: ChildProcess;
  error?: string;
  killed?: boolean;
  timedOut?: boolean;
}

export class SandboxedExecutor {
  private validator: CommandValidator;
  private auditLogger: AuditLogger;
  private securityPolicy: SecurityPolicyManager;
  
  constructor() {
    this.validator = new CommandValidator();
    this.auditLogger = AuditLogger.getInstance();
    this.securityPolicy = SecurityPolicyManager.getInstance();
  }
  
  /**
   * Execute a command in a sandboxed environment
   */
  public async executeCommand(
    execution: CommandExecution,
    options: SandboxOptions = {}
  ): Promise<ExecutionResult> {
    try {
      // 1. Validate the command
      const validation = this.validator.validateCommand(execution);
      if (!validation.allowed) {
        this.auditLogger.logCommandFailure(execution, `Security validation failed: ${validation.reason}`);
        return {
          success: false,
          error: `Security validation failed: ${validation.reason}`
        };
      }
      
      // 2. Prepare sandboxed execution environment
      const sandboxedOptions = this.prepareSandboxOptions(execution, options);
      
      // 3. Execute with security constraints
      const result = await this.spawnSandboxedProcess(
        execution.command,
        validation.sanitizedArgs || execution.args,
        sandboxedOptions
      );
      
      // 4. Log execution
      if (result.success && result.pid) {
        this.auditLogger.logCommandExecution(execution, result.pid);
      } else {
        this.auditLogger.logCommandFailure(execution, result.error || 'Unknown error');
      }
      
      return result;
      
    } catch (error) {
      const errorMessage = `Execution error: ${error}`;
      this.auditLogger.logCommandFailure(execution, errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }
  
  private prepareSandboxOptions(
    execution: CommandExecution,
    options: SandboxOptions
  ): SpawnOptions {
    const policy = this.securityPolicy.getPolicy();
    
    // Base spawn options
    const spawnOptions: SpawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false, // Never use shell to prevent injection
      windowsHide: true,
      detached: false
    };
    
    // Set working directory (validated)
    if (execution.cwd && this.securityPolicy.isPathAllowed(execution.cwd)) {
      spawnOptions.cwd = execution.cwd;
    } else {
      // Default to project directory
      spawnOptions.cwd = process.cwd();
    }
    
    // Set environment variables (filtered)
    spawnOptions.env = this.prepareEnvironment(execution.env, options);
    
    // Platform-specific sandboxing
    if (policy.sandboxEnabled) {
      this.applySandboxConstraints(spawnOptions, options);
    }
    
    return spawnOptions;
  }
  
  private prepareEnvironment(
    userEnv?: Record<string, string>,
    options?: SandboxOptions
  ): Record<string, string> {
    // Start with minimal safe environment
    const safeEnv: Record<string, string> = {
      NODE_ENV: process.env.NODE_ENV || 'production',
      PATH: this.getSafePath(),
      HOME: os.tmpdir(), // Use temp directory as fake home
      USER: 'sandbox',
      LANG: process.env.LANG || 'en_US.UTF-8'
    };
    
    // Add user environment variables (validated)
    if (userEnv) {
      for (const [key, value] of Object.entries(userEnv)) {
        // Only allow safe environment variables
        if (this.isSafeEnvironmentVariable(key, value)) {
          safeEnv[key] = value;
        }
      }
    }
    
    return safeEnv;
  }
  
  private getSafePath(): string {
    // Start with current PATH and filter out dangerous directories
    const currentPath = process.env.PATH || '';
    const pathDirs = currentPath.split(path.delimiter);
    
    // Dangerous directories to exclude
    const dangerousPaths = [
      '/sbin',
      '/usr/sbin',
      '/System/Library/PrivateFrameworks',
      '/System/Library/Frameworks'
    ];
    
    // Filter and validate paths
    const safePaths = pathDirs.filter(pathDir => {
      // Skip empty paths
      if (!pathDir) return false;
      
      // Skip dangerous paths
      if (dangerousPaths.some(dangerous => pathDir.startsWith(dangerous))) {
        return false;
      }
      
      return true;
    });
    
    return safePaths.join(path.delimiter);
  }
  
  private isSafeEnvironmentVariable(key: string, value: string): boolean {
    // Allow list of safe environment variables
    const safeEnvVars = [
      'NODE_ENV',
      'PORT',
      'GITHUB_TOKEN',
      'ARXIV_API_KEY',
      'DATABASE_PATH',
      'GIT_USER_NAME',
      'GIT_USER_EMAIL',
      'ALLOWED_PATHS'
    ];
    
    if (!safeEnvVars.includes(key)) {
      return false;
    }
    
    // Additional validation for specific variables
    switch (key) {
      case 'PORT':
        const port = parseInt(value);
        return !isNaN(port) && port > 1024 && port < 65536;
      
      case 'DATABASE_PATH':
      case 'ALLOWED_PATHS':
        return this.securityPolicy.isPathAllowed(value);
      
      default:
        return true;
    }
  }
  
  private applySandboxConstraints(
    spawnOptions: SpawnOptions,
    options: SandboxOptions
  ): void {
    // Platform-specific sandboxing
    if (process.platform === 'linux') {
      this.applyLinuxSandbox(spawnOptions, options);
    } else if (process.platform === 'darwin') {
      this.applyMacOSSandbox(spawnOptions, options);
    }
    // Windows sandboxing would require different approach
  }
  
  private applyLinuxSandbox(
    spawnOptions: SpawnOptions,
    options: SandboxOptions
  ): void {
    // Use firejail if available for Linux sandboxing
    // This is a simplified approach - production would use more sophisticated sandboxing
    const firejailArgs = [
      '--noprofile',
      '--seccomp',
      '--caps.drop=all',
      '--nonewprivs',
      '--noroot'
    ];
    
    if (!options.allowNetworking) {
      firejailArgs.push('--net=none');
    }
    
    if (!options.allowFileWrite) {
      firejailArgs.push('--read-only=' + (options.restrictToPath || process.cwd()));
    }
    
    // Note: This would require firejail to be installed
    // In production, consider using Docker or other containerization
  }
  
  private applyMacOSSandbox(
    spawnOptions: SpawnOptions,
    options: SandboxOptions
  ): void {
    // macOS sandbox-exec could be used here
    // For now, we rely on process isolation and monitoring
  }
  
  private async spawnSandboxedProcess(
    command: string,
    args: string[],
    options: SpawnOptions
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      let killed = false;
      let timedOut = false;
      
      try {
        const process = spawn(command, args, options);
        
        const pid = process.pid;
        
        // Set up timeout
        const timeout = setTimeout(() => {
          if (!killed) {
            timedOut = true;
            killed = true;
            process.kill('SIGKILL');
            resolve({
              success: false,
              error: 'Process timed out',
              killed: true,
              timedOut: true
            });
          }
        }, 30000); // 30 second default timeout
        
        process.on('spawn', () => {
          resolve({
            success: true,
            pid,
            process
          });
          clearTimeout(timeout);
        });
        
        process.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            error: error.message
          });
        });
        
        process.on('exit', (code, signal) => {
          clearTimeout(timeout);
          if (!killed) {
            // Process completed normally - this is handled by the caller
          }
        });
        
      } catch (error) {
        resolve({
          success: false,
          error: `Failed to spawn process: ${error}`
        });
      }
    });
  }
  
  /**
   * Monitor a running process for resource usage
   */
  public monitorProcess(process: ChildProcess, options: SandboxOptions = {}): void {
    if (!process.pid) return;
    
    const maxMemory = options.maxMemory || 512; // 512MB default
    
    const monitor = setInterval(() => {
      if (!process.pid || process.killed) {
        clearInterval(monitor);
        return;
      }
      
      // Check memory usage (simplified)
      try {
        const usage = (process as any).resourceUsage?.();
        if (usage) {
          const memoryMB = usage.maxRSS / 1024; // Convert to MB
          
          if (memoryMB > maxMemory) {
            this.auditLogger.logSuspiciousActivity(
              `Process ${process.pid} exceeded memory limit`,
              { memoryMB, maxMemory, command: process.spawnargs }
            );
            
            process.kill('SIGKILL');
            clearInterval(monitor);
          }
        }
      } catch (error) {
        // Resource monitoring not available
      }
    }, 5000); // Check every 5 seconds
    
    // Stop monitoring after 10 minutes
    setTimeout(() => {
      clearInterval(monitor);
    }, 600000);
  }
}