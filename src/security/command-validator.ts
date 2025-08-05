import { SecurityPolicyManager } from './security-policy';
import { AuditLogger } from './audit-logger';
import * as path from 'path';

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  sanitizedArgs?: string[];
}

export interface CommandExecution {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  requestId?: string;
  source?: string;
}

export class CommandValidator {
  private securityPolicy: SecurityPolicyManager;
  private auditLogger: AuditLogger;
  
  constructor() {
    this.securityPolicy = SecurityPolicyManager.getInstance();
    this.auditLogger = AuditLogger.getInstance();
  }
  
  /**
   * Validates a command execution request
   */
  public validateCommand(execution: CommandExecution): ValidationResult {
    const policy = this.securityPolicy.getPolicy();
    
    try {
      // Log the validation attempt
      if (policy.auditEnabled) {
        this.auditLogger.logValidationAttempt(execution);
      }
      
      // 1. Validate command
      const commandValidation = this.validateCommandName(execution.command);
      if (!commandValidation.allowed) {
        this.auditLogger.logSecurityViolation(execution, commandValidation.reason!);
        return commandValidation;
      }
      
      // 2. Sanitize arguments first
      const sanitizedArgs = this.sanitizeArguments(execution.args);
      
      // 3. Validate sanitized arguments
      const argsValidation = this.validateArguments(sanitizedArgs);
      if (!argsValidation.allowed) {
        this.auditLogger.logSecurityViolation(execution, argsValidation.reason!);
        return argsValidation;
      }
      
      // 4. Validate working directory
      if (execution.cwd) {
        const cwdValidation = this.validateWorkingDirectory(execution.cwd);
        if (!cwdValidation.allowed) {
          this.auditLogger.logSecurityViolation(execution, cwdValidation.reason!);
          return cwdValidation;
        }
      }
      
      // 5. Validate environment variables
      if (execution.env) {
        const envValidation = this.validateEnvironment(execution.env);
        if (!envValidation.allowed) {
          this.auditLogger.logSecurityViolation(execution, envValidation.reason!);
          return envValidation;
        }
      }
      
      this.auditLogger.logValidationSuccess(execution);
      
      return {
        allowed: true,
        sanitizedArgs
      };
      
    } catch (error) {
      const reason = `Validation error: ${error}`;
      this.auditLogger.logSecurityViolation(execution, reason);
      return {
        allowed: false,
        reason
      };
    }
  }
  
  private validateCommandName(command: string): ValidationResult {
    // Extract base command (remove path)
    const baseCommand = path.basename(command);
    
    if (!this.securityPolicy.isCommandAllowed(baseCommand)) {
      return {
        allowed: false,
        reason: `Command '${baseCommand}' is not in the allowed commands list`
      };
    }
    
    // Check for path traversal in command
    if (command.includes('..') || command.includes('~')) {
      return {
        allowed: false,
        reason: `Command contains path traversal: ${command}`
      };
    }
    
    return { allowed: true };
  }
  
  private validateArguments(args: string[]): ValidationResult {
    const validation = this.securityPolicy.validateArguments(args);
    if (!validation.valid) {
      return {
        allowed: false,
        reason: validation.reason
      };
    }
    
    // Additional checks for dangerous argument combinations
    const argString = args.join(' ');
    
    // Check for shell injection patterns
    const shellInjectionPatterns = [
      /;\s*rm/, // ; rm
      /&&\s*rm/, // && rm
      /\|\s*rm/, // | rm
      /`.*rm.*`/, // Command substitution with rm
      /\$\(.*rm.*\)/, // Command substitution with rm
    ];
    
    for (const pattern of shellInjectionPatterns) {
      if (pattern.test(argString)) {
        return {
          allowed: false,
          reason: `Arguments contain shell injection pattern: ${argString}`
        };
      }
    }
    
    return { allowed: true };
  }
  
  private validateWorkingDirectory(cwd: string): ValidationResult {
    if (!this.securityPolicy.isPathAllowed(cwd)) {
      return {
        allowed: false,
        reason: `Working directory not allowed: ${cwd}`
      };
    }
    
    return { allowed: true };
  }
  
  private validateEnvironment(env: Record<string, string>): ValidationResult {
    // Check for dangerous environment variables
    const dangerousEnvVars = [
      'LD_PRELOAD',
      'LD_LIBRARY_PATH',
      'PATH', // Don't allow PATH modification
      'SHELL',
      'HOME' // Don't allow HOME modification
    ];
    
    for (const envVar of dangerousEnvVars) {
      if (env.hasOwnProperty(envVar)) {
        return {
          allowed: false,
          reason: `Dangerous environment variable: ${envVar}`
        };
      }
    }
    
    // Validate environment variable values
    for (const [key, value] of Object.entries(env)) {
      if (typeof value !== 'string') {
        return {
          allowed: false,
          reason: `Invalid environment variable type: ${key} = ${typeof value}`
        };
      }
      
      // Check for injection in env vars
      if (value.includes(';') || value.includes('&&') || value.includes('|')) {
        return {
          allowed: false,
          reason: `Environment variable contains shell metacharacters: ${key} = ${value}`
        };
      }
    }
    
    return { allowed: true };
  }
  
  private sanitizeArguments(args: string[]): string[] {
    return args.map(arg => {
      // Remove any null bytes
      return arg.replace(/\0/g, '');
    });
  }
  
  /**
   * Validates MCP server configuration for security
   */
  public validateMCPServerConfig(config: any): ValidationResult {
    // HTTP MCP servers don't need commands
    if (config.type === 'http') {
      if (!config.url || typeof config.url !== 'string') {
        return {
          allowed: false,
          reason: 'Missing or invalid URL for HTTP MCP server'
        };
      }
      
      // Validate URL format
      try {
        new URL(config.url);
      } catch {
        return {
          allowed: false,
          reason: 'Invalid URL format for HTTP MCP server'
        };
      }
      
      return { allowed: true };
    }
    
    if (!config.command) {
      return {
        allowed: false,
        reason: 'Missing command in MCP server configuration'
      };
    }
    
    if (!config.name || typeof config.name !== 'string') {
      return {
        allowed: false,
        reason: 'Invalid or missing name in MCP server configuration'
      };
    }
    
    // Validate the command
    const commandValidation = this.validateCommandName(config.command);
    if (!commandValidation.allowed) {
      return commandValidation;
    }
    
    // Validate arguments if present
    if (config.args && Array.isArray(config.args)) {
      const argsValidation = this.validateArguments(config.args);
      if (!argsValidation.allowed) {
        return argsValidation;
      }
    }
    
    // Validate install command if present
    if (config.install_command) {
      const installParts = config.install_command.split(' ');
      const installCommand = installParts[0];
      const installArgs = installParts.slice(1);
      
      const installCommandValidation = this.validateCommandName(installCommand);
      if (!installCommandValidation.allowed) {
        return {
          allowed: false,
          reason: `Install command validation failed: ${installCommandValidation.reason}`
        };
      }
      
      const installArgsValidation = this.validateArguments(installArgs);
      if (!installArgsValidation.allowed) {
        return {
          allowed: false,
          reason: `Install command arguments validation failed: ${installArgsValidation.reason}`
        };
      }
    }
    
    return { allowed: true };
  }
}