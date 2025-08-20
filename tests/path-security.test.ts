import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import {
  safeJoin,
  safeResolve,
  containsDangerousPatterns,
  sanitizePathSegment,
  validatePathExists,
  getPathInfo,
  PathValidator,
  defaultPathValidator,
} from '../src/utils/path-security.js';

describe('Path Security', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'path-security-test-'));
    process.chdir(tempDir);

    // Create test directory structure
    await fs.mkdir('safe-dir', { recursive: true });
    await fs.writeFile('safe-dir/test.txt', 'test content');
    await fs.mkdir('safe-dir/subdir', { recursive: true });
    await fs.writeFile('safe-dir/subdir/nested.txt', 'nested content');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('safeJoin', () => {
    it('should join safe paths correctly', () => {
      const result = safeJoin(tempDir, 'safe-dir', 'test.txt');
      expect(result).toBe(path.join(tempDir, 'safe-dir', 'test.txt'));
    });

    it('should prevent directory traversal with ../', () => {
      expect(() => {
        safeJoin(tempDir, '..', 'etc', 'passwd');
      }).toThrow('Path traversal attempt detected');
    });

    it('should prevent multiple directory traversals', () => {
      expect(() => {
        safeJoin(tempDir, '..', '..', '..', 'etc', 'passwd');
      }).toThrow('Path traversal attempt detected');
    });

    it('should prevent disguised traversal attempts', () => {
      expect(() => {
        safeJoin(tempDir, 'safe-dir', '..', '..', 'etc', 'passwd');
      }).toThrow('Path traversal attempt detected');
    });

    it('should allow legitimate subdirectory access', () => {
      const result = safeJoin(tempDir, 'safe-dir', 'subdir');
      expect(result).toBe(path.join(tempDir, 'safe-dir', 'subdir'));
    });
  });

  describe('safeResolve', () => {
    it('should resolve relative paths safely', () => {
      const result = safeResolve('safe-dir/test.txt');
      const expected = path.resolve(tempDir, 'safe-dir/test.txt');
      // Handle macOS path aliasing (/private/var vs /var)
      expect(result === expected || result === expected.replace('/var/', '/private/var/')).toBe(true);
    });

    it('should reject absolute paths by default', () => {
      expect(() => {
        safeResolve('/etc/passwd');
      }).toThrow('Absolute paths are not allowed');
    });

    it('should allow absolute paths when configured', () => {
      const result = safeResolve(path.join(tempDir, 'safe-dir/test.txt'), {
        allowAbsolutePaths: true,
        allowedRoots: [tempDir],
      });
      expect(result).toBe(path.resolve(tempDir, 'safe-dir/test.txt'));
    });

    it('should reject paths outside allowed roots', () => {
      expect(() => {
        safeResolve('../../../etc/passwd');
      }).toThrow('Path outside allowed roots');
    });

    it('should enforce maximum depth', () => {
      expect(() => {
        safeResolve('a/b/c/d/e/f/g/h/i/j/k', { maxDepth: 5 });
      }).toThrow('Path depth exceeds maximum allowed');
    });

    it('should allow paths within depth limit', () => {
      const result = safeResolve('a/b/c', { 
        maxDepth: 5,
        allowedRoots: [tempDir, process.cwd(), '/tmp', '/var/folders', '/private/var/folders']
      });
      const expected = path.resolve(process.cwd(), 'a/b/c');
      expect(result).toBe(expected);
    });
  });

  describe('containsDangerousPatterns', () => {
    it('should detect parent directory traversal', () => {
      expect(containsDangerousPatterns('../etc/passwd')).toBe(true);
      expect(containsDangerousPatterns('safe/../etc/passwd')).toBe(true);
      expect(containsDangerousPatterns('..\\windows\\system32')).toBe(true);
    });

    it('should detect home directory access', () => {
      expect(containsDangerousPatterns('~/secrets')).toBe(true);
      expect(containsDangerousPatterns('~/.ssh/id_rsa')).toBe(true);
    });

    it('should detect root directory access', () => {
      expect(containsDangerousPatterns('/etc/passwd')).toBe(true);
      expect(containsDangerousPatterns('\\windows\\system32')).toBe(true);
    });

    it('should detect invalid filename characters', () => {
      expect(containsDangerousPatterns('file<script>')).toBe(true);
      expect(containsDangerousPatterns('file|pipe')).toBe(true);
      expect(containsDangerousPatterns('file?wildcard')).toBe(true);
      expect(containsDangerousPatterns('file*glob')).toBe(true);
    });

    it('should detect null byte injection', () => {
      expect(containsDangerousPatterns('file\0.txt')).toBe(true);
    });

    it('should detect trailing whitespace', () => {
      expect(containsDangerousPatterns('file.txt ')).toBe(true);
      expect(containsDangerousPatterns('file.txt\t')).toBe(true);
    });

    it('should allow safe paths', () => {
      expect(containsDangerousPatterns('safe-dir/test.txt')).toBe(false);
      expect(containsDangerousPatterns('file.txt')).toBe(false);
      expect(containsDangerousPatterns('path/to/file.txt')).toBe(false);
    });
  });

  describe('sanitizePathSegment', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizePathSegment('file<>:"|?*.txt')).toBe('file.txt');
    });

    it('should remove leading dots', () => {
      expect(sanitizePathSegment('...hidden')).toBe('hidden');
      expect(sanitizePathSegment('..secret')).toBe('secret');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizePathSegment('my file.txt')).toBe('my_file.txt');
    });

    it('should replace path separators', () => {
      expect(sanitizePathSegment('path/to/file')).toBe('path_to_file');
      expect(sanitizePathSegment('path\\to\\file')).toBe('path_to_file');
    });

    it('should limit length', () => {
      const longName = 'a'.repeat(300);
      const result = sanitizePathSegment(longName);
      expect(result.length).toBeLessThanOrEqual(255);
    });

    it('should preserve safe characters', () => {
      expect(sanitizePathSegment('safe-file_123.txt')).toBe('safe-file_123.txt');
    });
  });

  describe('validatePathExists', () => {
    it('should validate existing files', async () => {
      const result = await validatePathExists('safe-dir/test.txt');
      expect(result).toBe(true);
    });

    it('should reject non-existing files', async () => {
      const result = await validatePathExists('nonexistent.txt');
      expect(result).toBe(false);
    });

    it('should reject paths outside allowed roots', async () => {
      const result = await validatePathExists('../../../etc/passwd');
      expect(result).toBe(false);
    });
  });

  describe('getPathInfo', () => {
    it('should provide comprehensive path information', () => {
      const info = getPathInfo('safe-dir/subdir/test.txt');
      
      expect(info.originalPath).toBe('safe-dir/subdir/test.txt');
      expect(info.isAbsolute).toBe(false);
      expect(info.isWithinRoot).toBe(true);
      expect(info.depth).toBe(3);
      expect(info.segments).toEqual(['safe-dir', 'subdir', 'test.txt']);
      expect(info.hasDangerousPatterns).toBe(false);
    });

    it('should detect unsafe paths', () => {
      const info = getPathInfo('../../../etc/passwd');
      
      expect(info.originalPath).toBe('../../../etc/passwd');
      expect(info.isWithinRoot).toBe(false);
      expect(info.hasDangerousPatterns).toBe(true);
      expect(info.depth).toBe(-1);
    });
  });

  describe('PathValidator', () => {
    it('should create validator with custom options', () => {
      const validator = new PathValidator({
        maxDepth: 3,
        allowAbsolutePaths: true,
        allowedRoots: [tempDir, process.cwd()],
      });

      expect(validator.isPathSafe('safe-dir/test.txt')).toBe(true);
      expect(validator.isPathSafe('a/b/c/d')).toBe(false); // Exceeds depth
    });

    it('should join paths safely', () => {
      const validator = new PathValidator({ allowedRoots: [tempDir] });
      
      const result = validator.joinPaths(tempDir, 'safe-dir', 'test.txt');
      expect(result).toBe(path.join(tempDir, 'safe-dir', 'test.txt'));
    });

    it('should prevent unsafe path joining', () => {
      const validator = new PathValidator({ allowedRoots: [tempDir] });
      
      expect(() => {
        validator.joinPaths(tempDir, '..', 'etc', 'passwd');
      }).toThrow();
    });

    it('should sanitize paths', () => {
      const validator = new PathValidator();
      
      const result = validator.sanitizePath('unsafe<>path/with|dangerous*chars');
      expect(result).toBe('unsafepath_withdangerouschars');
    });

    it('should check path safety', () => {
      const validator = new PathValidator({ allowedRoots: [tempDir] });
      
      expect(validator.isPathSafe('safe-dir/test.txt')).toBe(true);
      expect(validator.isPathSafe('../../../etc/passwd')).toBe(false);
      expect(validator.isPathSafe('/etc/passwd')).toBe(false);
    });
  });

  describe('defaultPathValidator', () => {
    it('should use current working directory as default root', () => {
      expect(defaultPathValidator.isPathSafe('safe-dir/test.txt')).toBe(true);
      expect(defaultPathValidator.isPathSafe('../../../etc/passwd')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty paths', () => {
      expect(() => safeJoin(tempDir, '')).not.toThrow();
      expect(containsDangerousPatterns('')).toBe(false);
    });

    it('should handle paths with only dots', () => {
      expect(() => safeResolve('.')).not.toThrow();
      expect(containsDangerousPatterns('.')).toBe(false);
    });

    it('should handle Unicode characters', () => {
      const unicodePath = 'ファイル.txt';
      expect(containsDangerousPatterns(unicodePath)).toBe(false);
      expect(sanitizePathSegment(unicodePath)).toBe(unicodePath);
    });

    it('should handle very long paths', () => {
      const longPath = 'a/'.repeat(100) + 'file.txt';
      expect(() => {
        safeResolve(longPath, { maxDepth: 50 });
      }).toThrow('Path depth exceeds maximum allowed');
    });

    it('should handle mixed path separators', () => {
      const mixedPath = 'path\\to/file.txt';
      const result = sanitizePathSegment(mixedPath);
      expect(result).toBe('path_to_file.txt');
    });
  });
});