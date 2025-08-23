import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionValidator, PermissionConfig, ValidationContext } from '../../src/security/permission-validator';

describe('PermissionValidator', () => {
  let validator: PermissionValidator;

  beforeEach(() => {
    validator = new PermissionValidator();
  });

  describe('constructor', () => {
    it('should create validator with default config', () => {
      expect(validator).toBeInstanceOf(PermissionValidator);
      expect(validator.listProfiles()).toEqual([]);
    });

    it('should create validator with custom default config', () => {
      const customDefault: PermissionConfig = {
        maxTokens: 50000,
        readOnlyMode: true
      };

      const customValidator = new PermissionValidator(customDefault);
      expect(customValidator).toBeInstanceOf(PermissionValidator);
    });
  });

  describe('setProfilePermissions', () => {
    it('should set permissions for a profile', () => {
      const eventSpy = vi.fn();
      validator.on('permissions:updated', eventSpy);

      const config: PermissionConfig = {
        allowedTools: ['read', 'write'],
        maxTokens: 5000
      };

      validator.setProfilePermissions('test-profile', config);

      expect(validator.listProfiles()).toContain('test-profile');
      expect(eventSpy).toHaveBeenCalledWith({
        profile: 'test-profile',
        config
      });
    });

    it('should merge with default config', () => {
      const config: PermissionConfig = {
        allowedTools: ['read']
      };

      validator.setProfilePermissions('test-profile', config);
      
      const stats = validator.getProfileStats('test-profile');
      expect(stats).toEqual({
        allowedToolsCount: 1,
        deniedToolsCount: 2,
        sandboxPathsCount: 0,
        readOnlyMode: false,
        maxTokens: 100000,
        timeout: 300
      });
    });
  });

  describe('validateToolAccess', () => {
    const baseContext: ValidationContext = {
      userId: 'user123',
      profileName: 'test-profile',
      toolName: 'read-tool'
    };

    beforeEach(() => {
      validator.setProfilePermissions('test-profile', {
        allowedTools: ['read-*', 'list-*', 'delete-*'], // Allow delete tools in allowedTools
        deniedTools: ['delete-*'], // But explicitly deny them 
        maxTokens: 1000
      });
    });

    it('should allow access for permitted tools', () => {
      const result = validator.validateToolAccess(baseContext);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should deny access for non-permitted tools', () => {
      const context: ValidationContext = {
        ...baseContext,
        toolName: 'write-tool'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('is not permitted');
    });

    it('should deny access for explicitly denied tools', () => {
      const context: ValidationContext = {
        ...baseContext,
        toolName: 'delete-file'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('is explicitly denied');
    });

    it('should emit access:granted event for allowed access', () => {
      const eventSpy = vi.fn();
      validator.on('access:granted', eventSpy);

      validator.validateToolAccess(baseContext);

      expect(eventSpy).toHaveBeenCalledWith({
        timestamp: expect.any(Date),
        userId: 'user123',
        profile: 'test-profile',
        tool: 'read-tool',
        method: undefined,
        path: undefined
      });
    });

    it('should emit access:denied event for denied access', () => {
      const eventSpy = vi.fn();
      validator.on('access:denied', eventSpy);

      const context: ValidationContext = {
        ...baseContext,
        toolName: 'write-tool'
      };

      validator.validateToolAccess(context);

      expect(eventSpy).toHaveBeenCalledWith({
        timestamp: expect.any(Date),
        userId: 'user123',
        profile: 'test-profile',
        tool: 'write-tool',
        method: undefined,
        path: undefined,
        reason: 'tool-denied'
      });
    });

    it('should add warning for token limit exceeded', () => {
      const context: ValidationContext = {
        ...baseContext,
        estimatedTokens: 2000
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(true);
      expect(result.warnings).toContain('Estimated tokens (2000) exceeds limit (1000)');
    });
  });

  describe('read-only mode validation', () => {
    beforeEach(() => {
      validator.setProfilePermissions('readonly-profile', {
        readOnlyMode: true
      });
    });

    const readOnlyContext: ValidationContext = {
      profileName: 'readonly-profile',
      toolName: 'test-tool'
    };

    it('should deny write operations in read-only mode', () => {
      const writeOperations = ['write', 'delete', 'create', 'update', 'modify', 'remove'];

      writeOperations.forEach(operation => {
        const context: ValidationContext = {
          ...readOnlyContext,
          toolName: `${operation}-tool`
        };

        const result = validator.validateToolAccess(context);

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Profile is in read-only mode');
      });
    });

    it('should deny write methods in read-only mode', () => {
      const context: ValidationContext = {
        ...readOnlyContext,
        methodName: 'writeFile'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Profile is in read-only mode');
    });

    it('should allow read operations in read-only mode', () => {
      const context: ValidationContext = {
        ...readOnlyContext,
        toolName: 'read-tool'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(true);
    });
  });

  describe('method validation', () => {
    beforeEach(() => {
      validator.setProfilePermissions('method-profile', {
        allowedMethods: ['read*', 'get*']
      });
    });

    it('should allow permitted methods', () => {
      const context: ValidationContext = {
        profileName: 'method-profile',
        toolName: 'test-tool',
        methodName: 'readFile'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(true);
    });

    it('should deny non-permitted methods', () => {
      const context: ValidationContext = {
        profileName: 'method-profile',
        toolName: 'test-tool',
        methodName: 'writeFile'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Method \'writeFile\' is not permitted');
    });
  });

  describe('path validation', () => {
    beforeEach(() => {
      validator.setProfilePermissions('sandbox-profile', {
        sandboxPaths: ['/allowed/path', '/another/allowed']
      });
    });

    it('should allow access to files within sandbox', () => {
      const context: ValidationContext = {
        profileName: 'sandbox-profile',
        toolName: 'test-tool',
        filePath: '/allowed/path/file.txt'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(true);
    });

    it('should deny access to files outside sandbox', () => {
      const context: ValidationContext = {
        profileName: 'sandbox-profile',
        toolName: 'test-tool',
        filePath: '/forbidden/path/file.txt'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('is outside allowed sandbox');
    });
  });

  describe('pattern matching', () => {
    beforeEach(() => {
      validator.setProfilePermissions('pattern-profile', {
        allowedTools: ['read-*', 'tool?', 'exact-match'],
        deniedTools: ['danger-*']
      });
    });

    it('should match wildcard patterns', () => {
      const contexts = [
        { toolName: 'read-file', expected: true },
        { toolName: 'read-database', expected: true },
        { toolName: 'write-file', expected: false }
      ];

      contexts.forEach(({ toolName, expected }) => {
        const context: ValidationContext = {
          profileName: 'pattern-profile',
          toolName
        };

        const result = validator.validateToolAccess(context);
        expect(result.allowed).toBe(expected);
      });
    });

    it('should match single character patterns', () => {
      // Create a new profile without conflicting deny rules
      validator.setProfilePermissions('simple-pattern-profile', {
        allowedTools: ['tool?']
      });

      const contexts = [
        { toolName: 'tool1', expected: true }, // matches tool? pattern
        { toolName: 'tool2', expected: true }, // matches tool? pattern  
        { toolName: 'tools', expected: false } // doesn't match tool? (too long)
      ];

      contexts.forEach(({ toolName, expected }) => {
        const context: ValidationContext = {
          profileName: 'simple-pattern-profile',
          toolName
        };

        const result = validator.validateToolAccess(context);
        expect(result.allowed).toBe(expected);
      });
    });

    it('should match exact patterns', () => {
      const context: ValidationContext = {
        profileName: 'pattern-profile',
        toolName: 'exact-match'
      };

      const result = validator.validateToolAccess(context);
      expect(result.allowed).toBe(true);
    });

    it('should handle denied patterns', () => {
      const context: ValidationContext = {
        profileName: 'pattern-profile',
        toolName: 'danger-operation'
      };

      const result = validator.validateToolAccess(context);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('is explicitly denied');
    });
  });

  describe('profile management', () => {
    it('should remove profile', () => {
      const eventSpy = vi.fn();
      validator.on('permissions:removed', eventSpy);

      validator.setProfilePermissions('temp-profile', {});
      expect(validator.listProfiles()).toContain('temp-profile');

      validator.removeProfile('temp-profile');

      expect(validator.listProfiles()).not.toContain('temp-profile');
      expect(eventSpy).toHaveBeenCalledWith({ profile: 'temp-profile' });
    });

    it('should list all profiles', () => {
      validator.setProfilePermissions('profile1', {});
      validator.setProfilePermissions('profile2', {});
      validator.setProfilePermissions('profile3', {});

      const profiles = validator.listProfiles();

      expect(profiles).toContain('profile1');
      expect(profiles).toContain('profile2');
      expect(profiles).toContain('profile3');
      expect(profiles).toHaveLength(3);
    });

    it('should get profile stats', () => {
      const config: PermissionConfig = {
        allowedTools: ['tool1', 'tool2'],
        deniedTools: ['bad-tool'],
        sandboxPaths: ['/path1', '/path2', '/path3'],
        readOnlyMode: true,
        maxTokens: 5000,
        timeout: 60
      };

      validator.setProfilePermissions('stats-profile', config);

      const stats = validator.getProfileStats('stats-profile');

      expect(stats).toEqual({
        allowedToolsCount: 2,
        deniedToolsCount: 1,
        sandboxPathsCount: 3,
        readOnlyMode: true,
        maxTokens: 5000,
        timeout: 60
      });
    });

    it('should return null for non-existent profile stats', () => {
      const stats = validator.getProfileStats('non-existent');
      expect(stats).toBeNull();
    });
  });

  describe('default profile fallback', () => {
    it('should use default config for unknown profiles', () => {
      const context: ValidationContext = {
        profileName: 'unknown-profile',
        toolName: 'any-tool'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(true);
    });

    it('should apply default denied tools to unknown profiles', () => {
      const context: ValidationContext = {
        profileName: 'unknown-profile',
        toolName: 'delete-everything'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('is explicitly denied');
    });
  });

  describe('edge cases', () => {
    it('should handle empty tool name', () => {
      const context: ValidationContext = {
        profileName: 'test-profile',
        toolName: ''
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(true);
    });

    it('should handle case insensitive pattern matching', () => {
      validator.setProfilePermissions('case-profile', {
        allowedTools: ['READ-*']
      });

      const context: ValidationContext = {
        profileName: 'case-profile',
        toolName: 'read-file'
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(true);
    });

    it('should handle undefined arguments in context', () => {
      const context: ValidationContext = {
        profileName: 'test-profile',
        toolName: 'test-tool',
        arguments: undefined,
        filePath: undefined,
        methodName: undefined,
        estimatedTokens: undefined
      };

      const result = validator.validateToolAccess(context);

      expect(result.allowed).toBe(true);
    });
  });
});