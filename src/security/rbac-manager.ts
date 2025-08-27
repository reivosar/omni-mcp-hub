import { EventEmitter } from "events";
import { PermissionConfig, PermissionValidator } from "./permission-validator";

export interface Role {
  name: string;
  description?: string;
  permissions: PermissionConfig;
  inherits?: string[];
  priority: number;
}

export interface UserRole {
  userId: string;
  roles: string[];
  customPermissions?: PermissionConfig;
  expiresAt?: Date;
}

export class RBACManager extends EventEmitter {
  private roles: Map<string, Role> = new Map();
  private userRoles: Map<string, UserRole> = new Map();
  private validator: PermissionValidator;

  constructor(validator: PermissionValidator) {
    super();
    this.validator = validator;
    this.initializeDefaultRoles();
  }

  private initializeDefaultRoles(): void {
    const defaultRoles: Role[] = [
      {
        name: "viewer",
        description: "Read-only access to most resources",
        permissions: {
          allowedTools: ["*:read", "*:get", "*:list", "*:search"],
          deniedTools: ["*:write", "*:delete", "*:create", "*:update"],
          readOnlyMode: true,
          maxTokens: 50000,
        },
        priority: 10,
      },
      {
        name: "developer",
        description: "Standard development permissions",
        permissions: {
          allowedTools: ["filesystem:*", "git:*", "serena:*"],
          deniedTools: ["git:push", "*:delete"],
          sandboxPaths: ["./src", "./tests", "./docs"],
          maxTokens: 200000,
        },
        priority: 50,
      },
      {
        name: "reviewer",
        description: "Code review and analysis permissions",
        permissions: {
          allowedTools: [
            "filesystem:read",
            "git:diff",
            "git:log",
            "serena:search",
          ],
          deniedTools: ["*:write", "*:delete"],
          sandboxPaths: ["./src", "./tests"],
          readOnlyMode: true,
          maxTokens: 100000,
        },
        priority: 30,
      },
      {
        name: "admin",
        description: "Full system access",
        permissions: {
          allowedTools: ["*"],
          deniedTools: [],
          maxTokens: 1000000,
        },
        priority: 100,
      },
    ];

    defaultRoles.forEach((role) => {
      this.roles.set(role.name, role);
    });

    this.emit("roles:initialized", {
      count: defaultRoles.length,
      roles: defaultRoles.map((r) => r.name),
    });
  }

  public createRole(role: Role): void {
    this.roles.set(role.name, role);
    this.emit("role:created", { name: role.name });
  }

  public updateRole(name: string, updates: Partial<Role>): void {
    const existing = this.roles.get(name);
    if (!existing) {
      throw new Error(`Role '${name}' not found`);
    }

    const updated = { ...existing, ...updates };
    this.roles.set(name, updated);

    this.recomputeUserPermissions(name);
    this.emit("role:updated", { name });
  }

  public deleteRole(name: string): void {
    if (!this.roles.has(name)) {
      throw new Error(`Role '${name}' not found`);
    }

    const protectedRoles = ["admin", "viewer"];
    if (protectedRoles.includes(name)) {
      throw new Error(`Cannot delete protected role '${name}'`);
    }

    this.roles.delete(name);

    for (const [userId, userRole] of this.userRoles) {
      if (userRole.roles.includes(name)) {
        userRole.roles = userRole.roles.filter((r) => r !== name);
        this.recomputeUserPermissions(userId);
      }
    }

    this.emit("role:deleted", { name });
  }

  public assignRole(userId: string, roleName: string, expiresAt?: Date): void {
    if (!this.roles.has(roleName)) {
      throw new Error(`Role '${roleName}' not found`);
    }

    let userRole = this.userRoles.get(userId);
    if (!userRole) {
      userRole = { userId, roles: [] };
      this.userRoles.set(userId, userRole);
    }

    if (!userRole.roles.includes(roleName)) {
      userRole.roles.push(roleName);
    }

    if (expiresAt) {
      userRole.expiresAt = expiresAt;
    }

    if (!expiresAt || new Date() <= expiresAt) {
      this.recomputeUserPermissions(userId);
    }
    this.emit("role:assigned", { userId, role: roleName, expiresAt });
  }

  public revokeRole(userId: string, roleName: string): void {
    const userRole = this.userRoles.get(userId);
    if (!userRole) {
      return;
    }

    userRole.roles = userRole.roles.filter((r) => r !== roleName);

    if (userRole.roles.length === 0 && !userRole.customPermissions) {
      this.userRoles.delete(userId);
    } else {
      this.recomputeUserPermissions(userId);
    }

    this.emit("role:revoked", { userId, role: roleName });
  }

