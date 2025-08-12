import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigLoader } from '../src/config/loader.js';
import { ClaudeConfigManager } from '../src/utils/claude-config.js';
import { YamlConfigManager } from '../src/config/yaml-config.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../src/config/yaml-config.js');
vi.mock('../src/utils/file-scanner.js');

describe('ConfigLoader - Extended Tests', () => {
  let configLoader: ConfigLoader;
  let mockClaudeConfigManager: ClaudeConfigManager;
  let mockYamlConfigManager: any;
  let mockFileScanner: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock ClaudeConfigManager
    mockClaudeConfigManager = {
      loadClaudeConfig: vi.fn(),
    } as any;

    // Mock YamlConfigManager
    mockYamlConfigManager = {
      loadYamlConfig: vi.fn(),
      getConfig: vi.fn(),
      generateProfileName: vi.fn(),
      isVerboseProfileSwitching: vi.fn().mockReturnValue(false),
      log: vi.fn(),
    };
    vi.mocked(YamlConfigManager).mockImplementation(() => mockYamlConfigManager);

    // Mock FileScanner
    mockFileScanner = {
      scanForClaudeFiles: vi.fn(),
    };
    
    configLoader = new ConfigLoader(mockClaudeConfigManager);
    
    // Access private fileScanner and yamlConfigManager for testing
    (configLoader as any).fileScanner = mockFileScanner;
    (configLoader as any).yamlConfigManager = mockYamlConfigManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('YAML Configuration Loading', () => {
    it('should load YAML configuration successfully', async () => {
      const mockYamlConfig = {
        autoLoad: {
          profiles: [
            { name: 'test1', path: './test1.md', autoApply: true },
            { name: 'test2', path: './test2.md', autoApply: true } // Changed to true so both load
          ]
        },
        logging: { verboseFileLoading: true }
      };

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue({ title: 'Test Config' });

      const result = await configLoader.loadInitialConfig();

      expect(mockYamlConfigManager.loadYamlConfig).toHaveBeenCalled();
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledTimes(2);
      expect(result.size).toBe(2);
      expect(result.has('test1')).toBe(true);
      expect(result.has('test2')).toBe(true);
    });

    it('should skip profiles with autoApply: false', async () => {
      const mockYamlConfig = {
        autoLoad: {
          profiles: [
            { name: 'test1', path: './test1.md', autoApply: true },
            { name: 'test2', path: './test2.md', autoApply: false } // This should be skipped
          ]
        },
        logging: { verboseFileLoading: true }
      };

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue({ title: 'Test Config' });

      const result = await configLoader.loadInitialConfig();

      expect(mockYamlConfigManager.loadYamlConfig).toHaveBeenCalled();
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledTimes(1); // Only test1 should load
      expect(result.size).toBe(1);
      expect(result.has('test1')).toBe(true);
      expect(result.has('test2')).toBe(false); // test2 should be skipped
    });

    it('should handle YAML loading errors gracefully', async () => {
      mockYamlConfigManager.loadYamlConfig.mockRejectedValue(new Error('YAML load failed'));
      mockYamlConfigManager.getConfig.mockReturnValue({ autoLoad: {} });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await configLoader.loadInitialConfig();

      expect(result.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('Initial config loading error:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle profiles with relative and absolute paths', async () => {
      const mockYamlConfig = {
        autoLoad: {
          profiles: [
            { name: 'relative', path: './relative.md', autoApply: true },
            { name: 'absolute', path: '/absolute/path.md', autoApply: true }
          ]
        },
        logging: { verboseFileLoading: false }
      };

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue({ title: 'Test Config' });

      await configLoader.loadInitialConfig();

      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledWith(
        path.join(process.cwd(), './relative.md')
      );
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledWith('/absolute/path.md');
    });
  });

  describe('Auto Scan Functionality', () => {
    it('should auto-scan for CLAUDE.md files when includePaths is configured', async () => {
      const mockYamlConfig = {
        autoLoad: {},
        fileSettings: {
          includePaths: ['./examples/', './configs/']
        },
        profileManagement: {
          allowDuplicateNames: false
        },
        logging: { verboseFileLoading: true }
      };

      const mockScannedFiles = [
        { path: './examples/test1.md', isClaudeConfig: true },
        { path: './configs/test2.md', isClaudeConfig: true }
      ];

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);
      mockYamlConfigManager.generateProfileName.mockImplementation((path: string) => 
        path.replace(/.*\//, '').replace(/\.md$/, '')
      );
      mockFileScanner.scanForClaudeFiles.mockResolvedValue(mockScannedFiles);
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue({ title: 'Scanned Config' });

      const result = await configLoader.loadInitialConfig();

      expect(mockFileScanner.scanForClaudeFiles).toHaveBeenCalled();
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledTimes(2);
      expect(result.size).toBe(2);
    });

    it('should skip auto-scan when no includePaths configured', async () => {
      const mockYamlConfig = {
        autoLoad: {},
        fileSettings: {
          includePaths: []
        }
      };

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);

      await configLoader.loadInitialConfig();

      expect(mockFileScanner.scanForClaudeFiles).not.toHaveBeenCalled();
    });

    it('should handle auto-scan errors gracefully', async () => {
      const mockYamlConfig = {
        autoLoad: {},
        fileSettings: {
          includePaths: ['./examples/']
        },
        logging: { verboseFileLoading: true }
      };

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);
      mockFileScanner.scanForClaudeFiles.mockRejectedValue(new Error('Scan failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await configLoader.loadInitialConfig();

      expect(consoleSpy).toHaveBeenCalledWith('Auto-scan error:', expect.any(Error));
      expect(result.size).toBe(0);

      consoleSpy.mockRestore();
    });

    it('should respect allowDuplicateNames setting', async () => {
      const mockYamlConfig = {
        autoLoad: {
          profiles: [
            { name: 'duplicate', path: './existing.md', autoApply: true }
          ]
        },
        fileSettings: {
          includePaths: ['./examples/']
        },
        profileManagement: {
          allowDuplicateNames: false
        },
        logging: { verboseFileLoading: false }
      };

      const mockScannedFiles = [
        { path: './examples/another.md', isClaudeConfig: true }
      ];

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);
      mockYamlConfigManager.generateProfileName.mockReturnValue('duplicate'); // Same name as existing
      mockFileScanner.scanForClaudeFiles.mockResolvedValue(mockScannedFiles);
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue({ title: 'Config' });

      const result = await configLoader.loadInitialConfig();

      // Should have only the original profile, not the duplicate
      expect(result.size).toBe(1);
      expect(result.has('duplicate')).toBe(true);
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledTimes(1); // Only for the original profile
    });

    it('should allow duplicates when allowDuplicateNames is true', async () => {
      const mockYamlConfig = {
        autoLoad: {
          profiles: [
            { name: 'duplicate', path: './existing.md', autoApply: true }
          ]
        },
        fileSettings: {
          includePaths: ['./examples/']
        },
        profileManagement: {
          allowDuplicateNames: true
        },
        logging: { verboseFileLoading: false }
      };

      const mockScannedFiles = [
        { path: './examples/another.md', isClaudeConfig: true }
      ];

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);
      mockYamlConfigManager.generateProfileName.mockReturnValue('duplicate');
      mockFileScanner.scanForClaudeFiles.mockResolvedValue(mockScannedFiles);
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue({ title: 'Config' });

      const result = await configLoader.loadInitialConfig();

      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledTimes(2); // Both profiles loaded
    });
  });

  describe('Legacy Configuration Support', () => {
    it('should load legacy .mcp-config.json after YAML config', async () => {
      const mockYamlConfig = {
        autoLoad: {
          profiles: [
            { name: 'yaml-profile', path: './yaml.md', autoApply: true }
          ]
        }
      };

      const mockLegacyConfig = {
        initialProfiles: [
          { name: 'legacy-profile', path: './legacy.md' }
        ]
      };

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockLegacyConfig));
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue({ title: 'Config' });

      const result = await configLoader.loadInitialConfig();

      expect(result.size).toBe(2);
      expect(result.has('yaml-profile')).toBe(true);
      expect(result.has('legacy-profile')).toBe(true);
    });

    it('should continue when legacy config does not exist', async () => {
      const mockYamlConfig = {
        autoLoad: {
          profiles: [
            { name: 'yaml-profile', path: './yaml.md', autoApply: true }
          ]
        }
      };

      mockYamlConfigManager.loadYamlConfig.mockResolvedValue(mockYamlConfig);
      mockYamlConfigManager.getConfig.mockReturnValue(mockYamlConfig);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue({ title: 'Config' });

      const result = await configLoader.loadInitialConfig();

      expect(result.size).toBe(1);
      expect(result.has('yaml-profile')).toBe(true);
    });
  });

  describe('Utility Methods', () => {
    it('should return YamlConfigManager instance', () => {
      const yamlManager = configLoader.getYamlConfigManager();
      expect(yamlManager).toBe(mockYamlConfigManager);
    });

    it('should return FileScanner instance', () => {
      const fileScanner = configLoader.getFileScanner();
      expect(fileScanner).toBe(mockFileScanner);
    });
  });
});