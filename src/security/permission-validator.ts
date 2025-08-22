import { EventEmitter } from 'events';
import * as path from 'path';

export interface PermissionConfig {
  allowedTools?: string[];
  deniedTools?: string[];
  sandboxPaths?: string[];
  maxTokens?: number;
  timeout?: number;
  allowedMethods?: string[];
  deniedMethods?: string[];
  readOnlyMode?: boolean;
}

export interface ValidationContext {
  userId?: string;
  profileName: string;
  toolName: string;
  methodName?: string;
  arguments?: Record<string, unknown>;
  filePath?: string;
  estimatedTokens?: number;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  warnings?: string[];
}

export class PermissionValidator extends EventEmitter {
  private permissions: Map<string, PermissionConfig> = new Map();
  private defaultConfig: PermissionConfig;

  constructor(defaultConfig: PermissionConfig = {}) {
    super();
    this.defaultConfig = {
      allowedTools: [],
      deniedTools: ['delete-*', 'remove-*'],
      sandboxPaths: [],
      maxTokens: 100000,
      timeout: 300,
      readOnlyMode: false,
      ...defaultConfig
    };
  }

  public setProfilePermissions(profileName: string, config: PermissionConfig): void {
    this.permissions.set(profileName, {
      ...this.defaultConfig,
      ...config
    });

    this.emit('permissions:updated', {
      profile: profileName,
      config
    });
  }

  public validateToolAccess(context: ValidationContext): ValidationResult {
    const config = this.getPermissions(context.profileName);
    const toolId = context.toolName;
    const warnings: string[] = [];

    if (config.readOnlyMode) {
      const writeOperations = ['write', 'delete', 'create', 'update', 'modify', 'remove'];
      const isWriteOperation = writeOperations.some(op => 
        toolId.toLowerCase().includes(op) || 
        (context.methodName && context.methodName.toLowerCase().includes(op))
      );

      if (isWriteOperation) {
        this.auditDenial(context, 'read-only-mode');
        return {
          allowed: false,
          reason: 'Profile is in read-only mode'
        };
      }
    }

    if (this.isToolDenied(toolId, config)) {
      this.auditDenial(context, 'tool-explicitly-denied');
      return {
        allowed: false,
        reason: `Tool '${toolId}' is explicitly denied for profile '${context.profileName}'`
      };
    }

    if (!this.isToolAllowed(toolId, config)) {
      this.auditDenial(context, 'tool-denied');
      return {
        allowed: false,
        reason: `Tool '${toolId}' is not permitted for profile '${context.profileName}'`
      };
    }

    if (context.methodName && !this.isMethodAllowed(context.methodName, config)) {
      this.auditDenial(context, 'method-denied');
      return {
        allowed: false,
        reason: `Method '${context.methodName}' is not permitted`
      };
    }

    if (context.filePath && !this.isPathAllowed(context.filePath, config)) {
      this.auditDenial(context, 'path-denied');
      return {
        allowed: false,
        reason: `Path '${context.filePath}' is outside allowed sandbox`
      };
    }

    if (context.estimatedTokens && config.maxTokens && context.estimatedTokens > config.maxTokens) {
      warnings.push(`Estimated tokens (${context.estimatedTokens}) exceeds limit (${config.maxTokens})`);
    }

    this.auditAccess(context);

    return {
      allowed: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  private getPermissions(profileName: string): PermissionConfig {
    return this.permissions.get(profileName) || this.defaultConfig;
  }

  private isToolAllowed(toolId: string, config: PermissionConfig): boolean {
    if (!config.allowedTools || config.allowedTools.length === 0) {
      return true;
    }

    return config.allowedTools.some(pattern => this.matchesPattern(toolId, pattern));
  }

  private isToolDenied(toolId: string, config: PermissionConfig): boolean {
    if (!config.deniedTools || config.deniedTools.length === 0) {
      return false;
    }

    return config.deniedTools.some(pattern => this.matchesPattern(toolId, pattern));
  }

  private isMethodAllowed(methodName: string, config: PermissionConfig): boolean {
    if (!config.allowedMethods || config.allowedMethods.length === 0) {
      return true;
    }

    return config.allowedMethods.some(pattern => this.matchesPattern(methodName, pattern));
  }

  private isPathAllowed(filePath: string, config: PermissionConfig): boolean {
    if (!config.sandboxPaths || config.sandboxPaths.length === 0) {
      return true;
    }

    const normalizedPath = path.resolve(filePath);
    
    return config.sandboxPaths.some(sandboxPath => {
      const normalizedSandbox = path.resolve(sandboxPath);
      return normalizedPath.startsWith(normalizedSandbox);
    });
  }

  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern.includes('*') || pattern.includes('?')) {
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '[0-9]');
      return new RegExp(`^${regexPattern}$`, 'i').test(value);
    }

    return value.toLowerCase() === pattern.toLowerCase();
  }

  private auditAccess(context: ValidationContext): void {
    this.emit('access:granted', {
      timestamp: new Date(),
      userId: context.userId,
      profile: context.profileName,
      tool: context.toolName,
      method: context.methodName,
      path: context.filePath
    });
  }

  private auditDenial(context: ValidationContext, reason: string): void {
    this.emit('access:denied', {
      timestamp: new Date(),
      userId: context.userId,
      profile: context.profileName,
      tool: context.toolName,
      method: context.methodName,
      path: context.filePath,
      reason
    });
  }

  public removeProfile(profileName: string): void {
    this.permissions.delete(profileName);
    this.emit('permissions:removed', { profile: profileName });
  }

  public listProfiles(): string[] {
    return Array.from(this.permissions.keys());
  }

  public getProfileStats(profileName: string): Record<string, unknown> | null {
    const config = this.permissions.get(profileName);
    
    if (!config) {
      return null;
    }

    return {
      allowedToolsCount: config.allowedTools?.length || 0,
      deniedToolsCount: config.deniedTools?.length || 0,
      sandboxPathsCount: config.sandboxPaths?.length || 0,
      readOnlyMode: config.readOnlyMode || false,
      maxTokens: config.maxTokens,
      timeout: config.timeout
    };
  }
}