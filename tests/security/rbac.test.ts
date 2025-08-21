import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RBACManager, Role, User, Permission } from '../../src/security/rbac.js';

describe('RBAC Manager', () => {
  let rbac: RBACManager;
  
  beforeEach(() => {
    rbac = new RBACManager();
  });

  describe('Role Management', () => {
    it('should have default roles initialized', () => {
      const roles = rbac.listRoles();
      expect(roles).toHaveLength(3);
      
      const roleNames = roles.map(r => r.name);
      expect(roleNames).toContain('read-only');
      expect(roleNames).toContain('developer');
      expect(roleNames).toContain('admin');
    });

    it('should add new roles', () => {
      const customRole: Role = {
        name: 'custom-role',
        permissions: [
          { resource: 'tools', action: 'execute' }
        ],
        quotas: {
          maxRequestsPerMinute: 30
        }
      };

      rbac.addRole(customRole);
      const retrieved = rbac.getRole('custom-role');
      
      expect(retrieved).toEqual(customRole);
    });

    it('should remove roles', () => {
      const removed = rbac.removeRole('read-only');
      expect(removed).toBe(true);
      
      const retrieved = rbac.getRole('read-only');
      expect(retrieved).toBeUndefined();
    });

    it('should emit events when roles are modified', () => {
      const addedSpy = vi.fn();
      const removedSpy = vi.fn();
      
      rbac.on('roleAdded', addedSpy);
      rbac.on('roleRemoved', removedSpy);

      const role: Role = { name: 'test', permissions: [] };
      rbac.addRole(role);
      rbac.removeRole('test');

      expect(addedSpy).toHaveBeenCalledWith(role);
      expect(removedSpy).toHaveBeenCalledWith('test');
    });
  });

  describe('User Management', () => {
    it('should add users', () => {
      const user: User = {
        id: 'user1',
        roles: ['developer'],
        profile: 'default'
      };

      rbac.addUser(user);
      const retrieved = rbac.getUser('user1');
      
      expect(retrieved).toEqual(user);
    });

    it('should remove users', () => {
      const user: User = { id: 'user1', roles: ['read-only'] };
      rbac.addUser(user);
      
      const removed = rbac.removeUser('user1');
      expect(removed).toBe(true);
      
      const retrieved = rbac.getUser('user1');
      expect(retrieved).toBeUndefined();
    });

    it('should update user roles', () => {
      const user: User = { id: 'user1', roles: ['read-only'] };
      rbac.addUser(user);
      
      const updated = rbac.updateUserRoles('user1', ['developer', 'admin']);
      expect(updated).toBe(true);
      
      const retrieved = rbac.getUser('user1');
      expect(retrieved?.roles).toEqual(['developer', 'admin']);
    });

    it('should emit events when users are modified', () => {
      const addedSpy = vi.fn();
      const removedSpy = vi.fn();
      const rolesUpdatedSpy = vi.fn();
      
      rbac.on('userAdded', addedSpy);
      rbac.on('userRemoved', removedSpy);
      rbac.on('userRolesUpdated', rolesUpdatedSpy);

      const user: User = { id: 'user1', roles: ['read-only'] };
      rbac.addUser(user);
      rbac.updateUserRoles('user1', ['developer']);
      rbac.removeUser('user1');

      expect(addedSpy).toHaveBeenCalledWith(user);
      expect(rolesUpdatedSpy).toHaveBeenCalledWith('user1', ['developer']);
      expect(removedSpy).toHaveBeenCalledWith('user1');
    });
  });

  describe('Permission Checking', () => {
    beforeEach(() => {
      const user: User = { id: 'testuser', roles: ['developer'] };
      rbac.addUser(user);
    });

    it('should grant permissions for allowed actions', () => {
      expect(rbac.hasPermission('testuser', 'resources', 'read')).toBe(true);
      expect(rbac.hasPermission('testuser', 'tools', 'execute')).toBe(true);
    });

    it('should deny permissions for disallowed actions', () => {
      expect(rbac.hasPermission('testuser', 'profiles', 'delete')).toBe(false);
      expect(rbac.hasPermission('testuser', 'admin', 'configure')).toBe(false);
    });

    it('should handle wildcard permissions', () => {
      const adminUser: User = { id: 'admin', roles: ['admin'] };
      rbac.addUser(adminUser);

      expect(rbac.hasPermission('admin', 'anything', 'anything')).toBe(true);
      expect(rbac.hasPermission('admin', 'profiles', 'delete')).toBe(true);
    });

    it('should return false for non-existent users', () => {
      expect(rbac.hasPermission('nonexistent', 'resources', 'read')).toBe(false);
    });

    it('should handle multiple roles', () => {
      const multiRoleUser: User = { id: 'multi', roles: ['read-only', 'developer'] };
      rbac.addUser(multiRoleUser);

      expect(rbac.hasPermission('multi', 'resources', 'read')).toBe(true);
      expect(rbac.hasPermission('multi', 'tools', 'execute')).toBe(true);
    });
  });

  describe('Quota Management', () => {
    beforeEach(() => {
      const user: User = { 
        id: 'testuser', 
        roles: ['read-only'],
        quotas: {
          maxRequestsPerMinute: 2,
          maxConcurrentRequests: 1
        }
      };
      rbac.addUser(user);
    });

    it('should allow operations within quota', () => {
      expect(rbac.checkQuota('testuser', 'request')).toBe(true);
      rbac.recordUsage('testuser', 'request_start');
      
      // End the first request to free up concurrent slot
      rbac.recordUsage('testuser', 'request_end');
      
      expect(rbac.checkQuota('testuser', 'request')).toBe(true);
      rbac.recordUsage('testuser', 'request_start');
    });

    it('should deny operations exceeding quota', () => {
      // Exhaust per-minute quota
      rbac.recordUsage('testuser', 'request_start');
      rbac.recordUsage('testuser', 'request_start');
      
      expect(rbac.checkQuota('testuser', 'request')).toBe(false);
    });

    it('should handle concurrent request limits', () => {
      rbac.recordUsage('testuser', 'request_start');
      expect(rbac.checkQuota('testuser', 'request')).toBe(false);
      
      rbac.recordUsage('testuser', 'request_end');
      expect(rbac.checkQuota('testuser', 'request')).toBe(true);
    });

    it('should emit quota exceeded events', () => {
      const quotaExceededSpy = vi.fn();
      rbac.on('quotaExceeded', quotaExceededSpy);

      rbac.recordUsage('testuser', 'request_start');
      rbac.recordUsage('testuser', 'request_start');
      rbac.checkQuota('testuser', 'request');

      expect(quotaExceededSpy).toHaveBeenCalledWith('testuser', 'requestsPerMinute');
    });

    it('should combine quotas from multiple roles', () => {
      const user: User = { 
        id: 'multi', 
        roles: ['read-only', 'developer'] // developer has higher quotas
      };
      rbac.addUser(user);

      const quotas = rbac.getUserQuotas('multi');
      expect(quotas.maxRequestsPerMinute).toBe(120); // developer quota is higher
    });

    it('should prioritize user-specific quotas over role quotas', () => {
      const user: User = { 
        id: 'custom', 
        roles: ['developer'],
        quotas: {
          maxRequestsPerMinute: 500 // Override role quota
        }
      };
      rbac.addUser(user);

      const quotas = rbac.getUserQuotas('custom');
      expect(quotas.maxRequestsPerMinute).toBe(500);
    });
  });

  describe('Usage Statistics', () => {
    beforeEach(() => {
      const user: User = { id: 'testuser', roles: ['developer'] };
      rbac.addUser(user);
    });

    it('should track usage statistics', () => {
      rbac.recordUsage('testuser', 'request_start');
      rbac.recordUsage('testuser', 'tool_execution');
      rbac.recordUsage('testuser', 'resource_access');

      const stats = rbac.getUserUsageStats('testuser');
      expect(stats).toBeDefined();
      expect(stats!.requestsThisMinute).toBe(1);
      expect(stats!.toolExecutions).toBe(1);
      expect(stats!.resourceAccesses).toBe(1);
      expect(stats!.concurrentRequests).toBe(1);
    });

    it('should calculate quota utilization', () => {
      rbac.recordUsage('testuser', 'request_start');
      rbac.recordUsage('testuser', 'request_start');

      const utilization = rbac.getQuotaUtilization('testuser');
      expect(utilization.requestsPerMinute).toBeCloseTo(1.67, 1); // 2/120 * 100
    });

    it('should reset counters when time windows change', () => {
      rbac.recordUsage('testuser', 'request_start');
      
      const stats = rbac.getUserUsageStats('testuser')!;
      expect(stats.requestsThisMinute).toBe(1);

      // Simulate time passing by manually setting window start
      stats.windowStart.minute = Math.floor(Date.now() / 60000) - 2;
      
      expect(rbac.checkQuota('testuser', 'request')).toBe(true);
      
      const updatedStats = rbac.getUserUsageStats('testuser')!;
      expect(updatedStats.requestsThisMinute).toBe(0);
    });
  });

  describe('Configuration Export/Import', () => {
    it('should export configuration', () => {
      const customRole: Role = { name: 'custom', permissions: [] };
      const user: User = { id: 'user1', roles: ['custom'] };
      
      rbac.addRole(customRole);
      rbac.addUser(user);

      const config = rbac.exportConfiguration();
      
      expect(config).toHaveProperty('roles');
      expect(config).toHaveProperty('users');
      expect(config).toHaveProperty('timestamp');
      expect(config.roles).toBeInstanceOf(Array);
      expect(config.users).toBeInstanceOf(Array);
    });

    it('should import configuration', () => {
      const config = {
        roles: [['imported-role', { name: 'imported-role', permissions: [] }]],
        users: [['imported-user', { id: 'imported-user', roles: ['imported-role'] }]],
        timestamp: Date.now()
      };

      rbac.importConfiguration(config);

      expect(rbac.getRole('imported-role')).toBeDefined();
      expect(rbac.getUser('imported-user')).toBeDefined();
    });

    it('should emit configuration imported event', () => {
      const importedSpy = vi.fn();
      rbac.on('configurationImported', importedSpy);

      const config = { roles: [], users: [], timestamp: Date.now() };
      rbac.importConfiguration(config);

      expect(importedSpy).toHaveBeenCalledWith(config);
    });
  });

  describe('Edge Cases', () => {
    it('should handle users with no roles gracefully', () => {
      const user: User = { id: 'noroles', roles: [] };
      rbac.addUser(user);

      expect(rbac.hasPermission('noroles', 'resources', 'read')).toBe(false);
      expect(rbac.getUserQuotas('noroles')).toEqual({});
    });

    it('should handle roles with no permissions', () => {
      const emptyRole: Role = { name: 'empty', permissions: [] };
      rbac.addRole(emptyRole);
      
      const user: User = { id: 'empty-user', roles: ['empty'] };
      rbac.addUser(user);

      expect(rbac.hasPermission('empty-user', 'resources', 'read')).toBe(false);
    });

    it('should handle non-existent roles in user assignments', () => {
      const user: User = { id: 'baduser', roles: ['non-existent-role'] };
      rbac.addUser(user);

      expect(rbac.hasPermission('baduser', 'resources', 'read')).toBe(false);
    });

    it('should handle quota checking for users without quotas', () => {
      const role: Role = { name: 'no-quotas', permissions: [] };
      rbac.addRole(role);
      
      const user: User = { id: 'no-quota-user', roles: ['no-quotas'] };
      rbac.addUser(user);

      expect(rbac.checkQuota('no-quota-user', 'request')).toBe(true);
    });
  });
});