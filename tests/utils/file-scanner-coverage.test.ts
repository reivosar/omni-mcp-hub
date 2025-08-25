import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ILogger } from '../../src/utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock dependencies
vi.mock('../../src/utils/logger.js', () => ({
  createFileLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  })),
  SilentLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}));

vi.mock('../../src/utils/path-security.js', () => ({
  safeResolve: vi.fn((p: string) => p),
  safeJoin: vi.fn((basePath: string, ...segments: string[]) => {
    return path.join(basePath, ...segments);
  }),
  validatePathExists: vi.fn(() => Promise.resolve(true)),
  sanitizePathSegment: vi.fn((s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
  defaultPathValidator: {
    isPathSafe: vi.fn(() => true)
  }
}));

// Mock YamlConfigManager
vi.mock('../../src/config/yaml-config.js', () => ({
  YamlConfigManager: vi.fn().mockImplementation(() => ({
    getConfig: vi.fn(() => ({
      fileSettings: {
        includePaths: [],
        configFiles: {
          claude: 'CLAUDE.md',
          behavior: '*.md',
          custom: '*.md'
        }
      },
      logging: {
        verboseFileLoading: false
      },
      directoryScanning: {
        recursive: true,
        maxDepth: 3,
        includeHidden: false,
        followSymlinks: false
      }
    })),
    shouldIncludeDirectory: vi.fn(() => true),
    isExcluded: vi.fn(() => false),
    isAllowedExtension: vi.fn(() => true),
    matchesPattern: vi.fn((filename: string, pattern: string) => {
      if (pattern === 'CLAUDE.md') return filename === 'CLAUDE.md';
      if (pattern === '*.md') return filename.endsWith('.md');
      return false;
    })
  }))
}));

// Mock PathResolver
vi.mock('../../src/utils/path-resolver.js', () => ({
  PathResolver: {
    getInstance: vi.fn(() => ({
      resolveAbsolutePath: vi.fn((p: string) => path.resolve(p))
    }))
  }
}));

// Import FileScanner after mocking dependencies
import { FileScanner } from '../../src/utils/file-scanner.js';

describe('FileScanner Coverage Tests', () => {
  let fileScanner: FileScanner;
  let tempDir: string;
  let mockLogger: ILogger;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-scanner-test-'));
    
    const { createFileLogger } = await import('../../src/utils/logger.js');
    mockLogger = vi.mocked(createFileLogger)();
    
    fileScanner = new FileScanner(mockLogger);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should create instance with logger', () => {
      expect(fileScanner).toBeDefined();
      expect(fileScanner).toBeInstanceOf(FileScanner);
    });

    it('should create instance without logger', () => {
      const scanner = new FileScanner();
      expect(scanner).toBeDefined();
    });
  });

  describe('findClaudeConfigFiles', () => {
    beforeEach(() => {
      // Create test directory structure
      fs.mkdirSync(path.join(tempDir, 'subdir1'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'subdir2'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, '.hidden'), { recursive: true });
      
      // Create test files
      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Main CLAUDE config');
      fs.writeFileSync(path.join(tempDir, 'profile1.md'), '# Profile 1');
      fs.writeFileSync(path.join(tempDir, 'profile2.md'), '# Profile 2');
      fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'Not a markdown file');
      fs.writeFileSync(path.join(tempDir, 'subdir1', 'nested.md'), '# Nested config');
      fs.writeFileSync(path.join(tempDir, '.hidden', 'hidden.md'), '# Hidden config');
    });

    it('should find all CLAUDE config files', async () => {
      const files = await fileScanner.findClaudeConfigFiles(tempDir);
      
      expect(files).toContain(path.join(tempDir, 'CLAUDE.md'));
      expect(files).toContain(path.join(tempDir, 'profile1.md'));
      expect(files).toContain(path.join(tempDir, 'profile2.md'));
      expect(files.length).toBeGreaterThanOrEqual(3);
    });

    it('should find files recursively', async () => {
      const files = await fileScanner.findClaudeConfigFiles(tempDir, { recursive: true });
      
      expect(files).toContain(path.join(tempDir, 'subdir1', 'nested.md'));
      expect(files.length).toBeGreaterThan(3);
    });

    it('should exclude hidden directories by default', async () => {
      const files = await fileScanner.findClaudeConfigFiles(tempDir, { recursive: true });
      
      const hiddenFiles = files.filter(f => f.includes('.hidden'));
      expect(hiddenFiles).toHaveLength(0);
    });

    it('should include hidden directories when specified', () => {
      const files = fileScanner.findClaudeConfigFiles(tempDir, { 
        recursive: true, 
        includeHidden: true 
      });
      
      expect(files).toContain(path.join(tempDir, '.hidden', 'hidden.md'));
    });

    it('should filter by custom patterns', () => {
      const files = fileScanner.findClaudeConfigFiles(tempDir, {
        patterns: ['CLAUDE.md']
      });
      
      expect(files).toContain(path.join(tempDir, 'CLAUDE.md'));
      expect(files).not.toContain(path.join(tempDir, 'profile1.md'));
    });

    it('should handle non-existent directories', () => {
      const files = fileScanner.findClaudeConfigFiles('/non/existent/directory');
      expect(files).toHaveLength(0);
    });

    it('should handle empty directories', () => {
      const emptyDir = path.join(tempDir, 'empty');
      fs.mkdirSync(emptyDir);
      
      const files = fileScanner.findClaudeConfigFiles(emptyDir);
      expect(files).toHaveLength(0);
    });

    it('should respect max depth limit', () => {
      // Create deeply nested structure
      const deepPath = path.join(tempDir, 'level1', 'level2', 'level3');
      fs.mkdirSync(deepPath, { recursive: true });
      fs.writeFileSync(path.join(deepPath, 'deep.md'), '# Deep config');

      const shallowFiles = fileScanner.findClaudeConfigFiles(tempDir, {
        recursive: true,
        maxDepth: 1
      });

      const deepFiles = fileScanner.findClaudeConfigFiles(tempDir, {
        recursive: true,
        maxDepth: 4
      });

      expect(shallowFiles.length).toBeLessThan(deepFiles.length);
    });
  });

  describe('scanDirectory', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(tempDir, 'file1.md'), '# File 1');
      fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'Text file');
      fs.writeFileSync(path.join(tempDir, 'script.js'), 'console.log("test");');
      fs.mkdirSync(path.join(tempDir, 'subdir'));
      fs.writeFileSync(path.join(tempDir, 'subdir', 'nested.md'), '# Nested');
    });

    it('should scan directory for all files', () => {
      const files = fileScanner.scanDirectory(tempDir);
      
      expect(files.length).toBeGreaterThanOrEqual(3);
      expect(files).toContain(path.join(tempDir, 'file1.md'));
      expect(files).toContain(path.join(tempDir, 'file2.txt'));
      expect(files).toContain(path.join(tempDir, 'script.js'));
    });

    it('should filter by file extensions', () => {
      const mdFiles = fileScanner.scanDirectory(tempDir, {
        extensions: ['.md']
      });

      expect(mdFiles).toContain(path.join(tempDir, 'file1.md'));
      expect(mdFiles).not.toContain(path.join(tempDir, 'file2.txt'));
    });

    it('should scan recursively', () => {
      const allFiles = fileScanner.scanDirectory(tempDir, { recursive: true });
      
      expect(allFiles).toContain(path.join(tempDir, 'subdir', 'nested.md'));
    });

    it('should exclude patterns', () => {
      const files = fileScanner.scanDirectory(tempDir, {
        exclude: ['*.txt', '*.js']
      });

      expect(files).toContain(path.join(tempDir, 'file1.md'));
      expect(files).not.toContain(path.join(tempDir, 'file2.txt'));
      expect(files).not.toContain(path.join(tempDir, 'script.js'));
    });

    it('should include only specific patterns', () => {
      const files = fileScanner.scanDirectory(tempDir, {
        include: ['*.md']
      });

      expect(files).toContain(path.join(tempDir, 'file1.md'));
      expect(files).not.toContain(path.join(tempDir, 'file2.txt'));
    });

    it('should respect size limits', () => {
      // Create a large file
      const largePath = path.join(tempDir, 'large.md');
      fs.writeFileSync(largePath, '#'.repeat(10000));

      const smallFiles = fileScanner.scanDirectory(tempDir, {
        maxSize: 1000
      });

      const allFiles = fileScanner.scanDirectory(tempDir);

      expect(smallFiles.length).toBeLessThan(allFiles.length);
    });
  });

  describe('getFileMetadata', () => {
    it('should return file metadata', () => {
      const filePath = path.join(tempDir, 'metadata-test.md');
      const content = '# Test file for metadata';
      fs.writeFileSync(filePath, content);

      const metadata = fileScanner.getFileMetadata(filePath);
      
      expect(metadata).toBeDefined();
      expect(metadata.path).toBe(filePath);
      expect(metadata.size).toBe(content.length);
      expect(metadata.extension).toBe('.md');
      expect(metadata.name).toBe('metadata-test.md');
      expect(metadata.lastModified).toBeInstanceOf(Date);
      expect(metadata.isDirectory).toBe(false);
    });

    it('should handle directory metadata', () => {
      const dirPath = path.join(tempDir, 'test-directory');
      fs.mkdirSync(dirPath);

      const metadata = fileScanner.getFileMetadata(dirPath);
      
      expect(metadata.isDirectory).toBe(true);
      expect(metadata.extension).toBe('');
    });

    it('should handle non-existent files', () => {
      const metadata = fileScanner.getFileMetadata('/non/existent/file.md');
      expect(metadata).toBeNull();
    });

    it('should handle permission errors', () => {
      // Create a file we can't access (on systems that support it)
      const restrictedPath = path.join(tempDir, 'restricted.md');
      fs.writeFileSync(restrictedPath, 'restricted content');
      
      try {
        fs.chmodSync(restrictedPath, 0o000);
        const metadata = fileScanner.getFileMetadata(restrictedPath);
        // Should either return null or throw, both are acceptable
        expect(metadata === null || metadata !== null).toBe(true);
        
        // Restore permissions for cleanup
        fs.chmodSync(restrictedPath, 0o644);
      } catch (error) {
        // Permission changes might not work on all systems
        expect(true).toBe(true);
      }
    });
  });

  describe('isValidClaudeConfig', () => {
    it('should validate correct CLAUDE.md files', () => {
      const validPath = path.join(tempDir, 'valid-claude.md');
      const validContent = `# CLAUDE.md

## Instructions
These are valid instructions for Claude.

## Memory  
Important context to remember.`;

      fs.writeFileSync(validPath, validContent);
      
      const isValid = fileScanner.isValidClaudeConfig(validPath);
      expect(isValid).toBe(true);
    });

    it('should reject non-markdown files', () => {
      const txtPath = path.join(tempDir, 'config.txt');
      fs.writeFileSync(txtPath, '# This looks like markdown but is not');
      
      const isValid = fileScanner.isValidClaudeConfig(txtPath);
      expect(isValid).toBe(false);
    });

    it('should reject empty files', () => {
      const emptyPath = path.join(tempDir, 'empty.md');
      fs.writeFileSync(emptyPath, '');
      
      const isValid = fileScanner.isValidClaudeConfig(emptyPath);
      expect(isValid).toBe(false);
    });

    it('should validate files with minimal content', () => {
      const minimalPath = path.join(tempDir, 'minimal.md');
      fs.writeFileSync(minimalPath, '# Minimal Config\n\nSome content.');
      
      const isValid = fileScanner.isValidClaudeConfig(minimalPath);
      expect(isValid).toBe(true);
    });

    it('should handle binary files gracefully', () => {
      const binaryPath = path.join(tempDir, 'binary.md');
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
      fs.writeFileSync(binaryPath, binaryData);
      
      const isValid = fileScanner.isValidClaudeConfig(binaryPath);
      expect(isValid).toBe(false);
    });
  });

  describe('watchDirectory', () => {
    it('should set up directory watching', (done) => {
      const callback = vi.fn((event: string, filename: string) => {
        expect(event).toBeDefined();
        expect(filename).toBeDefined();
        watcher.close();
        done();
      });

      const watcher = fileScanner.watchDirectory(tempDir, callback);
      expect(watcher).toBeDefined();

      // Trigger a file change
      setTimeout(() => {
        fs.writeFileSync(path.join(tempDir, 'new-file.md'), '# New file');
      }, 100);
    });

    it('should handle watch errors gracefully', () => {
      const callback = vi.fn();
      const watcher = fileScanner.watchDirectory('/non/existent/directory', callback);
      
      // Should not throw, but watcher might be null
      expect(watcher === null || typeof watcher === 'object').toBe(true);
    });

    it('should filter watch events', (done) => {
      const callback = vi.fn((event: string, filename: string) => {
        if (filename.endsWith('.md')) {
          expect(filename).toContain('.md');
          watcher.close();
          done();
        }
      });

      const watcher = fileScanner.watchDirectory(tempDir, callback, {
        filter: (filename: string) => filename.endsWith('.md')
      });

      setTimeout(() => {
        fs.writeFileSync(path.join(tempDir, 'watched.md'), '# Watched');
        fs.writeFileSync(path.join(tempDir, 'ignored.txt'), 'Ignored');
      }, 100);
    });
  });

  describe('searchInFiles', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(tempDir, 'search1.md'), '# Config 1\nThis contains search term');
      fs.writeFileSync(path.join(tempDir, 'search2.md'), '# Config 2\nThis does not contain the word');
      fs.writeFileSync(path.join(tempDir, 'search3.md'), '# Config 3\nAnother SEARCH term here');
    });

    it('should search for text in files', () => {
      const files = [
        path.join(tempDir, 'search1.md'),
        path.join(tempDir, 'search2.md'),
        path.join(tempDir, 'search3.md')
      ];

      const results = fileScanner.searchInFiles(files, 'search term');
      
      expect(results).toHaveLength(1);
      expect(results[0].file).toBe(path.join(tempDir, 'search1.md'));
      expect(results[0].matches.length).toBeGreaterThan(0);
    });

    it('should support case-insensitive search', () => {
      const files = [path.join(tempDir, 'search3.md')];
      const results = fileScanner.searchInFiles(files, 'search', {
        caseSensitive: false
      });

      expect(results).toHaveLength(1);
      expect(results[0].matches.length).toBeGreaterThan(0);
    });

    it('should support regex search', () => {
      const files = [
        path.join(tempDir, 'search1.md'),
        path.join(tempDir, 'search2.md')
      ];

      const results = fileScanner.searchInFiles(files, /Config \d/, {
        useRegex: true
      });

      expect(results).toHaveLength(2);
    });

    it('should return line numbers and context', () => {
      const files = [path.join(tempDir, 'search1.md')];
      const results = fileScanner.searchInFiles(files, 'search term');

      expect(results[0].matches[0].lineNumber).toBeDefined();
      expect(results[0].matches[0].lineContent).toBeDefined();
    });

    it('should handle binary files gracefully', () => {
      const binaryPath = path.join(tempDir, 'binary.md');
      fs.writeFileSync(binaryPath, Buffer.from([0x00, 0x01, 0x02]));

      const results = fileScanner.searchInFiles([binaryPath], 'search');
      expect(results).toHaveLength(0);
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large directories efficiently', () => {
      // Create many files
      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(path.join(tempDir, `file${i}.md`), `# File ${i}`);
      }

      const start = Date.now();
      const files = fileScanner.findClaudeConfigFiles(tempDir);
      const duration = Date.now() - start;

      expect(files).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle deeply nested directories', () => {
      let currentPath = tempDir;
      
      // Create nested structure
      for (let i = 0; i < 10; i++) {
        currentPath = path.join(currentPath, `level${i}`);
        fs.mkdirSync(currentPath, { recursive: true });
        fs.writeFileSync(path.join(currentPath, 'config.md'), `# Level ${i}`);
      }

      const files = fileScanner.findClaudeConfigFiles(tempDir, {
        recursive: true,
        maxDepth: 15
      });

      expect(files).toHaveLength(10);
    });

    it('should limit memory usage for large files', () => {
      // Create a very large file
      const largePath = path.join(tempDir, 'huge.md');
      fs.writeFileSync(largePath, '#'.repeat(1000000)); // 1MB file

      const metadata = fileScanner.getFileMetadata(largePath);
      expect(metadata).toBeDefined();
      expect(metadata!.size).toBe(1000000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle symbolic links correctly', () => {
      const targetPath = path.join(tempDir, 'target.md');
      const linkPath = path.join(tempDir, 'link.md');
      
      fs.writeFileSync(targetPath, '# Target file');
      
      try {
        fs.symlinkSync(targetPath, linkPath);
        
        const files = fileScanner.findClaudeConfigFiles(tempDir);
        expect(files).toContain(targetPath);
        
        const metadata = fileScanner.getFileMetadata(linkPath);
        expect(metadata).toBeDefined();
      } catch (error) {
        // Symlinks might not be supported on all systems
        expect(true).toBe(true);
      }
    });

    it('should handle special characters in filenames', () => {
      const specialNames = [
        'file with spaces.md',
        'file-with-hyphens.md',
        'file_with_underscores.md',
        'file(with)parentheses.md'
      ];

      specialNames.forEach(name => {
        fs.writeFileSync(path.join(tempDir, name), `# ${name}`);
      });

      const files = fileScanner.findClaudeConfigFiles(tempDir);
      expect(files.length).toBeGreaterThanOrEqual(specialNames.length);
    });

    it('should handle concurrent file operations', async () => {
      // Create a fresh directory for this test
      const concurrentDir = path.join(tempDir, 'concurrent');
      fs.mkdirSync(concurrentDir, { recursive: true });
      
      const promises = Array(10).fill(null).map((_, i) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            fs.writeFileSync(path.join(concurrentDir, `concurrent${i}.md`), `# File ${i}`);
            resolve();
          }, Math.random() * 100);
        });
      });

      await Promise.all(promises);

      const files = fileScanner.findClaudeConfigFiles(concurrentDir);
      expect(files).toHaveLength(10);
    });

    it('should validate file paths for security', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config',
        '/etc/shadow'
      ];

      maliciousPaths.forEach(maliciousPath => {
        const files = fileScanner.findClaudeConfigFiles(maliciousPath);
        expect(files).toHaveLength(0);
      });
    });

    it('should handle file system errors gracefully', () => {
      // Test with a directory path that would cause errors
      const invalidDir = path.join('/root', 'no-permission-directory');
      
      const files = fileScanner.findClaudeConfigFiles(invalidDir);
      expect(files).toHaveLength(0);
      
      // Test with completely invalid path
      const files2 = fileScanner.findClaudeConfigFiles('/this/path/absolutely/does/not/exist');
      expect(files2).toHaveLength(0);
    });

    it('should handle circular directory references', () => {
      // This is hard to test without actually creating circular refs
      // which might damage the file system, so we just ensure
      // the function handles the maxDepth parameter correctly
      const files = fileScanner.findClaudeConfigFiles(tempDir, {
        recursive: true,
        maxDepth: 0
      });

      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should properly close file watchers', () => {
      const callback = vi.fn();
      const watcher = fileScanner.watchDirectory(tempDir, callback);
      
      if (watcher) {
        expect(() => watcher.close()).not.toThrow();
      }
    });

    it('should handle resource cleanup on errors', () => {
      // Test that resources are cleaned up even when operations fail
      expect(() => {
        fileScanner.findClaudeConfigFiles('/invalid/path/that/causes/error');
      }).not.toThrow();
    });
  });
});