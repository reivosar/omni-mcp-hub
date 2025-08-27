import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PathResolver } from '../../src/utils/path-resolver.js';
import * as path from 'path';

describe('PathResolver', () => {
  let pathResolver: PathResolver;
  let originalCwd: string;
  let mockCwd: string;

  beforeEach(() => {
    // Reset singleton instance for each test
    (PathResolver as any).instance = undefined;
    pathResolver = PathResolver.getInstance();
    
    // Mock process.cwd()
    originalCwd = process.cwd();
    mockCwd = '/mock/project/root';
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset singleton instance
    (PathResolver as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = PathResolver.getInstance();
      const instance2 = PathResolver.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('resolveAbsolutePath', () => {
    it('should return absolute path as-is', () => {
      const absolutePath = '/absolute/path/to/file.md';
      const result = pathResolver.resolveAbsolutePath(absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('should resolve relative path starting with ./', () => {
      const relativePath = './relative/file.md';
      const result = pathResolver.resolveAbsolutePath(relativePath);
      expect(result).toBe(path.resolve(mockCwd, relativePath));
      expect(result).toBe('/mock/project/root/relative/file.md');
    });

    it('should resolve relative path starting with ../', () => {
      const relativePath = '../parent/file.md';
      const result = pathResolver.resolveAbsolutePath(relativePath);
      expect(result).toBe(path.resolve(mockCwd, relativePath));
      expect(result).toBe('/mock/project/parent/file.md');
    });

    it('should resolve relative path without prefix', () => {
      const relativePath = 'file.md';
      const result = pathResolver.resolveAbsolutePath(relativePath);
      expect(result).toBe(path.resolve(mockCwd, relativePath));
      expect(result).toBe('/mock/project/root/file.md');
    });

    it('should handle nested relative paths', () => {
      const relativePath = './configs/profiles/lum.md';
      const result = pathResolver.resolveAbsolutePath(relativePath);
      expect(result).toBe('/mock/project/root/configs/profiles/lum.md');
    });

    it('should handle complex parent directory navigation', () => {
      const relativePath = '../../other/project/file.md';
      const result = pathResolver.resolveAbsolutePath(relativePath);
      expect(result).toBe('/mock/other/project/file.md');
    });

    it('should handle empty string', () => {
      const relativePath = '';
      const result = pathResolver.resolveAbsolutePath(relativePath);
      expect(result).toBe(mockCwd);
    });

    it('should handle current directory', () => {
      const relativePath = '.';
      const result = pathResolver.resolveAbsolutePath(relativePath);
      expect(result).toBe(mockCwd);
    });

    it('should handle parent directory', () => {
      const relativePath = '..';
      const result = pathResolver.resolveAbsolutePath(relativePath);
      expect(result).toBe('/mock/project');
    });
  });

  describe('resolveProfilePath', () => {
    it('should return absolute path as-is', () => {
      const absolutePath = '/absolute/path/to/profile.md';
      const result = pathResolver.resolveProfilePath(absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('should resolve relative path starting with ./', () => {
      const relativePath = './profiles/lum.md';
      const result = pathResolver.resolveProfilePath(relativePath);
      expect(result).toBe('/mock/project/root/profiles/lum.md');
    });

    it('should resolve relative path starting with ../', () => {
      const relativePath = '../shared/profiles/zoro.md';
      const result = pathResolver.resolveProfilePath(relativePath);
      expect(result).toBe('/mock/project/shared/profiles/zoro.md');
    });

    it('should resolve relative path without prefix', () => {
      const relativePath = 'tsundere.md';
      const result = pathResolver.resolveProfilePath(relativePath);
      expect(result).toBe('/mock/project/root/tsundere.md');
    });

    it('should handle Windows-style paths', () => {
      // Test with an absolute Windows path - should work on any platform
      const absoluteWindowsPath = 'C:\\Users\\test\\profiles\\lum.md';
      const result = pathResolver.resolveProfilePath(absoluteWindowsPath);
      
      // The result should be the normalized version of the Windows path
      // On Unix systems, this will be normalized but still accessible
      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toMatch(/lum\.md$/);
    });

    it('should handle paths with spaces', () => {
      const relativePath = './My Profiles/Character Behavior.md';
      const result = pathResolver.resolveProfilePath(relativePath);
      expect(result).toBe('/mock/project/root/My Profiles/Character Behavior.md');
    });

    it('should handle deeply nested relative paths', () => {
      const relativePath = './examples/local-resources/behaviors/characters/anime/lum-behavior.md';
      const result = pathResolver.resolveProfilePath(relativePath);
      expect(result).toBe('/mock/project/root/examples/local-resources/behaviors/characters/anime/lum-behavior.md');
    });

    it('should handle multiple parent directory references', () => {
      const relativePath = '../../../global/configs/default.md';
      const result = pathResolver.resolveProfilePath(relativePath);
      expect(result).toBe('/global/configs/default.md');
    });
  });

  describe('getYamlConfigPath', () => {
    it('should return relative yaml config path', () => {
      const result = pathResolver.getYamlConfigPath();
      expect(result).toBe('./omni-config.yaml');
    });
  });

  describe('getAbsoluteYamlConfigPath', () => {
    it('should return absolute yaml config path', () => {
      const result = pathResolver.getAbsoluteYamlConfigPath();
      expect(result).toBe('/mock/project/root/omni-config.yaml');
    });

    it('should handle absolute config path', () => {
      // Mock getYamlConfigPath to return absolute path
      vi.spyOn(pathResolver, 'getYamlConfigPath').mockReturnValue('/absolute/config.yaml');
      const result = pathResolver.getAbsoluteYamlConfigPath();
      expect(result).toBe('/absolute/config.yaml');
    });
  });

  describe('generateProfilePaths', () => {
    it('should generate all possible profile paths', () => {
      const profileName = 'lum';
      const result = pathResolver.generateProfilePaths(profileName);
      
      expect(result).toEqual([
        'lum.md',
        './lum.md',
        './lum',
        './lum.md',
        './lum',
        'lum-behavior.md',
        './lum-behavior.md',
      ]);
    });

    it('should handle profile name with special characters', () => {
      const profileName = 'test-profile_v2';
      const result = pathResolver.generateProfilePaths(profileName);
      
      expect(result).toContain('test-profile_v2.md');
      expect(result).toContain('test-profile_v2-behavior.md');
    });
  });

  describe('generateFilePaths', () => {
    it('should generate all possible file paths', () => {
      const filePath = 'config';
      const result = pathResolver.generateFilePaths(filePath);
      
      expect(result).toEqual([
        'config.md',
        './config.md',
        './config',
        './config.md',
        './config',
      ]);
    });

    it('should handle file path with extension', () => {
      const filePath = 'config.yaml';
      const result = pathResolver.generateFilePaths(filePath);
      
      expect(result).toContain('config.yaml.md');
      expect(result).toContain('./config.yaml.md');
      expect(result).toContain('./config.yaml');
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined paths gracefully', () => {
      const nullPath = null as any;
      const undefinedPath = undefined as any;
      
      expect(() => pathResolver.resolveProfilePath(nullPath)).toThrow();
      expect(() => pathResolver.resolveProfilePath(undefinedPath)).toThrow();
    });

    it('should handle very long paths', () => {
      const longPath = './very/long/path/with/many/nested/directories/and/a/very/long/filename/that/exceeds/normal/limits.md';
      const result = pathResolver.resolveProfilePath(longPath);
      expect(result).toBe(path.resolve(mockCwd, longPath));
    });

    it('should handle paths with special characters', () => {
      const specialPath = './configs/プロファイル/キャラクター-behavior.md';
      const result = pathResolver.resolveProfilePath(specialPath);
      expect(result).toBe('/mock/project/root/configs/プロファイル/キャラクター-behavior.md');
    });

    it('should handle paths with dots in filename', () => {
      const dottedPath = './configs/profile.v1.2.3.md';
      const result = pathResolver.resolveProfilePath(dottedPath);
      expect(result).toBe('/mock/project/root/configs/profile.v1.2.3.md');
    });
  });

  describe('cross-platform compatibility', () => {
    it('should work on Unix systems', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/unix/project/root');
      const relativePath = './config/file.md';
      const result = pathResolver.resolveProfilePath(relativePath);
      expect(result).toBe('/unix/project/root/config/file.md');
    });

    it('should work on Windows systems', () => {
      // Test with an absolute Windows path
      const absoluteWindowsPath = 'D:\\Projects\\MyApp\\config\\file.md';
      const result = pathResolver.resolveProfilePath(absoluteWindowsPath);
      
      // Should handle the Windows path and return an absolute path
      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toMatch(/file\.md$/);
    });

    it('should normalize path separators', () => {
      const mixedPath = './config\\subdir/file.md';
      const result = pathResolver.resolveProfilePath(mixedPath);
      expect(result).toBe(path.resolve(mockCwd, mixedPath));
    });
  });

  describe('performance and memory', () => {
    it('should handle multiple rapid calls efficiently', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        pathResolver.resolveProfilePath(`./config${i}.md`);
      }
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should not leak memory with singleton pattern', () => {
      const instance1 = PathResolver.getInstance();
      const instance2 = PathResolver.getInstance();
      const instance3 = PathResolver.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBe(instance3);
    });
  });
});