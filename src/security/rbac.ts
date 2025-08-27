import { EventEmitter } from "events";

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, unknown>;
}

export interface Role {
  name: string;
  permissions: Permission[];
  quotas?: ResourceQuotas;
}

export interface ResourceQuotas {
  maxRequestsPerMinute?: number;
  maxRequestsPerHour?: number;
  maxRequestsPerDay?: number;
  maxConcurrentRequests?: number;
  maxResourceAccess?: number;
  maxToolExecutions?: number;
}

export interface User {
  id: string;
  roles: string[];
  profile?: string;
  quotas?: ResourceQuotas;
}

export interface UsageStats {
  requestsThisMinute: number;
  requestsThisHour: number;
  requestsThisDay: number;
  concurrentRequests: number;
  resourceAccesses: number;
  toolExecutions: number;
  lastRequestTime: number;
  windowStart: {
    minute: number;
    hour: number;
    day: number;
  };
}

export class RBACManager extends EventEmitter {
  private roles: Map<string, Role> = new Map();
  private users: Map<string, User> = new Map();
  private usageStats: Map<string, UsageStats> = new Map();

  private defaultRoles: Role[] = [
    {
      name: "read-only",
      permissions: [
        { resource: "resources", action: "read" },
        { resource: "profiles", action: "read" },
      ],
      quotas: {
        maxRequestsPerMinute: 60,
        maxRequestsPerHour: 1000,
        maxRequestsPerDay: 10000,
        maxConcurrentRequests: 5,
      },
    },
    {
      name: "developer",
      permissions: [
        { resource: "resources", action: "read" },
        { resource: "tools", action: "execute" },
        { resource: "profiles", action: "read" },
        { resource: "profiles", action: "switch" },
      ],
      quotas: {
        maxRequestsPerMinute: 120,
        maxRequestsPerHour: 5000,
        maxRequestsPerDay: 50000,
        maxConcurrentRequests: 10,
        maxToolExecutions: 1000,
      },
    },
    {
      name: "admin",
      permissions: [{ resource: "*", action: "*" }],
      quotas: {
        maxRequestsPerMinute: 300,
        maxRequestsPerHour: 10000,
        maxRequestsPerDay: 100000,
        maxConcurrentRequests: 20,
        maxResourceAccess: 10000,
        maxToolExecutions: 5000,
      },
    },
  ];

  constructor() {
    super();
    this.initializeDefaultRoles();

    setInterval(() => this.cleanupExpiredStats(), 60 * 1000);
  }

  private initializeDefaultRoles(): void {
    this.defaultRoles.forEach((role) => {
      this.roles.set(role.name, role);
    });
  }

  public addRole(role: Role): void {
    this.roles.set(role.name, role);
    this.emit("roleAdded", role);
  }

  public removeRole(roleName: string): boolean {
    const removed = this.roles.delete(roleName);
    if (removed) {
      this.emit("roleRemoved", roleName);
    }
    return removed;
  }

  public getRole(roleName: string): Role | undefined {
    return this.roles.get(roleName);
  }

  public listRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  public addUser(user: User): void {
    this.users.set(user.id, user);
    this.initializeUserStats(user.id);
    this.emit("userAdded", user);
  }

  public removeUser(userId: string): boolean {
    const removed = this.users.delete(userId);
    this.usageStats.delete(userId);
    if (removed) {
      this.emit("userRemoved", userId);
    }
    return removed;
  }

