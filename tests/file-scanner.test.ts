import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileScanner, FileInfo, ScanOptions } from '../src/utils/file-scanner.js';
import { YamlConfigManager } from '../src/config/yaml-config.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock filesystem
vi.mock('fs/promises');
const mockedFs = vi.mocked(fs);

// Mock YamlConfigManager methods
vi.mock('../src/config/yaml-config.js');

describe('FileScanner', () => {
  let scanner: FileScanner;
  let mockYamlConfigManager: any;
  const testDir = '/test/directory';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock YamlConfigManager with all necessary methods
    mockYamlConfigManager = {
      getConfig: vi.fn(),
      shouldIncludeDirectory: vi.fn(),
      isExcluded: vi.fn(),
      isAllowedExtension: vi.fn(),
      matchesPattern: vi.fn(),
      loadYamlConfig: vi.fn()
    };
    
    scanner = new FileScanner(mockYamlConfigManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create FileScanner with YamlConfigManager', () => {
      expect(scanner).toBeInstanceOf(FileScanner);
    });
  });

  describe('scanForClaudeFiles', () => {
    beforeEach(() => {
      // Default config mock
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          includePaths: []
        },
        logging: {
          verboseFileLoading: false
        }
      });
    });

    it('should scan with includePaths from config', async () => {
      const config = {
        fileSettings: {
          includePaths: ['./src', './examples']
        },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const mockEntries = [
        { name: 'test.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.stat.mockImplementation((filePath) => {
        const pathStr = filePath as string;
        return Promise.resolve({
          isDirectory: () => pathStr.includes('/src') || pathStr.includes('/examples'),
          isFile: () => pathStr.includes('test.md')
        } as any);
      });
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      await scanner.scanForClaudeFiles();

      expect(mockedFs.stat).toHaveBeenCalledWith(expect.stringContaining('src'));
      expect(mockedFs.stat).toHaveBeenCalledWith(expect.stringContaining('examples'));
    });

    it('should handle absolute includePaths', async () => {
      const config = {
        fileSettings: {
          includePaths: ['/absolute/path']
        },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockedFs.stat.mockResolvedValue({
        isDirectory: () => true
      } as any);
      mockedFs.readdir.mockResolvedValue([]);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);

      await scanner.scanForClaudeFiles();

      expect(mockedFs.stat).toHaveBeenCalledWith('/absolute/path');
    });

    it('should skip non-existent includePaths without verbose logging', async () => {
      const config = {
        fileSettings: {
          includePaths: ['./non-existent']
        },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockedFs.stat.mockRejectedValue(new Error('Directory not found'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();

      const result = await scanner.scanForClaudeFiles();

      expect(result).toEqual([]);
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log non-existent includePaths with verbose logging', async () => {
      const config = {
        fileSettings: {
          includePaths: ['./non-existent']
        },
        logging: { verboseFileLoading: true }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockedFs.stat.mockRejectedValue(new Error('Directory not found'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();

      await scanner.scanForClaudeFiles();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Directory not found:'));
      consoleSpy.mockRestore();
    });

    it('should fallback to targetPath when no includePaths', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockedFs.readdir.mockResolvedValue([]);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);

      await scanner.scanForClaudeFiles('/custom/path');

      expect(mockYamlConfigManager.shouldIncludeDirectory).toHaveBeenCalledWith('/custom/path');
    });

    it('should handle targetPath scan errors without verbose logging', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockedFs.readdir.mockRejectedValue(new Error('Directory scan error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();

      const result = await scanner.scanForClaudeFiles();

      expect(result).toEqual([]);
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log targetPath scan errors with verbose logging', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: true }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockedFs.readdir.mockRejectedValue(new Error('Directory scan error'));
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      await scanner.scanForClaudeFiles('/test/path');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Directory access error:'), expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should sort results by path', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const mockEntries = [
        { name: 'z-file.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'a-file.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);
      
      const result = await scanner.scanForClaudeFiles();

      expect(result.length).toBeGreaterThanOrEqual(2);
      // Should be sorted alphabetically by path
      for (let i = 1; i < result.length; i++) {
        expect(result[i].path.localeCompare(result[i-1].path)).toBeGreaterThanOrEqual(0);
      }
    });

    it('should merge scan options from config and parameters', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        directoryScanning: {
          recursive: true,
          maxDepth: 5,
          includeHidden: true,
          followSymlinks: true
        },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockedFs.readdir.mockResolvedValue([]);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);

      const customOptions: ScanOptions = {
        maxDepth: 2,
        customPatterns: ['*.custom']
      };

      await scanner.scanForClaudeFiles('/test', customOptions);

      // The maxDepth from customOptions should override config
      expect(mockYamlConfigManager.shouldIncludeDirectory).toHaveBeenCalled();
    });
  });

  describe('scanDirectory private method (tested through scanForClaudeFiles)', () => {
    beforeEach(() => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { includePaths: [] },
        directoryScanning: { maxDepth: 2, recursive: true, includeHidden: false, followSymlinks: false },
        logging: { verboseFileLoading: false }
      });
    });

    it('should respect maxDepth limit', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        directoryScanning: { maxDepth: 1 },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      // Setup nested directory structure
      const rootEntries = [
        { name: 'subdir', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }
      ];
      const subEntries = [
        { name: 'deep-file.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockImplementation((dirPath) => {
        if ((dirPath as string).includes('subdir')) {
          return Promise.resolve(subEntries as any);
        }
        return Promise.resolve(rootEntries as any);
      });
      
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);

      await scanner.scanForClaudeFiles();

      // Should have been called for root but not for subdirectory due to maxDepth
      expect(mockYamlConfigManager.shouldIncludeDirectory).toHaveBeenCalledWith(process.cwd());
    });

    it('should skip directories not included by shouldIncludeDirectory', async () => {
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(false);
      
      mockedFs.readdir.mockResolvedValue([
        { name: 'test.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ]);

      const result = await scanner.scanForClaudeFiles();

      expect(result).toEqual([]);
      expect(mockedFs.readdir).not.toHaveBeenCalled();
    });

    it('should skip hidden files when includeHidden is false', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        directoryScanning: { includeHidden: false },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const mockEntries = [
        { name: 'visible.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: '.hidden.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      const result = await scanner.scanForClaudeFiles();

      // Should only process visible files
      expect(result.some(file => file.name === 'visible.md')).toBe(true);
      expect(result.some(file => file.name === '.hidden.md')).toBe(false);
    });

    it('should include hidden files when includeHidden is true', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        directoryScanning: { includeHidden: true },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const mockEntries = [
        { name: '.hidden.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      const result = await scanner.scanForClaudeFiles();

      expect(result.some(file => file.name === '.hidden.md')).toBe(true);
    });

    it('should skip excluded files', async () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      });
      
      const mockEntries = [
        { name: 'included.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'excluded.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockImplementation((path) => 
        path.includes('excluded.md')
      );
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      const result = await scanner.scanForClaudeFiles();

      expect(result.some(file => file.name === 'included.md')).toBe(true);
      expect(result.some(file => file.name === 'excluded.md')).toBe(false);
    });

    it('should handle recursive directory scanning', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        directoryScanning: { recursive: true, maxDepth: 3 },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const rootEntries = [
        { name: 'root.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'subdir', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }
      ];
      const subEntries = [
        { name: 'sub.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockImplementation((dirPath) => {
        if ((dirPath as string).includes('subdir')) {
          return Promise.resolve(subEntries as any);
        }
        return Promise.resolve(rootEntries as any);
      });
      
      mockedFs.stat.mockImplementation((filePath) => {
        const pathStr = filePath as string;
        return Promise.resolve({
          isFile: () => pathStr.endsWith('.md'),
          isDirectory: () => pathStr.includes('subdir') && !pathStr.endsWith('.md')
        } as any);
      });
      
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      const result = await scanner.scanForClaudeFiles();

      expect(result.length).toBeGreaterThan(0);
      expect(mockYamlConfigManager.shouldIncludeDirectory).toHaveBeenCalledWith(expect.stringContaining('subdir'));
    });

    it('should skip recursive scanning when recursive is false', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        directoryScanning: { recursive: false },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const mockEntries = [
        { name: 'root.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'subdir', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockImplementation((filePath) => {
        const pathStr = filePath as string;
        return Promise.resolve({
          isFile: () => pathStr.endsWith('.md'),
          isDirectory: () => pathStr.includes('subdir')
        } as any);
      });
      
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      await scanner.scanForClaudeFiles();

      // Should only call shouldIncludeDirectory for root, not subdirectory
      expect(mockYamlConfigManager.shouldIncludeDirectory).toHaveBeenCalledTimes(1);
    });

    it('should handle symbolic links when followSymlinks is true', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        directoryScanning: { followSymlinks: true },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const mockEntries = [
        { name: 'symlink.md', isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      const result = await scanner.scanForClaudeFiles();

      expect(result.some(file => file.name === 'symlink.md')).toBe(true);
    });

    it('should skip symbolic links when followSymlinks is false', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        directoryScanning: { followSymlinks: false },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const mockEntries = [
        { name: 'regular.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'symlink.md', isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      const result = await scanner.scanForClaudeFiles();

      expect(result.some(file => file.name === 'regular.md')).toBe(true);
      expect(result.some(file => file.name === 'symlink.md')).toBe(false);
    });

    it('should skip files with disallowed extensions', async () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      });
      
      const mockEntries = [
        { name: 'allowed.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'disallowed.txt', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockImplementation((path) => 
        path.endsWith('.md')
      );

      const result = await scanner.scanForClaudeFiles();

      expect(result.some(file => file.name === 'allowed.md')).toBe(true);
      expect(result.some(file => file.name === 'disallowed.txt')).toBe(false);
    });

    it('should handle directory read errors with verbose logging', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: true }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockedFs.readdir.mockRejectedValue(new Error('Permission denied'));
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const result = await scanner.scanForClaudeFiles();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Directory access error:'), expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should handle directory read errors without verbose logging', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockedFs.readdir.mockRejectedValue(new Error('Permission denied'));
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const result = await scanner.scanForClaudeFiles();

      expect(result).toEqual([]);
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('createFileInfo private method (tested through scanForClaudeFiles)', () => {
    beforeEach(() => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { 
          includePaths: [],
          configFiles: {
            claude: 'CLAUDE.md',
            behavior: '*-behavior.md',
            custom: '*.config.md'
          }
        },
        logging: { verboseFileLoading: false }
      });
    });

    it('should create FileInfo for CLAUDE config files', async () => {
      const mockEntries = [
        { name: 'CLAUDE.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'CLAUDE.md' && pattern === 'CLAUDE.md';
      });

      const result = await scanner.scanForClaudeFiles();

      expect(result.length).toBeGreaterThan(0);
      const claudeFile = result.find(file => file.name === 'CLAUDE.md');
      expect(claudeFile).toBeDefined();
      expect(claudeFile?.isClaudeConfig).toBe(true);
      expect(claudeFile?.extension).toBe('.md');
      expect(claudeFile?.matchedPattern).toBe('claude:CLAUDE.md');
    });

    it('should create FileInfo for behavior files', async () => {
      const mockEntries = [
        { name: 'lum-behavior.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'lum-behavior.md' && pattern === '*-behavior.md';
      });

      const result = await scanner.scanForClaudeFiles();

      expect(result.length).toBeGreaterThan(0);
      const behaviorFile = result.find(file => file.name === 'lum-behavior.md');
      expect(behaviorFile).toBeDefined();
      expect(behaviorFile?.isClaudeConfig).toBe(true);
      expect(behaviorFile?.matchedPattern).toBe('behavior:*-behavior.md');
    });

    it('should create FileInfo for custom config files', async () => {
      const mockEntries = [
        { name: 'test.config.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'test.config.md' && pattern === '*.config.md';
      });

      const result = await scanner.scanForClaudeFiles();

      expect(result.length).toBeGreaterThan(0);
      const customFile = result.find(file => file.name === 'test.config.md');
      expect(customFile).toBeDefined();
      expect(customFile?.isClaudeConfig).toBe(true);
      expect(customFile?.matchedPattern).toBe('custom:*.config.md');
    });

    it('should create FileInfo for non-config files', async () => {
      const mockEntries = [
        { name: 'regular.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);
      mockYamlConfigManager.matchesPattern.mockReturnValue(false);

      const result = await scanner.scanForClaudeFiles();

      expect(result.length).toBeGreaterThan(0);
      const regularFile = result.find(file => file.name === 'regular.md');
      expect(regularFile).toBeDefined();
      expect(regularFile?.isClaudeConfig).toBe(false);
      expect(regularFile?.matchedPattern).toBeUndefined();
    });

    it('should handle file stat errors and return null', async () => {
      const mockEntries = [
        { name: 'error-file.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockImplementation((filePath) => {
        if ((filePath as string).includes('error-file.md')) {
          return Promise.reject(new Error('Stat error'));
        }
        return Promise.resolve({ isFile: () => true } as any);
      });
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      const result = await scanner.scanForClaudeFiles();

      // Should not include the error file
      expect(result.some(file => file.name === 'error-file.md')).toBe(false);
    });

    it('should handle non-file entries and return null', async () => {
      const mockEntries = [
        { name: 'not-a-file', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => false } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      const result = await scanner.scanForClaudeFiles();

      // Should not include non-files
      expect(result.some(file => file.name === 'not-a-file')).toBe(false);
    });

    it('should handle missing configFiles in config', async () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      });
      
      const mockEntries = [
        { name: 'test.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);

      const result = await scanner.scanForClaudeFiles();

      expect(result.length).toBeGreaterThan(0);
      const testFile = result.find(file => file.name === 'test.md');
      expect(testFile?.isClaudeConfig).toBe(false);
      expect(testFile?.matchedPattern).toBeUndefined();
    });

    it('should handle custom patterns from options', async () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { 
          includePaths: [],
          configFiles: {
            claude: 'CLAUDE.md'
          }
        },
        logging: { verboseFileLoading: false }
      });
      
      const mockEntries = [
        { name: 'custom.special', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockResolvedValue(mockEntries as any);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'custom.special' && pattern === '*.special';
      });

      const result = await scanner.scanForClaudeFiles(process.cwd(), {
        customPatterns: ['*.special']
      });

      expect(result.length).toBeGreaterThan(0);
      const customFile = result.find(file => file.name === 'custom.special');
      expect(customFile?.isClaudeConfig).toBe(true);
    });
  });

  describe('findFilesByPattern', () => {
    beforeEach(() => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      });
    });

    it('should return empty array when no files match pattern', async () => {
      // Simple test that covers the basic findFilesByPattern functionality
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      });
      
      mockedFs.readdir.mockResolvedValue([]);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);

      const result = await scanner.findFilesByPattern('*.nonexistent');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should use default paths when no search paths provided', async () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { includePaths: ['./default'] },
        logging: { verboseFileLoading: false }
      });
      
      mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockedFs.readdir.mockResolvedValue([]);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);

      await scanner.findFilesByPattern('*.test');

      expect(mockedFs.stat).toHaveBeenCalledWith(expect.stringContaining('default'));
    });

    it('should use process.cwd() when no includePaths in config', async () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {},
        logging: { verboseFileLoading: false }
      });
      
      mockedFs.readdir.mockResolvedValue([]);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);

      await scanner.findFilesByPattern('*.test');

      expect(mockYamlConfigManager.shouldIncludeDirectory).toHaveBeenCalledWith(process.cwd());
    });

    it('should use provided search paths', async () => {
      // When searchPaths are provided, they should be used directly in the for loop
      // But scanForClaudeFiles will still respect the config's includePaths if they exist
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { includePaths: [] }, // No includePaths in config
        logging: { verboseFileLoading: false }
      });
      
      mockedFs.readdir.mockResolvedValue([]);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);

      await scanner.findFilesByPattern('*.test', ['/custom/path']);

      expect(mockYamlConfigManager.shouldIncludeDirectory).toHaveBeenCalledWith('/custom/path');
    });

    it('should handle search errors with verbose logging', async () => {
      const config = {
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: true }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockedFs.readdir.mockRejectedValue(new Error('Search error'));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const result = await scanner.findFilesByPattern('*.test', ['./error-path']);

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Directory access error:'), expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should handle search errors without verbose logging', async () => {
      const config = {
        fileSettings: { includePaths: ['./error-path'] },
        logging: { verboseFileLoading: false }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      mockedFs.readdir.mockRejectedValue(new Error('Search error'));
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const result = await scanner.findFilesByPattern('*.test');

      expect(result).toEqual([]);
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should aggregate files from multiple search paths', async () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: { includePaths: [] }, // No includePaths in config
        logging: { verboseFileLoading: false }
      });
      
      const path1Entries = [
        { name: 'file1.test', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      const path2Entries = [
        { name: 'file2.test', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
      ];
      
      mockedFs.readdir.mockImplementation((dirPath) => {
        if ((dirPath as string).includes('path1')) {
          return Promise.resolve(path1Entries as any);
        } else if ((dirPath as string).includes('path2')) {
          return Promise.resolve(path2Entries as any);
        }
        return Promise.resolve([]);
      });
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      mockYamlConfigManager.shouldIncludeDirectory.mockReturnValue(true);
      mockYamlConfigManager.isExcluded.mockReturnValue(false);
      mockYamlConfigManager.isAllowedExtension.mockReturnValue(true);
      mockYamlConfigManager.matchesPattern.mockReturnValue(true);

      const result = await scanner.findFilesByPattern('*.test', ['/path1', '/path2']);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some(file => file.name === 'file1.test')).toBe(true);
      expect(result.some(file => file.name === 'file2.test')).toBe(true);
    });
  });

  describe('mergeScanOptions', () => {
    it('should use default options when no config provided', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({});
      
      const result = (scanner as any).mergeScanOptions({}, undefined);
      
      expect(result.recursive).toBe(true);
      expect(result.maxDepth).toBe(3);
      expect(result.includeHidden).toBe(false);
      expect(result.followSymlinks).toBe(false);
      expect(result.customPatterns).toEqual([]);
    });

    it('should merge config with default options', () => {
      const config = {
        directoryScanning: {
          recursive: false,
          maxDepth: 5,
          includeHidden: true,
          followSymlinks: true
        }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const result = (scanner as any).mergeScanOptions(config, undefined);
      
      expect(result.recursive).toBe(false);
      expect(result.maxDepth).toBe(5);
      expect(result.includeHidden).toBe(true);
      expect(result.followSymlinks).toBe(true);
    });

    it('should override config options with provided options', () => {
      const config = {
        directoryScanning: {
          recursive: true,
          maxDepth: 3,
          includeHidden: false
        }
      };
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const options: ScanOptions = {
        recursive: false,
        maxDepth: 1,
        customPatterns: ['*.custom']
      };
      
      const result = (scanner as any).mergeScanOptions(config, options);
      
      expect(result.recursive).toBe(false);
      expect(result.maxDepth).toBe(1);
      expect(result.includeHidden).toBe(false); // from config
      expect(result.customPatterns).toEqual(['*.custom']);
    });

    it('should merge custom patterns from default and options', () => {
      const config = {};
      mockYamlConfigManager.getConfig.mockReturnValue(config);
      
      const options: ScanOptions = {
        customPatterns: ['*.pattern1', '*.pattern2']
      };
      
      const result = (scanner as any).mergeScanOptions(config, options);
      
      expect(result.customPatterns).toEqual(['*.pattern1', '*.pattern2']);
    });
  });

  describe('Static methods', () => {
    describe('normalizePath', () => {
      it('should normalize relative paths', () => {
        const result = FileScanner.normalizePath('./test/../file.md');
        expect(path.isAbsolute(result)).toBe(true);
      });

      it('should normalize absolute paths', () => {
        const inputPath = '/absolute/path/file.md';
        const result = FileScanner.normalizePath(inputPath);
        expect(result).toBe(path.resolve(inputPath));
      });
    });

    describe('fileExists', () => {
      it('should return true for existing files', async () => {
        mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
        
        const exists = await FileScanner.fileExists('/test/file.md');
        expect(exists).toBe(true);
      });

      it('should return false for non-existing files', async () => {
        mockedFs.stat.mockRejectedValue(new Error('File not found'));
        
        const exists = await FileScanner.fileExists('/test/nonexistent.md');
        expect(exists).toBe(false);
      });

      it('should return false for directories', async () => {
        mockedFs.stat.mockResolvedValue({ isFile: () => false } as any);
        
        const exists = await FileScanner.fileExists('/test/directory');
        expect(exists).toBe(false);
      });
    });

    describe('directoryExists', () => {
      it('should return true for existing directories', async () => {
        mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
        
        const exists = await FileScanner.directoryExists('/test/directory');
        expect(exists).toBe(true);
      });

      it('should return false for non-existing directories', async () => {
        mockedFs.stat.mockRejectedValue(new Error('Directory not found'));
        
        const exists = await FileScanner.directoryExists('/test/nonexistent');
        expect(exists).toBe(false);
      });

      it('should return false for files', async () => {
        mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);
        
        const exists = await FileScanner.directoryExists('/test/file.md');
        expect(exists).toBe(false);
      });
    });
  });

  describe('isClaudeConfigFile private method', () => {
    it('should return false when no configFiles in config', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {}
      });
      
      const options = { customPatterns: [] } as Required<ScanOptions>;
      const result = (scanner as any).isClaudeConfigFile('/test/file.md', options);
      
      expect(result).toBe(false);
    });

    it('should check against configured patterns', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          configFiles: {
            claude: 'CLAUDE.md',
            behavior: '*-behavior.md'
          }
        }
      });
      
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'test-behavior.md' && pattern === '*-behavior.md';
      });
      
      const options = { customPatterns: [] } as Required<ScanOptions>;
      const result = (scanner as any).isClaudeConfigFile('/path/test-behavior.md', options);
      
      expect(result).toBe(true);
      expect(mockYamlConfigManager.matchesPattern).toHaveBeenCalledWith('test-behavior.md', '*-behavior.md');
    });

    it('should include custom patterns from options', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          configFiles: {
            claude: 'CLAUDE.md'
          }
        }
      });
      
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'custom.special' && pattern === '*.special';
      });
      
      const options = { customPatterns: ['*.special'] } as Required<ScanOptions>;
      const result = (scanner as any).isClaudeConfigFile('/path/custom.special', options);
      
      expect(result).toBe(true);
      expect(mockYamlConfigManager.matchesPattern).toHaveBeenCalledWith('custom.special', '*.special');
    });

    it('should filter out falsy patterns', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          configFiles: {
            claude: 'CLAUDE.md',
            behavior: null,
            custom: undefined
          }
        }
      });
      
      mockYamlConfigManager.matchesPattern.mockReturnValue(false);
      
      const options = { customPatterns: ['*.valid'] } as Required<ScanOptions>;
      (scanner as any).isClaudeConfigFile('/path/test.md', options);
      
      // Should only call matchesPattern with valid patterns
      expect(mockYamlConfigManager.matchesPattern).toHaveBeenCalledWith('test.md', 'CLAUDE.md');
      expect(mockYamlConfigManager.matchesPattern).toHaveBeenCalledWith('test.md', '*.valid');
    });
  });

  describe('getMatchedPattern private method', () => {
    it('should return undefined when no configFiles', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {}
      });
      
      const result = (scanner as any).getMatchedPattern('/test/file.md');
      expect(result).toBeUndefined();
    });

    it('should return matched claude pattern', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          configFiles: {
            claude: 'CLAUDE.md',
            behavior: '*-behavior.md'
          }
        }
      });
      
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'CLAUDE.md' && pattern === 'CLAUDE.md';
      });
      
      const result = (scanner as any).getMatchedPattern('/path/CLAUDE.md');
      expect(result).toBe('claude:CLAUDE.md');
    });

    it('should return matched behavior pattern', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          configFiles: {
            claude: 'CLAUDE.md',
            behavior: '*-behavior.md'
          }
        }
      });
      
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'test-behavior.md' && pattern === '*-behavior.md';
      });
      
      const result = (scanner as any).getMatchedPattern('/path/test-behavior.md');
      expect(result).toBe('behavior:*-behavior.md');
    });

    it('should return matched custom pattern', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          configFiles: {
            claude: 'CLAUDE.md',
            custom: '*.config.md'
          }
        }
      });
      
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'test.config.md' && pattern === '*.config.md';
      });
      
      const result = (scanner as any).getMatchedPattern('/path/test.config.md');
      expect(result).toBe('custom:*.config.md');
    });

    it('should return first matching pattern', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          configFiles: {
            claude: '*.md',
            behavior: '*-behavior.md'
          }
        }
      });
      
      mockYamlConfigManager.matchesPattern.mockReturnValue(true);
      
      const result = (scanner as any).getMatchedPattern('/path/test-behavior.md');
      expect(result).toBe('claude:*.md'); // First pattern wins
    });

    it('should return undefined when no patterns match', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          configFiles: {
            claude: 'CLAUDE.md',
            behavior: '*-behavior.md'
          }
        }
      });
      
      mockYamlConfigManager.matchesPattern.mockReturnValue(false);
      
      const result = (scanner as any).getMatchedPattern('/path/nomatch.txt');
      expect(result).toBeUndefined();
    });

    it('should filter out falsy patterns', () => {
      mockYamlConfigManager.getConfig.mockReturnValue({
        fileSettings: {
          configFiles: {
            claude: null,
            behavior: undefined,
            custom: '*.config.md'
          }
        }
      });
      
      mockYamlConfigManager.matchesPattern.mockImplementation((fileName, pattern) => {
        return fileName === 'test.config.md' && pattern === '*.config.md';
      });
      
      const result = (scanner as any).getMatchedPattern('/path/test.config.md');
      expect(result).toBe('custom:*.config.md');
      
      // Should only call matchesPattern with valid patterns
      expect(mockYamlConfigManager.matchesPattern).toHaveBeenCalledWith('test.config.md', '*.config.md');
      expect(mockYamlConfigManager.matchesPattern).toHaveBeenCalledTimes(1);
    });
  });
});