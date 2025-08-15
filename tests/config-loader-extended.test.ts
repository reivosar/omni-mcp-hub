import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigLoader, InitialProfile, McpConfig } from '../src/config/loader.js';
import { ClaudeConfigManager, ClaudeConfig } from '../src/utils/claude-config.js';
import { YamlConfigManager } from '../src/config/yaml-config.js';
import { FileScanner, FileInfo } from '../src/utils/file-scanner.js';
import { SilentLogger } from '../src/utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock modules
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../src/utils/behavior-generator.js', () => ({
  BehaviorGenerator: {
    generateInstructions: vi.fn().mockReturnValue('Generated behavior instructions')
  }
}));

describe('ConfigLoader Extended Tests', () => {
  let configLoader: ConfigLoader;
  let mockClaudeConfigManager: ClaudeConfigManager;
  let mockYamlConfigManager: YamlConfigManager;
  let mockFileScanner: FileScanner;
  let mockLogger: SilentLogger;

  beforeEach(() => {
    // Create mock ClaudeConfigManager
    mockClaudeConfigManager = {
      loadClaudeConfig: vi.fn(),
      parseClaude: vi.fn(),
      saveClaude: vi.fn()
    } as any;

    // Create mock YamlConfigManager
    mockYamlConfigManager = {
      loadYamlConfig: vi.fn(),
      getConfig: vi.fn(),
      log: vi.fn(),
      generateProfileName: vi.fn(),
      isVerboseProfileSwitching: vi.fn()
    } as any;

    // Create mock FileScanner
    mockFileScanner = {
      scanForClaudeFiles: vi.fn()
    } as any;

    mockLogger = new SilentLogger();

    configLoader = new ConfigLoader(mockClaudeConfigManager, mockYamlConfigManager, mockLogger);
    // Replace the file scanner with our mock
    (configLoader as any).fileScanner = mockFileScanner;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create ConfigLoader with provided managers', () => {
      expect(configLoader).toBeInstanceOf(ConfigLoader);
      expect(configLoader.getYamlConfigManager()).toBe(mockYamlConfigManager);
      expect(configLoader.getFileScanner()).toBe(mockFileScanner);
    });

    it('should create default YamlConfigManager when not provided', () => {
      const loader = new ConfigLoader(mockClaudeConfigManager);
      expect(loader).toBeInstanceOf(ConfigLoader);
      expect(loader.getYamlConfigManager()).toBeDefined();
    });
  });

  describe('loadInitialConfig', () => {
    it('should handle configuration loading errors gracefully', async () => {
      vi.mocked(mockYamlConfigManager.loadYamlConfig).mockRejectedValue(new Error('YAML load error'));

      const profiles = await configLoader.loadInitialConfig();
      
      expect(profiles.size).toBe(0);
    });

    it('should handle missing autoLoad.profiles gracefully', async () => {
      const mockYamlConfig = {
        fileSettings: { includePaths: [] },
        logging: { verboseFileLoading: false }
      };

      vi.mocked(mockYamlConfigManager.getConfig).mockReturnValue(mockYamlConfig);
      vi.mocked(mockYamlConfigManager.loadYamlConfig).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(mockFileScanner.scanForClaudeFiles).mockResolvedValue([]);

      const profiles = await configLoader.loadInitialConfig();
      
      expect(profiles.size).toBe(0);
      expect(mockYamlConfigManager.loadYamlConfig).toHaveBeenCalled();
    });
  });

  describe('loadLegacyConfig', () => {
    it('should handle missing .mcp-config.json gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file'));

      const activeProfiles = new Map<string, ClaudeConfig>();
      await (configLoader as any).loadLegacyConfig(activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
    });

    it('should handle invalid JSON in .mcp-config.json', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json content');

      const activeProfiles = new Map<string, ClaudeConfig>();
      await (configLoader as any).loadLegacyConfig(activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
    });

    it('should handle missing initialProfiles property', async () => {
      const invalidConfig = { otherProperty: 'value' };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

      const activeProfiles = new Map<string, ClaudeConfig>();
      await (configLoader as any).loadLegacyConfig(activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
    });

    it('should handle non-array initialProfiles', async () => {
      const invalidConfig = { initialProfiles: 'not an array' };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

      const activeProfiles = new Map<string, ClaudeConfig>();
      await (configLoader as any).loadLegacyConfig(activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
    });
  });

  describe('loadProfilesFromYaml', () => {
    it('should skip profiles with autoApply=false', async () => {
      const profiles = [
        { name: 'skip-profile', path: './skip.md', autoApply: false }
      ];

      const mockConfig = { logging: { verboseFileLoading: true } };
      vi.mocked(mockYamlConfigManager.getConfig).mockReturnValue(mockConfig);
      vi.mocked(mockYamlConfigManager.isVerboseProfileSwitching).mockReturnValue(true);

      const activeProfiles = new Map<string, ClaudeConfig>();
      await (configLoader as any).loadProfilesFromYaml(profiles, activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
      expect(mockYamlConfigManager.log).toHaveBeenCalledWith(
        'info', 
        "Skipping profile 'skip-profile' (autoApply: false): ./skip.md"
      );
    });

    it('should handle profile loading errors', async () => {
      const profiles = [
        { name: 'error-profile', path: './error.md', autoApply: true }
      ];

      const mockConfig = { logging: { verboseFileLoading: true } };
      vi.mocked(mockYamlConfigManager.getConfig).mockReturnValue(mockConfig);
      vi.mocked(mockYamlConfigManager.isVerboseProfileSwitching).mockReturnValue(false);
      vi.mocked(mockClaudeConfigManager.loadClaudeConfig).mockRejectedValue(new Error('Load failed'));

      const activeProfiles = new Map<string, ClaudeConfig>();

      await (configLoader as any).loadProfilesFromYaml(profiles, activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
    });

    it('should skip profiles with missing name or path', async () => {
      const profiles = [
        { name: '', path: './empty-name.md', autoApply: true },
        { name: 'no-path', path: '', autoApply: true },
        { name: 'valid', path: './valid.md', autoApply: true }
      ];

      const mockConfig = { logging: { verboseFileLoading: false } };
      const mockClaudeConfig: ClaudeConfig = { instructions: 'Valid profile' };

      vi.mocked(mockYamlConfigManager.getConfig).mockReturnValue(mockConfig);
      vi.mocked(mockYamlConfigManager.isVerboseProfileSwitching).mockReturnValue(false);
      vi.mocked(mockClaudeConfigManager.loadClaudeConfig).mockResolvedValue(mockClaudeConfig);

      const activeProfiles = new Map<string, ClaudeConfig>();
      await (configLoader as any).loadProfilesFromYaml(profiles, activeProfiles);
      
      expect(activeProfiles.size).toBe(1);
      expect(activeProfiles.has('valid')).toBe(true);
    });
  });

  describe('autoScanProfiles', () => {
    it('should skip auto-scan when no includePaths configured', async () => {
      const mockYamlConfig = {
        fileSettings: { includePaths: [] }
      };

      vi.mocked(mockYamlConfigManager.getConfig).mockReturnValue(mockYamlConfig);

      const activeProfiles = new Map<string, ClaudeConfig>();
      await (configLoader as any).autoScanProfiles(activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
      expect(mockFileScanner.scanForClaudeFiles).not.toHaveBeenCalled();
    });

    it('should skip non-CLAUDE config files', async () => {
      const mockYamlConfig = {
        fileSettings: { includePaths: ['./scan-path'] },
        logging: { verboseFileLoading: false }
      };

      const mockFileInfo: FileInfo = {
        path: '/full/path/to/regular.md',
        name: 'regular.md',
        extension: '.md',
        directory: '/full/path/to',
        isClaudeConfig: false
      };

      vi.mocked(mockYamlConfigManager.getConfig).mockReturnValue(mockYamlConfig);
      vi.mocked(mockFileScanner.scanForClaudeFiles).mockResolvedValue([mockFileInfo]);

      const activeProfiles = new Map<string, ClaudeConfig>();
      await (configLoader as any).autoScanProfiles(activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
      expect(mockClaudeConfigManager.loadClaudeConfig).not.toHaveBeenCalled();
    });

    it('should handle profile loading errors during auto-scan', async () => {
      const mockYamlConfig = {
        fileSettings: { includePaths: ['./scan-path'] },
        logging: { verboseFileLoading: true }
      };

      const mockFileInfo: FileInfo = {
        path: '/full/path/to/error.md',
        name: 'error.md',
        extension: '.md',
        directory: '/full/path/to',
        isClaudeConfig: true
      };

      vi.mocked(mockYamlConfigManager.getConfig).mockReturnValue(mockYamlConfig);
      vi.mocked(mockYamlConfigManager.generateProfileName).mockReturnValue('error-profile');
      vi.mocked(mockFileScanner.scanForClaudeFiles).mockResolvedValue([mockFileInfo]);
      vi.mocked(mockClaudeConfigManager.loadClaudeConfig).mockRejectedValue(new Error('Load error'));

      const activeProfiles = new Map<string, ClaudeConfig>();

      await (configLoader as any).autoScanProfiles(activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
    });

    it('should handle scanner errors', async () => {
      const mockYamlConfig = {
        fileSettings: { includePaths: ['./scan-path'] },
        logging: { verboseFileLoading: true }
      };

      vi.mocked(mockYamlConfigManager.getConfig).mockReturnValue(mockYamlConfig);
      vi.mocked(mockFileScanner.scanForClaudeFiles).mockRejectedValue(new Error('Scanner error'));

      const activeProfiles = new Map<string, ClaudeConfig>();

      await (configLoader as any).autoScanProfiles(activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
    });
  });

  describe('loadProfiles (legacy)', () => {
    it('should handle legacy profile loading errors', async () => {
      const profiles: InitialProfile[] = [
        { name: 'error-profile', path: './error.md' }
      ];

      vi.mocked(mockClaudeConfigManager.loadClaudeConfig).mockRejectedValue(new Error('Legacy load error'));

      const activeProfiles = new Map<string, ClaudeConfig>();

      await (configLoader as any).loadProfiles(profiles, activeProfiles);
      
      expect(activeProfiles.size).toBe(0);
    });

    it('should skip profiles with missing name or path in legacy mode', async () => {
      const profiles: InitialProfile[] = [
        { name: '', path: './empty-name.md' },
        { name: 'no-path', path: '' },
        { name: 'valid', path: './valid.md' }
      ];

      const mockClaudeConfig: ClaudeConfig = { instructions: 'Valid legacy profile' };
      vi.mocked(mockClaudeConfigManager.loadClaudeConfig).mockResolvedValue(mockClaudeConfig);

      const activeProfiles = new Map<string, ClaudeConfig>();
      await (configLoader as any).loadProfiles(profiles, activeProfiles);
      
      expect(activeProfiles.size).toBe(1);
      expect(activeProfiles.has('valid')).toBe(true);
    });
  });

  describe('Getter methods', () => {
    it('should return YamlConfigManager', () => {
      expect(configLoader.getYamlConfigManager()).toBe(mockYamlConfigManager);
    });

    it('should return FileScanner', () => {
      expect(configLoader.getFileScanner()).toBe(mockFileScanner);
    });
  });
});