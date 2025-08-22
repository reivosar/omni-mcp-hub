import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RBACManager, Role, UserRole } from '../../src/security/rbac-manager';
import { PermissionValidator, PermissionConfig } from '../../src/security/permission-validator';

describe('RBACManager', () => {
  let rbacManager: RBACManager;
  let permissionValidator: PermissionValidator;

  beforeEach(() => {
    permissionValidator = new PermissionValidator();
    rbacManager = new RBACManager(permissionValidator);
  });

  describe('constructor', () => {
    it('should initialize with default roles', () => {
      const eventSpy = vi.fn();
      
      // Create a new permission validator and manager for this test
      const testValidator = new PermissionValidator();
      
      // Set up event listener before creating manager
      const testManager = new RBACManager(testValidator);
      testManager.on('roles:initialized', eventSpy);
      
      // Since the event is emitted during construction, we need to trigger it manually
      // or test the end result. Let's test that the initialization worked correctly:
      expect(testManager).toBeInstanceOf(RBACManager);
      expect(testManager.listRoles()).toHaveLength(4);
      expect(testManager.listRoles().map(r => r.name)).toEqual(['viewer', 'reviewer', 'developer', 'admin']);
      
      // The event should have been emitted during construction - let's verify by creating another instance
      // and checking if the same initialization happens
      const anotherValidator = new PermissionValidator();
      let eventCalled = false;
      const mockEmit = vi.fn((event, data) => {
        if (event === 'roles:initialized') {
          eventCalled = true;
          expect(data).toEqual({
            count: 4,
            roles: ['viewer', 'developer', 'reviewer', 'admin']
          });
        }
      });
      
      // Mock the emit method to capture the event
      const originalEmit = RBACManager.prototype.emit;
      RBACManager.prototype.emit = mockEmit;
      
      new RBACManager(anotherValidator);
      
      // Restore original emit
      RBACManager.prototype.emit = originalEmit;
      
      expect(eventCalled).toBe(true);
    });

    it('should have default roles configured', () => {
      const roles = rbacManager.listRoles();

      expect(roles).toHaveLength(4);
      expect(roles.map(r => r.name)).toContain('viewer');
      expect(roles.map(r => r.name)).toContain('developer');
      expect(roles.map(r => r.name)).toContain('reviewer');
      expect(roles.map(r => r.name)).toContain('admin');
    });
  });

  describe('role management', () => {
    const testRole: Role = {
      name: 'test-role',
      description: 'Test role for testing',
      permissions: {
        allowedTools: ['test-*'],
        maxTokens: 1000
      },
      priority: 25
    };

    it('should create a new role', () => {
      const eventSpy = vi.fn();
      rbacManager.on('role:created', eventSpy);

      rbacManager.createRole(testRole);

      const retrievedRole = rbacManager.getRole('test-role');
      expect(retrievedRole).toEqual(testRole);
      expect(eventSpy).toHaveBeenCalledWith({ name: 'test-role' });
    });

    it('should update an existing role', () => {
      const eventSpy = vi.fn();
      rbacManager.on('role:updated', eventSpy);

      rbacManager.createRole(testRole);

      const updates: Partial<Role> = {
        description: 'Updated description',
        permissions: {
          allowedTools: ['updated-*'],
          maxTokens: 2000
        }
      };

      rbacManager.updateRole('test-role', updates);

      const updatedRole = rbacManager.getRole('test-role');
      expect(updatedRole?.description).toBe('Updated description');
      expect(updatedRole?.permissions.maxTokens).toBe(2000);
      expect(eventSpy).toHaveBeenCalledWith({ name: 'test-role' });
    });

    it('should throw error when updating non-existent role', () => {
      expect(() => {
        rbacManager.updateRole('non-existent', {});
      }).toThrow('Role \'non-existent\' not found');
    });

    it('should delete a role', () => {
      const eventSpy = vi.fn();
      rbacManager.on('role:deleted', eventSpy);

      rbacManager.createRole(testRole);
      expect(rbacManager.getRole('test-role')).toBeDefined();

      rbacManager.deleteRole('test-role');

      expect(rbacManager.getRole('test-role')).toBeUndefined();
      expect(eventSpy).toHaveBeenCalledWith({ name: 'test-role' });
    });

    it('should throw error when deleting non-existent role', () => {
      expect(() => {
        rbacManager.deleteRole('non-existent');
      }).toThrow('Role \'non-existent\' not found');
    });

    it('should not allow deletion of protected roles', () => {
      expect(() => {
        rbacManager.deleteRole('admin');
      }).toThrow('Cannot delete protected role \'admin\'');

      expect(() => {
        rbacManager.deleteRole('viewer');
      }).toThrow('Cannot delete protected role \'viewer\'');
    });

    it('should remove deleted role from users', () => {
      rbacManager.createRole(testRole);
      rbacManager.assignRole('user1', 'test-role');
      
      expect(rbacManager.getUserRoles('user1')).toContain('test-role');

      rbacManager.deleteRole('test-role');

      expect(rbacManager.getUserRoles('user1')).not.toContain('test-role');
    });
  });

  describe('role assignment', () => {
    it('should assign role to user', () => {
      const eventSpy = vi.fn();
      rbacManager.on('role:assigned', eventSpy);

      rbacManager.assignRole('user1', 'developer');

      expect(rbacManager.getUserRoles('user1')).toContain('developer');
      expect(eventSpy).toHaveBeenCalledWith({
        userId: 'user1',
        role: 'developer',
        expiresAt: undefined
      });
    });

    it('should assign role with expiration', () => {
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now
      
      rbacManager.assignRole('user1', 'developer', expiresAt);

      expect(rbacManager.getUserRoles('user1')).toContain('developer');
    });

    it('should not duplicate roles for same user', () => {
      rbacManager.assignRole('user1', 'developer');
      rbacManager.assignRole('user1', 'developer');

      const roles = rbacManager.getUserRoles('user1');
      expect(roles.filter(r => r === 'developer')).toHaveLength(1);
    });

    it('should throw error when assigning non-existent role', () => {
      expect(() => {
        rbacManager.assignRole('user1', 'non-existent');
      }).toThrow('Role \'non-existent\' not found');
    });

    it('should revoke role from user', () => {
      const eventSpy = vi.fn();
      rbacManager.on('role:revoked', eventSpy);

      rbacManager.assignRole('user1', 'developer');
      rbacManager.assignRole('user1', 'reviewer');

      rbacManager.revokeRole('user1', 'developer');

      expect(rbacManager.getUserRoles('user1')).not.toContain('developer');
      expect(rbacManager.getUserRoles('user1')).toContain('reviewer');
      expect(eventSpy).toHaveBeenCalledWith({
        userId: 'user1',
        role: 'developer'
      });
    });

    it('should remove user completely when no roles left', () => {
      rbacManager.assignRole('user1', 'developer');
      rbacManager.revokeRole('user1', 'developer');

      expect(rbacManager.getUserRoles('user1')).toEqual([]);
    });

    it('should handle revoking role from non-existent user', () => {
      expect(() => {
        rbacManager.revokeRole('non-existent', 'developer');
      }).not.toThrow();
    });
  });

  describe('custom permissions', () => {
    it('should set custom permissions for user', () => {
      const eventSpy = vi.fn();
      rbacManager.on('permissions:customized', eventSpy);

      const customPermissions: PermissionConfig = {
        allowedTools: ['custom-*'],
        maxTokens: 5000
      };

      rbacManager.setCustomPermissions('user1', customPermissions);

      expect(eventSpy).toHaveBeenCalledWith({ userId: 'user1' });
    });

    it('should combine role and custom permissions', () => {
      rbacManager.assignRole('user1', 'viewer');
      
      const customPermissions: PermissionConfig = {
        allowedTools: ['custom-*']
      };

      rbacManager.setCustomPermissions('user1', customPermissions);

      const permissions = rbacManager.getUserPermissions('user1');
      
      expect(permissions.allowedTools).toContain('custom-*');
      expect(permissions.allowedTools).toContain('*:read');
    });
  });

  describe('permission computation', () => {
    it('should return default permissions for user without roles', () => {
      const permissions = rbacManager.getUserPermissions('user-without-roles');

      expect(permissions.readOnlyMode).toBe(true);
      expect(permissions.maxTokens).toBe(50000);
      expect(permissions.allowedTools).toContain('*:read');
      expect(permissions.deniedTools).toContain('*:write');
    });

    it('should compute permissions from single role', () => {
      rbacManager.assignRole('user1', 'developer');

      const permissions = rbacManager.getUserPermissions('user1');

      expect(permissions.allowedTools).toContain('filesystem:*');
      expect(permissions.deniedTools).toContain('git:push');
      expect(permissions.maxTokens).toBe(200000);
    });

    it('should combine permissions from multiple roles', () => {
      rbacManager.assignRole('user1', 'developer');
      rbacManager.assignRole('user1', 'reviewer');

      const permissions = rbacManager.getUserPermissions('user1');

      expect(permissions.allowedTools).toContain('filesystem:*');
      expect(permissions.allowedTools).toContain('git:diff');
      expect(permissions.deniedTools).toContain('git:push');
    });

    it('should handle role inheritance', () => {
      const parentRole: Role = {
        name: 'parent-role',
        permissions: {
          allowedTools: ['parent-*'],
          maxTokens: 1000
        },
        priority: 10
      };

      const childRole: Role = {
        name: 'child-role',
        permissions: {
          allowedTools: ['child-*'],
          maxTokens: 2000
        },
        inherits: ['parent-role'],
        priority: 20
      };

      rbacManager.createRole(parentRole);
      rbacManager.createRole(childRole);
      rbacManager.assignRole('user1', 'child-role');

      const permissions = rbacManager.getUserPermissions('user1');

      expect(permissions.allowedTools).toContain('parent-*');
      expect(permissions.allowedTools).toContain('child-*');
      expect(permissions.maxTokens).toBe(2000); // Child role overrides
    });

    it('should handle expired roles', () => {
      const eventSpy = vi.fn();
      rbacManager.on('role:expired', eventSpy);

      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      rbacManager.assignRole('user1', 'developer', pastDate);

      const permissions = rbacManager.getUserPermissions('user1');

      expect(permissions).toEqual(rbacManager.getUserPermissions('user-without-roles'));
      expect(eventSpy).toHaveBeenCalledWith({ userId: 'user1' });
    });
  });

  describe('permission checking', () => {
    it('should check tool permission for user', () => {
      rbacManager.assignRole('user1', 'developer');

      const hasPermission = rbacManager.checkPermission('user1', 'filesystem:read');
      expect(hasPermission).toBe(true);

      const noPermission = rbacManager.checkPermission('user1', 'git:push');
      expect(noPermission).toBe(false);
    });

    it('should check method permission for user', () => {
      rbacManager.assignRole('user1', 'reviewer');

      const hasPermission = rbacManager.checkPermission('user1', 'git:log', 'readHistory');
      expect(hasPermission).toBe(true);
    });
  });

  describe('role listing and statistics', () => {
    it('should list all roles sorted by priority', () => {
      const roles = rbacManager.listRoles();

      expect(roles).toHaveLength(4);
      expect(roles[0].name).toBe('viewer'); // priority 10
      expect(roles[1].name).toBe('reviewer'); // priority 30
      expect(roles[2].name).toBe('developer'); // priority 50
      expect(roles[3].name).toBe('admin'); // priority 100
    });

    it('should get user statistics', () => {
      rbacManager.assignRole('user1', 'developer');
      rbacManager.assignRole('user2', 'viewer');
      rbacManager.assignRole('user3', 'admin');

      const futureDate = new Date(Date.now() + 3600000);
      rbacManager.assignRole('user4', 'developer', futureDate);

      const pastDate = new Date(Date.now() - 3600000);
      rbacManager.assignRole('user5', 'reviewer', pastDate);

      rbacManager.setCustomPermissions('user1', { maxTokens: 10000 });

      const stats = rbacManager.getUserStats();

      expect(stats.totalUsers).toBe(5);
      expect(stats.activeUsers).toBe(4);
      expect(stats.expiredUsers).toBe(1);
      expect(stats.usersWithCustomPermissions).toBe(1);

      const distribution = stats.roleDistribution as Record<string, number>;
      expect(distribution.developer).toBe(2);
      expect(distribution.viewer).toBe(1);
      expect(distribution.admin).toBe(1);
      expect(distribution.reviewer).toBe(1);
    });

    it('should cleanup expired roles', () => {
      const eventSpy = vi.fn();
      rbacManager.on('cleanup:expired', eventSpy);

      const pastDate = new Date(Date.now() - 3600000);
      rbacManager.assignRole('user1', 'developer', pastDate);
      rbacManager.assignRole('user2', 'viewer', pastDate);
      rbacManager.assignRole('user3', 'admin'); // No expiration

      const cleaned = rbacManager.cleanupExpiredRoles();

      expect(cleaned).toBe(2);
      expect(rbacManager.getUserRoles('user1')).toEqual([]);
      expect(rbacManager.getUserRoles('user2')).toEqual([]);
      expect(rbacManager.getUserRoles('user3')).toContain('admin');
      expect(eventSpy).toHaveBeenCalledWith({ count: 2 });
    });

    it('should return 0 when no expired roles to cleanup', () => {
      const eventSpy = vi.fn();
      rbacManager.on('cleanup:expired', eventSpy);

      rbacManager.assignRole('user1', 'developer');

      const cleaned = rbacManager.cleanupExpiredRoles();

      expect(cleaned).toBe(0);
      expect(eventSpy).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty role list for user', () => {
      const permissions = rbacManager.getUserPermissions('empty-user');
      expect(permissions).toEqual(rbacManager.getUserPermissions('another-empty-user'));
    });

    it('should handle invalid role inheritance', () => {
      const invalidRole: Role = {
        name: 'invalid-role',
        permissions: {
          allowedTools: ['test-*']
        },
        inherits: ['non-existent-parent'],
        priority: 50
      };

      rbacManager.createRole(invalidRole);
      rbacManager.assignRole('user1', 'invalid-role');

      expect(() => {
        rbacManager.getUserPermissions('user1');
      }).not.toThrow();
    });

    it('should preserve custom permissions when user has no roles', () => {
      const customPermissions: PermissionConfig = {
        allowedTools: ['special-*'],
        maxTokens: 10000
      };

      rbacManager.setCustomPermissions('user1', customPermissions);
      rbacManager.revokeRole('user1', 'non-existent'); // Should not remove custom permissions

      const permissions = rbacManager.getUserPermissions('user1');
      expect(permissions.allowedTools).toContain('special-*');
    });

    it('should handle role priority conflicts', () => {
      const role1: Role = {
        name: 'role1',
        permissions: { maxTokens: 1000 },
        priority: 10
      };

      const role2: Role = {
        name: 'role2',
        permissions: { maxTokens: 2000 },
        priority: 10 // Same priority
      };

      rbacManager.createRole(role1);
      rbacManager.createRole(role2);
      rbacManager.assignRole('user1', 'role1');
      rbacManager.assignRole('user1', 'role2');

      expect(() => {
        rbacManager.getUserPermissions('user1');
      }).not.toThrow();
    });
  });
});