  public setCustomPermissions(
    userId: string,
    _permissions: PermissionConfig,
  ): void {
    let userRole = this.userRoles.get(userId);
    if (!userRole) {
      userRole = { userId, roles: [] };
      this.userRoles.set(userId, userRole);
    }

    userRole.customPermissions = _permissions;
    this.recomputeUserPermissions(userId);
    this.emit("permissions:customized", { userId });
  }

  public getUserPermissions(userId: string): PermissionConfig {
    const userRole = this.userRoles.get(userId);
    if (!userRole) {
      return this.getDefaultPermissions();
    }

    if (userRole.expiresAt && new Date() > userRole.expiresAt) {
      this.cleanupExpiredRole(userId);
      return this.getDefaultPermissions();
    }

    const rolePermissions = this.computeRolePermissions(userRole.roles);

    if (userRole.customPermissions) {
      return this.inheritPermissions(
        rolePermissions,
        userRole.customPermissions,
      );
    }

    return rolePermissions;
  }

  private getDefaultPermissions(): PermissionConfig {
    return {
      allowedTools: ["*:read", "*:get", "*:list", "*:search"],
      deniedTools: ["*:write", "*:delete", "*:create", "*:update"],
      readOnlyMode: true,
      maxTokens: 50000,
    };
  }

  private computeRolePermissions(roleNames: string[]): PermissionConfig {
    if (roleNames.length === 0) {
      return this.getDefaultPermissions();
    }

    const roles = roleNames
      .map((name) => this.roles.get(name))
      .filter((role): role is Role => !!role)
      .sort((a, b) => a.priority - b.priority);

    let basePermissions = this.getDefaultPermissions();

    for (const role of roles) {
      if (role.inherits && role.inherits.length > 0) {
        const inheritedPermissions = this.computeRolePermissions(role.inherits);
        basePermissions = this.inheritPermissions(
          basePermissions,
          inheritedPermissions,
        );
      }

      basePermissions = this.inheritPermissions(
        basePermissions,
        role.permissions,
      );
    }

    return basePermissions;
  }

  private inheritPermissions(
    base: PermissionConfig,
    override: PermissionConfig,
  ): PermissionConfig {
    return {
      ...base,
      ...override,
      allowedTools: [
        ...(base.allowedTools || []),
        ...(override.allowedTools || []),
      ],
      deniedTools: [
        ...(base.deniedTools || []),
        ...(override.deniedTools || []),
      ],
      sandboxPaths: [
        ...(base.sandboxPaths || []),
        ...(override.sandboxPaths || []),
      ],
    };
  }

  private recomputeUserPermissions(userId: string): void {
    const permissions = this.getUserPermissions(userId);
    this.validator.setProfilePermissions(`user:${userId}`, permissions);
  }

  private cleanupExpiredRole(userId: string): void {
    this.userRoles.delete(userId);
    this.emit("role:expired", { userId });
  }

  public getUserRoles(userId: string): string[] {
    const userRole = this.userRoles.get(userId);
    return userRole ? userRole.roles : [];
  }

  public listRoles(): Role[] {
    return Array.from(this.roles.values()).sort(
      (a, b) => a.priority - b.priority,
    );
  }

  public getRole(name: string): Role | undefined {
    return this.roles.get(name);
  }

  public checkPermission(
    userId: string,
    toolName: string,
    methodName?: string,
  ): boolean {
    const result = this.validator.validateToolAccess({
      userId,
      profileName: `user:${userId}`,
      toolName,
      methodName,
    });

    return result.allowed;
  }

  public getUserStats(): Record<string, unknown> {
    const now = new Date();
    const users = Array.from(this.userRoles.values());

    return {
      totalUsers: users.length,
      activeUsers: users.filter((u) => !u.expiresAt || u.expiresAt > now)
        .length,
      expiredUsers: users.filter((u) => u.expiresAt && u.expiresAt <= now)
        .length,
      usersWithCustomPermissions: users.filter((u) => u.customPermissions)
        .length,
      roleDistribution: this.getRoleDistribution(),
    };
  }

  private getRoleDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const role of this.roles.keys()) {
      distribution[role] = 0;
    }

    for (const userRole of this.userRoles.values()) {
      for (const role of userRole.roles) {
        if (distribution[role] !== undefined) {
          distribution[role]++;
        }
      }
    }

    return distribution;
  }

  public cleanupExpiredRoles(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [userId, userRole] of this.userRoles) {
      if (userRole.expiresAt && userRole.expiresAt <= now) {
        this.cleanupExpiredRole(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.emit("cleanup:expired", { count: cleaned });
    }

    return cleaned;
  }
}
