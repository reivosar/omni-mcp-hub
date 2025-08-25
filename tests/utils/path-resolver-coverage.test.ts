import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock path security module before import
vi.mock('../../src/utils/path-security.js', () => ({
  safeResolve: vi.fn((p: string) => {
    const path = require('path');
    return path.resolve(p);
  }),
  defaultPathValidator: {
    isPathSafe: vi.fn(() => true)
  },
  containsDangerousPatterns: vi.fn(() => false)
}));

// Import the mocked functions and PathResolver after mocking dependencies
import * as pathSecurity from '../../src/utils/path-security.js';
import { PathResolver } from '../../src/utils/path-resolver.js';

describe('PathResolver Coverage Tests', () => {
  let pathResolver: PathResolver;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-resolver-test-'));
    pathResolver = PathResolver.getInstance();
    
    // Reset all mocks to their default implementations
    vi.mocked(pathSecurity.safeResolve).mockImplementation((p: string) => {
      const path = require('path');
      return path.resolve(p);
    });
    vi.mocked(pathSecurity.defaultPathValidator.isPathSafe).mockReturnValue(true);
    vi.mocked(pathSecurity.containsDangerousPatterns).mockReturnValue(false);
    
    // Temporarily disable NODE_ENV test detection for security validation
    const originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    process.env.VITEST = '';
  });

  afterEach(async () => {
    vi.clearAllMocks();
    // Restore NODE_ENV
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Singleton Pattern', () => {
    it('should return same instance when called multiple times', () => {
      const instance1 = PathResolver.getInstance();
      const instance2 = PathResolver.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(PathResolver);
    });
  });

  describe('YAML Config Path', () => {
    it('should return fixed YAML config path', () => {
      const yamlPath = pathResolver.getYamlConfigPath();
      expect(yamlPath).toBe('./omni-config.yaml');
    });

    it('should return absolute YAML config path', () => {
      const absolutePath = pathResolver.getAbsoluteYamlConfigPath();
      expect(path.isAbsolute(absolutePath)).toBe(true);
      expect(absolutePath).toContain('omni-config.yaml');
    });

    it('should handle already absolute YAML config path', () => {
      // Mock getYamlConfigPath to return absolute path
      const originalMethod = pathResolver.getYamlConfigPath;
      pathResolver.getYamlConfigPath = vi.fn(() => '/absolute/path/config.yaml');
      
      const absolutePath = pathResolver.getAbsoluteYamlConfigPath();
      expect(absolutePath).toBe('/absolute/path/config.yaml');
      
      // Restore original method
      pathResolver.getYamlConfigPath = originalMethod;
    });
  });

  describe('Profile Search Directory', () => {
    it('should return directory containing YAML config', () => {
      const searchDir = pathResolver.getProfileSearchDirectory();
      expect(searchDir).toBe('.');
    });
  });

  describe('Profile Path Generation', () => {
    it('should generate multiple profile paths for given name', () => {
      const profileName = 'test-profile';
      const paths = pathResolver.generateProfilePaths(profileName);
      
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths).toContain('test-profile.md');
      expect(paths).toContain('./test-profile.md');
      expect(paths).toContain('./test-profile');
    });

    it('should reject dangerous patterns in profile names', () => {
      vi.mocked(pathSecurity.containsDangerousPatterns).mockReturnValueOnce(true);
      
      expect(() => {
        pathResolver.generateProfilePaths('../malicious');
      }).toThrow('Invalid profile name contains dangerous patterns');
    });

    it('should handle empty profile name', () => {
      const paths = pathResolver.generateProfilePaths('');
      expect(Array.isArray(paths)).toBe(true);
    });

    it('should generate behavior profile paths', () => {
      const profileName = 'custom-behavior';
      const paths = pathResolver.generateProfilePaths(profileName);
      
      expect(paths.some(p => p.includes('-behavior.md'))).toBe(true);
    });

    it('should handle special characters in profile names', () => {
      const profileName = 'profile_with-special.chars';
      const paths = pathResolver.generateProfilePaths(profileName);
      
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    });
  });

  describe('File Path Generation', () => {
    it('should generate multiple file paths for given path', () => {
      const filePath = 'test-file';
      const paths = pathResolver.generateFilePaths(filePath);
      
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths).toContain('test-file.md');
      expect(paths).toContain('./test-file.md');
      expect(paths).toContain('./test-file');
    });

    it('should reject dangerous patterns in file paths', () => {
      vi.mocked(pathSecurity.containsDangerousPatterns).mockReturnValueOnce(true);
      
      expect(() => {
        pathResolver.generateFilePaths('../malicious-file');
      }).toThrow('Invalid file path contains dangerous patterns');
    });

    it('should handle empty file path', () => {
      const paths = pathResolver.generateFilePaths('');
      expect(Array.isArray(paths)).toBe(true);
    });

    it('should handle file paths with extensions', () => {
      const filePath = 'document.txt';
      const paths = pathResolver.generateFilePaths(filePath);
      
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    });
  });

  describe('Absolute Path Resolution', () => {
    it('should resolve relative path to absolute', () => {
      const relativePath = './relative/path.md';
      const absolutePath = pathResolver.resolveAbsolutePath(relativePath);
      
      expect(path.isAbsolute(absolutePath)).toBe(true);
      expect(absolutePath).toContain('relative/path.md');
    });

    it('should return absolute path as-is', () => {
      const originalPath = '/absolute/path.md';
      const resolvedPath = pathResolver.resolveAbsolutePath(originalPath);
      
      expect(resolvedPath).toBe(path.resolve(originalPath));
    });

    it('should handle current directory path', () => {
      const currentPath = './current.md';
      const absolutePath = pathResolver.resolveAbsolutePath(currentPath);
      
      expect(path.isAbsolute(absolutePath)).toBe(true);
      expect(absolutePath).toContain('current.md');
    });

    it('should handle parent directory paths', () => {
      const parentPath = '../parent.md';
      const absolutePath = pathResolver.resolveAbsolutePath(parentPath);
      
      expect(path.isAbsolute(absolutePath)).toBe(true);
    });

    it('should handle complex relative paths', () => {
      const complexPath = './dir1/../dir2/file.md';
      const absolutePath = pathResolver.resolveAbsolutePath(complexPath);
      
      expect(path.isAbsolute(absolutePath)).toBe(true);
      expect(absolutePath).toContain('dir2/file.md');
    });
  });

  describe('Profile Path Resolution', () => {
    it('should resolve safe profile path', () => {
      const profilePath = './safe-profile.md';
      const resolvedPath = pathResolver.resolveProfilePath(profilePath);
      
      expect(path.isAbsolute(resolvedPath)).toBe(true);
      expect(resolvedPath).toContain('safe-profile.md');
    });

    it('should resolve safe profile paths', () => {
      const profilePath = './safe-profile.md';
      const resolvedPath = pathResolver.resolveProfilePath(profilePath);
      
      expect(path.isAbsolute(resolvedPath)).toBe(true);
      expect(resolvedPath).toContain('safe-profile.md');
    });

    it('should handle absolute profile paths', () => {
      const absolutePath = '/absolute/profile.md';
      const resolvedPath = pathResolver.resolveProfilePath(absolutePath);
      
      expect(path.isAbsolute(resolvedPath)).toBe(true);
    });

    it('should handle relative profile paths', () => {
      const relativePath = 'relative-profile.md';
      const resolvedPath = pathResolver.resolveProfilePath(relativePath);
      
      expect(path.isAbsolute(resolvedPath)).toBe(true);
      expect(resolvedPath).toContain('relative-profile.md');
    });

    it('should handle profile paths with subdirectories', () => {
      const subdirPath = 'profiles/subdir/nested.md';
      const resolvedPath = pathResolver.resolveProfilePath(subdirPath);
      
      expect(path.isAbsolute(resolvedPath)).toBe(true);
      expect(resolvedPath).toContain('profiles/subdir/nested.md');
    });
  });

  describe('Error Handling', () => {
    it('should handle complex profile paths', () => {
      const complexPath = './dir/../profile.md';
      const resolvedPath = pathResolver.resolveProfilePath(complexPath);
      
      expect(path.isAbsolute(resolvedPath)).toBe(true);
      expect(resolvedPath).toContain('profile.md');
    });

    it('should handle security validation exceptions', () => {
      vi.mocked(pathSecurity.containsDangerousPatterns).mockImplementation(() => {
        throw new Error('Security check failed');
      });
      
      expect(() => {
        pathResolver.generateProfilePaths('error-profile');
      }).toThrow('Security check failed');
    });

    it('should handle safeResolve failures', () => {
      vi.mocked(pathSecurity.safeResolve).mockImplementation(() => {
        throw new Error('Resolution failed');
      });
      
      const paths = pathResolver.generateProfilePaths('test-profile');
      // Should still return some paths even if some fail
      expect(Array.isArray(paths)).toBe(true);
    });
  });

  describe('Integration with Path Security', () => {
    it('should use safeResolve for secure path generation', () => {
      // Force the code to go through safeResolve by using a relative path that will fail the first try-block
      vi.mocked(pathSecurity.safeResolve).mockImplementationOnce(() => {
        throw new Error('Safe resolve test');
      }).mockImplementationOnce((p: string) => {
        const path = require('path');
        return path.resolve(p);
      });
      
      pathResolver.resolveAbsolutePath('./relative-path');
      
      expect(pathSecurity.safeResolve).toHaveBeenCalled();
    });

    it('should use defaultPathValidator for security checks', () => {
      pathResolver.resolveProfilePath('/absolute/test-profile.md');
      
      expect(pathSecurity.defaultPathValidator.isPathSafe).toHaveBeenCalled();
    });

    it('should check for dangerous patterns', () => {
      pathResolver.generateProfilePaths('test-profile');
      
      expect(pathSecurity.containsDangerousPatterns).toHaveBeenCalledWith('test-profile');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined profile names gracefully', () => {
      expect(() => {
        pathResolver.generateProfilePaths(null as never);
      }).not.toThrow();
      
      expect(() => {
        pathResolver.generateProfilePaths(undefined as never);
      }).not.toThrow();
    });

    it('should handle very long profile names', () => {
      const longName = 'a'.repeat(1000);
      const paths = pathResolver.generateProfilePaths(longName);
      
      expect(Array.isArray(paths)).toBe(true);
    });

    it('should handle special filesystem characters', () => {
      const specialName = 'test profile with spaces';
      const paths = pathResolver.generateProfilePaths(specialName);
      
      expect(Array.isArray(paths)).toBe(true);
    });

    it('should handle paths with multiple extensions', () => {
      const filePath = 'file.backup.md';
      const paths = pathResolver.generateFilePaths(filePath);
      
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should maintain path separators across platforms', () => {
      const profilePath = 'dir/subdir/profile.md';
      const resolvedPath = pathResolver.resolveAbsolutePath(profilePath);
      
      expect(path.isAbsolute(resolvedPath)).toBe(true);
      // Should work on both Unix and Windows
      expect(resolvedPath).toContain('profile.md');
    });
  });

  describe('Configuration Integration', () => {
    it('should work with different YAML config locations', () => {
      // This tests the integration with YAML config
      const searchDir = pathResolver.getProfileSearchDirectory();
      const yamlPath = pathResolver.getYamlConfigPath();
      
      expect(searchDir).toBe(path.dirname(yamlPath));
    });

    it('should handle missing YAML config gracefully', () => {
      // Test when YAML config doesn't exist
      const yamlPath = pathResolver.getYamlConfigPath();
      const absolutePath = pathResolver.getAbsoluteYamlConfigPath();
      
      expect(yamlPath).toBeDefined();
      expect(absolutePath).toBeDefined();
    });
  });
});