/**
 * Security Policy for Command Execution
 * Defines rules for safe command execution in MCP servers
 */

export interface SecurityPolicy {
  allowedCommands: string[];
  blockedCommands: string[];
  allowedPaths: string[];
  blockedPaths: string[];
  maxArguments: number;
  allowedArgumentPatterns: RegExp[];
  blockedArgumentPatterns: RegExp[];
  sandboxEnabled: boolean;
  auditEnabled: boolean;
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  // Only allow known safe MCP server commands
  allowedCommands: [
    'python',
    'python3',
    'node',
    'npm',
    'npx',
    'uvx',
    'pip',
    'pip3'
  ],
  
  // Block dangerous commands
  blockedCommands: [
    'rm',
    'rmdir',
    'dd',
    'mkfs',
    'fdisk',
    'mount',
    'umount',
    'sudo',
    'su',
    'passwd',
    'chmod',
    'chown',
    'chgrp',
    'systemctl',
    'service',
    'kill',
    'killall',
    'pkill',
    'reboot',
    'shutdown',
    'halt',
    'poweroff',
    'init',
    'curl',
    'wget',
    'nc',
    'netcat',
    'telnet',
    'ssh',
    'scp',
    'rsync'
  ],
  
  // Only allow execution within project directory and temp
  allowedPaths: [
    process.cwd(),
    '/tmp',
    '/var/tmp'
  ],
  
  // Block system directories
  blockedPaths: [
    '/',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/etc',
    '/boot',
    '/sys',
    '/proc',
    '/dev',
    '/root'
    // Note: /home removed to allow user directories
  ],
  
  maxArguments: 50,
  
  // Allow safe argument patterns
  allowedArgumentPatterns: [
    /^[a-zA-Z0-9._\-\/]+$/, // Alphanumeric, dots, dashes, slashes
    /^--?[a-zA-Z0-9\-]+(=[a-zA-Z0-9._\-\/]+)?$/ // CLI flags
  ],
  
  // Block dangerous argument patterns
  blockedArgumentPatterns: [
    /rm\s+-rf/, // rm -rf
    /-rf/, // Force recursive delete flag
    /--force/, // Force flags
    /--recursive/, // Recursive operations
    />/,  // Output redirection
    /\|/, // Pipes
    /;/,  // Command chaining
    /&&/, // Command chaining
    /\|\|/, // Command chaining
    /`/,  // Command substitution
    /\$\(/, // Command substitution
    /</, // Input redirection
    /\*/, // Wildcards
    /\?/, // Wildcards
    /\.\./, // Directory traversal
    /\/etc\//, // System config access
    /\/proc\//, // Process info access
    /\/sys\//, // System info access
    /\/dev\//, // Device access
    /sudo/, // Privilege escalation
    /su\s/, // User switching
    /chmod/, // Permission changes
    /chown/, // Ownership changes
    /passwd/, // Password changes
    /ssh/, // Remote access
    /curl/, // Network access
    /wget/ // Network access
  ],
  
  sandboxEnabled: true,
  auditEnabled: true
};

export class SecurityPolicyManager {
  private static instance: SecurityPolicyManager;
  private policy: SecurityPolicy;
  
  private constructor() {
    this.policy = { ...DEFAULT_SECURITY_POLICY };
  }
  
  public static getInstance(): SecurityPolicyManager {
    if (!SecurityPolicyManager.instance) {
      SecurityPolicyManager.instance = new SecurityPolicyManager();
    }
    return SecurityPolicyManager.instance;
  }
  
  public getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }
  
  public updatePolicy(newPolicy: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }
  
  public isCommandAllowed(command: string): boolean {
    // Check if command is in allowed list
    if (!this.policy.allowedCommands.includes(command)) {
      return false;
    }
    
    // Check if command is not in blocked list
    if (this.policy.blockedCommands.includes(command)) {
      return false;
    }
    
    return true;
  }
  
  public isPathAllowed(path: string): boolean {
    // Handle empty or invalid paths
    if (!path || typeof path !== 'string') {
      return false;
    }
    
    // Resolve to absolute path
    const absolutePath = require('path').resolve(path);
    
    // Check if path is in allowed list first
    for (const allowedPath of this.policy.allowedPaths) {
      if (absolutePath.startsWith(allowedPath)) {
        return true;
      }
    }
    
    // Check if path is in blocked list
    for (const blockedPath of this.policy.blockedPaths) {
      // Special handling for root directory - only block exact root, not everything that starts with /
      if (blockedPath === '/' && absolutePath === '/') {
        return false;
      } else if (blockedPath !== '/' && absolutePath.startsWith(blockedPath + '/')) {
        return false;
      } else if (blockedPath !== '/' && absolutePath === blockedPath) {
        return false;
      }
    }
    
    return false;
  }
  
  public validateArguments(args: string[]): { valid: boolean; reason?: string } {
    if (args.length > this.policy.maxArguments) {
      return {
        valid: false,
        reason: `Too many arguments: ${args.length} > ${this.policy.maxArguments}`
      };
    }
    
    // Check for dangerous argument combinations
    const argString = args.join(' ');
    for (const pattern of this.policy.blockedArgumentPatterns) {
      if (pattern.test(argString)) {
        return {
          valid: false,
          reason: `Argument contains blocked pattern: ${argString}`
        };
      }
    }
    
    for (const arg of args) {
      // Check individual blocked patterns
      for (const pattern of this.policy.blockedArgumentPatterns) {
        if (pattern.test(arg)) {
          return {
            valid: false,
            reason: `Argument contains blocked pattern: ${arg}`
          };
        }
      }
      
      // Check if argument matches allowed patterns
      let matchesAllowed = false;
      for (const pattern of this.policy.allowedArgumentPatterns) {
        if (pattern.test(arg)) {
          matchesAllowed = true;
          break;
        }
      }
      
      if (!matchesAllowed) {
        return {
          valid: false,
          reason: `Argument does not match allowed patterns: ${arg}`
        };
      }
    }
    
    return { valid: true };
  }
}