  public getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  public updateUserRoles(userId: string, roles: string[]): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.roles = roles;
    this.emit("userRolesUpdated", userId, roles);
    return true;
  }

  public hasPermission(
    userId: string,
    resource: string,
    action: string,
  ): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    return user.roles.some((roleName) => {
      const role = this.roles.get(roleName);
      if (!role) return false;

      return role.permissions.some((permission) => {
        if (permission.resource === "*" && permission.action === "*") {
          return true;
        }
        if (permission.resource === "*" && permission.action === action) {
          return true;
        }
        if (permission.resource === resource && permission.action === "*") {
          return true;
        }

        return permission.resource === resource && permission.action === action;
      });
    });
  }

  public checkQuota(userId: string, operation: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    const stats = this.getOrCreateUserStats(userId);
    const quotas = this.getUserQuotas(userId);

    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    const currentHour = Math.floor(now / 3600000);
    const currentDay = Math.floor(now / 86400000);

    if (stats.windowStart.minute !== currentMinute) {
      stats.requestsThisMinute = 0;
      stats.windowStart.minute = currentMinute;
    }
    if (stats.windowStart.hour !== currentHour) {
      stats.requestsThisHour = 0;
      stats.windowStart.hour = currentHour;
    }
    if (stats.windowStart.day !== currentDay) {
      stats.requestsThisDay = 0;
      stats.windowStart.day = currentDay;
    }

    if (operation === "request") {
      if (
        quotas.maxRequestsPerMinute &&
        stats.requestsThisMinute >= quotas.maxRequestsPerMinute
      ) {
        this.emit("quotaExceeded", userId, "requestsPerMinute");
        return false;
      }
      if (
        quotas.maxRequestsPerHour &&
        stats.requestsThisHour >= quotas.maxRequestsPerHour
      ) {
        this.emit("quotaExceeded", userId, "requestsPerHour");
        return false;
      }
      if (
        quotas.maxRequestsPerDay &&
        stats.requestsThisDay >= quotas.maxRequestsPerDay
      ) {
        this.emit("quotaExceeded", userId, "requestsPerDay");
        return false;
      }
      if (
        quotas.maxConcurrentRequests &&
        stats.concurrentRequests >= quotas.maxConcurrentRequests
      ) {
        this.emit("quotaExceeded", userId, "concurrentRequests");
        return false;
      }
    } else if (operation === "tool_execution") {
      if (
        quotas.maxToolExecutions &&
        stats.toolExecutions >= quotas.maxToolExecutions
      ) {
        this.emit("quotaExceeded", userId, "toolExecutions");
        return false;
      }
    } else if (operation === "resource_access") {
      if (
        quotas.maxResourceAccess &&
        stats.resourceAccesses >= quotas.maxResourceAccess
      ) {
        this.emit("quotaExceeded", userId, "resourceAccess");
        return false;
      }
    }

    return true;
  }

  public recordUsage(userId: string, operation: string): void {
    const stats = this.getOrCreateUserStats(userId);

    switch (operation) {
      case "request_start":
        stats.requestsThisMinute++;
        stats.requestsThisHour++;
        stats.requestsThisDay++;
        stats.concurrentRequests++;
        stats.lastRequestTime = Date.now();
        break;
      case "request_end":
        stats.concurrentRequests = Math.max(0, stats.concurrentRequests - 1);
        break;
      case "tool_execution":
        stats.toolExecutions++;
        break;
      case "resource_access":
        stats.resourceAccesses++;
        break;
    }

    this.emit("usageRecorded", userId, operation, stats);
  }

  public getUserQuotas(userId: string): ResourceQuotas {
    const user = this.users.get(userId);
    if (!user) return {};

    if (user.quotas) {
      return { ...this.getRoleQuotas(user.roles), ...user.quotas };
    }

    return this.getRoleQuotas(user.roles);
  }

  private getRoleQuotas(roleNames: string[]): ResourceQuotas {
    const combinedQuotas: ResourceQuotas = {};

    roleNames.forEach((roleName) => {
      const role = this.roles.get(roleName);
      if (role?.quotas) {
        Object.entries(role.quotas).forEach(([key, value]) => {
          if (value !== undefined) {
            const quotaKey = key as keyof ResourceQuotas;
            const currentValue = combinedQuotas[quotaKey] as number;
            combinedQuotas[quotaKey] = Math.max(
              currentValue || 0,
              value,
            ) as never;
          }
        });
      }
    });

    return combinedQuotas;
  }

  private initializeUserStats(userId: string): void {
    const now = Date.now();
    this.usageStats.set(userId, {
      requestsThisMinute: 0,
      requestsThisHour: 0,
      requestsThisDay: 0,
      concurrentRequests: 0,
      resourceAccesses: 0,
      toolExecutions: 0,
      lastRequestTime: now,
      windowStart: {
        minute: Math.floor(now / 60000),
        hour: Math.floor(now / 3600000),
        day: Math.floor(now / 86400000),
      },
    });
  }

  private getOrCreateUserStats(userId: string): UsageStats {
    let stats = this.usageStats.get(userId);
    if (!stats) {
      this.initializeUserStats(userId);
      stats = this.usageStats.get(userId)!;
    }
    return stats;
  }

  private cleanupExpiredStats(): void {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [userId, stats] of this.usageStats.entries()) {
      if (now - stats.lastRequestTime > oneHour) {
        this.usageStats.delete(userId);
        this.emit("statsExpired", userId);
      }
    }
  }

  public getUserUsageStats(userId: string): UsageStats | undefined {
    return this.usageStats.get(userId);
  }

  public getAllUsageStats(): Map<string, UsageStats> {
    return new Map(this.usageStats);
  }

  public getQuotaUtilization(userId: string): Record<string, number> {
    const stats = this.usageStats.get(userId);
    const quotas = this.getUserQuotas(userId);

    if (!stats || !quotas) return {};

    const utilization: Record<string, number> = {};

    if (quotas.maxRequestsPerMinute) {
      utilization.requestsPerMinute =
        (stats.requestsThisMinute / quotas.maxRequestsPerMinute) * 100;
    }
    if (quotas.maxRequestsPerHour) {
      utilization.requestsPerHour =
        (stats.requestsThisHour / quotas.maxRequestsPerHour) * 100;
    }
    if (quotas.maxRequestsPerDay) {
      utilization.requestsPerDay =
        (stats.requestsThisDay / quotas.maxRequestsPerDay) * 100;
    }
    if (quotas.maxConcurrentRequests) {
      utilization.concurrentRequests =
        (stats.concurrentRequests / quotas.maxConcurrentRequests) * 100;
    }
    if (quotas.maxResourceAccess) {
      utilization.resourceAccess =
        (stats.resourceAccesses / quotas.maxResourceAccess) * 100;
    }
    if (quotas.maxToolExecutions) {
      utilization.toolExecutions =
        (stats.toolExecutions / quotas.maxToolExecutions) * 100;
    }

    return utilization;
  }

  public exportConfiguration(): {
    roles: [string, Role][];
    users: [string, User][];
    timestamp: number;
  } {
    return {
      roles: Array.from(this.roles.entries()),
      users: Array.from(this.users.entries()),
      timestamp: Date.now(),
    };
  }

  public importConfiguration(config: {
    roles?: [string, Role][];
    users?: [string, User][];
    timestamp?: number;
  }): void {
    if (config.roles) {
      this.roles = new Map(config.roles);
    }
    if (config.users) {
      this.users = new Map(config.users);
      this.users.forEach((_, userId) => {
        this.initializeUserStats(userId);
      });
    }
    this.emit("configurationImported", config);
  }
}
