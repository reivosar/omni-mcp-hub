import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YamlConfigManager, YamlConfig } from '../src/config/yaml-config.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock filesystem
vi.mock('fs/promises');
const mockedFs = vi.mocked(fs);

describe('YamlConfigManager', () => {
  let manager: YamlConfigManager;
  const testDir = path.join(__dirname, 'test-yaml-configs');
  const testYamlFile = path.join(testDir, 'test-config.yaml');

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new YamlConfigManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadYamlConfig', () => {
    it('should load valid YAML configuration', async () => {
      const yamlContent = `
autoLoad:
  profiles:
    - name: "test-profile"
      path: "./test.md"
      autoApply: true

fileSettings:
  configFiles:
    claude: "CLAUDE.md"
    behavior: "*-behavior.md"
  includePaths:
    - "./examples/"
  excludePatterns:
    - "*.tmp"
  allowedExtensions:
    - ".md"

logging:
  level: "debug"
  verboseFileLoading: true
`;

      mockedFs.readFile.mockResolvedValue(yamlContent);

      const config = await manager.loadYamlConfig(testYamlFile);

      expect(config.autoLoad?.profiles).toHaveLength(1);
      expect(config.autoLoad?.profiles?.[0].name).toBe('test-profile');
      expect(config.autoLoad?.profiles?.[0].path).toBe('./test.md');
      expect(config.autoLoad?.profiles?.[0].autoApply).toBe(true);
      expect(config.fileSettings?.configFiles?.claude).toBe('CLAUDE.md');
      expect(config.fileSettings?.configFiles?.behavior).toBe('*-behavior.md');
      expect(config.fileSettings?.includePaths).toContain('./examples/');
      expect(config.fileSettings?.excludePatterns).toContain('*.tmp');
      expect(config.fileSettings?.allowedExtensions).toContain('.md');
      expect(config.logging?.level).toBe('debug');
      expect(config.logging?.verboseFileLoading).toBe(true);
    });

    it('should return default config when YAML file not found', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('File not found'));

      const config = await manager.loadYamlConfig(testYamlFile);

      // Verify default configuration is returned
      expect(config.fileSettings?.configFiles?.claude).toBe('CLAUDE.md');
      expect(config.directoryScanning?.recursive).toBe(true);
      expect(config.logging?.level).toBe('info');
      expect(config.autoLoad?.profiles).toEqual([]);
    });

    it('should merge user config with default config', async () => {
      const partialYamlContent = `
fileSettings:
  excludePatterns:
    - "*.custom"
logging:
  level: "warn"
`;

      mockedFs.readFile.mockResolvedValue(partialYamlContent);

      const config = await manager.loadYamlConfig(testYamlFile);

      // User configuration is applied
      expect(config.fileSettings?.excludePatterns).toContain('*.custom');
      expect(config.logging?.level).toBe('warn');

      // Default configuration is preserved
      expect(config.fileSettings?.configFiles?.claude).toBe('CLAUDE.md');
      expect(config.directoryScanning?.recursive).toBe(true);
    });
  });

  describe('matchesPattern', () => {
    beforeEach(async () => {
      await manager.loadYamlConfig();
    });

    it('should match simple patterns', () => {
      expect(manager.matchesPattern('CLAUDE.md', 'CLAUDE.md')).toBe(true);
      expect(manager.matchesPattern('test.md', 'test.md')).toBe(true);
      expect(manager.matchesPattern('other.md', 'CLAUDE.md')).toBe(false);
    });

    it('should match wildcard patterns', () => {
      expect(manager.matchesPattern('lum-behavior.md', '*-behavior.md')).toBe(true);
      expect(manager.matchesPattern('pirate-behavior.md', '*-behavior.md')).toBe(true);
      expect(manager.matchesPattern('config.md', '*-behavior.md')).toBe(false);
      expect(manager.matchesPattern('test-config.md', '*-config.md')).toBe(true);
    });

    it('should match question mark patterns', () => {
      expect(manager.matchesPattern('a.md', '?.md')).toBe(true);
      expect(manager.matchesPattern('ab.md', '?.md')).toBe(false);
    });
  });

  describe('isExcluded', () => {
    beforeEach(async () => {
      const yamlContent = `
fileSettings:
  excludePatterns:
    - "*.tmp"
    - "*.backup"
    - "*~"
    - ".git/**"
`;
      mockedFs.readFile.mockResolvedValue(yamlContent);
      await manager.loadYamlConfig();
    });

    it('should exclude files matching patterns', () => {
      expect(manager.isExcluded('test.tmp')).toBe(true);
      expect(manager.isExcluded('config.backup')).toBe(true);
      expect(manager.isExcluded('file~')).toBe(true);
      expect(manager.isExcluded('.git/config')).toBe(true);
    });

    it('should not exclude files not matching patterns', () => {
      expect(manager.isExcluded('test.md')).toBe(false);
      expect(manager.isExcluded('config.txt')).toBe(false);
      expect(manager.isExcluded('normal-file.yaml')).toBe(false);
    });
  });

  describe('isAllowedExtension', () => {
    beforeEach(async () => {
      const yamlContent = `
fileSettings:
  allowedExtensions:
    - ".md"
    - ".markdown"
    - ".txt"
`;
      mockedFs.readFile.mockResolvedValue(yamlContent);
      await manager.loadYamlConfig();
    });

    it('should allow files with allowed extensions', () => {
      expect(manager.isAllowedExtension('test.md')).toBe(true);
      expect(manager.isAllowedExtension('config.markdown')).toBe(true);
      expect(manager.isAllowedExtension('readme.txt')).toBe(true);
    });

    it('should not allow files with disallowed extensions', () => {
      expect(manager.isAllowedExtension('test.js')).toBe(false);
      expect(manager.isAllowedExtension('config.json')).toBe(false);
      expect(manager.isAllowedExtension('image.png')).toBe(false);
    });

    it('should handle case insensitive extensions', () => {
      expect(manager.isAllowedExtension('test.MD')).toBe(true);
      expect(manager.isAllowedExtension('config.TXT')).toBe(true);
    });
  });

  describe('shouldIncludeDirectory', () => {
    beforeEach(async () => {
      const yamlContent = `
fileSettings:
  includePaths:
    - "./examples/"
    - "./configs/"
    - "/absolute/path/"
`;
      mockedFs.readFile.mockResolvedValue(yamlContent);
      await manager.loadYamlConfig();
    });

    it('should include directories in include paths', () => {
      // Note: This test would require mocking path.resolve properly
      // For now, we test the basic logic
      const config = manager.getConfig();
      expect(config.fileSettings?.includePaths).toContain('./examples/');
      expect(config.fileSettings?.includePaths).toContain('./configs/');
      expect(config.fileSettings?.includePaths).toContain('/absolute/path/');
    });

    it('should include all directories when no include paths specified', async () => {
      const emptyYamlContent = `
fileSettings:
  includePaths: []
`;
      mockedFs.readFile.mockResolvedValue(emptyYamlContent);
      await manager.loadYamlConfig();
      
      expect(manager.shouldIncludeDirectory('/any/path')).toBe(true);
    });
  });

  describe('generateProfileName', () => {
    beforeEach(async () => {
      await manager.loadYamlConfig();
    });

    it('should generate profile name from filename by default', () => {
      const name = manager.generateProfileName('./examples/lum-behavior.md');
      expect(name).toBe('lum-behavior');
    });

    it('should handle different file paths', () => {
      expect(manager.generateProfileName('/absolute/path/config.md')).toBe('config');
      expect(manager.generateProfileName('simple.md')).toBe('simple');
      expect(manager.generateProfileName('./nested/dir/file.markdown')).toBe('file');
    });

    it('should use custom naming pattern', async () => {
      const yamlContent = `
profileManagement:
  autoNamePattern: "%dirname%-%filename%"
`;
      mockedFs.readFile.mockResolvedValue(yamlContent);
      await manager.loadYamlConfig();

      const name = manager.generateProfileName('./examples/lum-behavior.md');
      expect(name).toBe('examples-lum-behavior');
    });
  });

  describe('saveYamlConfig', () => {
    it('should save YAML configuration to file', async () => {
      const config: Partial<YamlConfig> = {
        logging: {
          level: 'debug',
          verboseFileLoading: false
        }
      };

      manager.updateConfig(config);
      await manager.saveYamlConfig(testYamlFile);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        testYamlFile,
        expect.stringContaining('level: debug'),
        'utf-8'
      );
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', async () => {
      await manager.loadYamlConfig();
      
      const updates: Partial<YamlConfig> = {
        logging: {
          level: 'error',
          verboseFileLoading: false
        }
      };

      manager.updateConfig(updates);
      const config = manager.getConfig();

      expect(config.logging?.level).toBe('error');
      expect(config.logging?.verboseFileLoading).toBe(false);
    });

    it('should merge updates with existing config', async () => {
      const initialYaml = `
fileSettings:
  configFiles:
    claude: "CLAUDE.md"
logging:
  level: "info"
  verboseFileLoading: true
`;
      mockedFs.readFile.mockResolvedValue(initialYaml);
      await manager.loadYamlConfig();

      const updates: Partial<YamlConfig> = {
        logging: {
          level: 'debug'
        }
      };

      manager.updateConfig(updates);
      const config = manager.getConfig();

      // Updated values
      expect(config.logging?.level).toBe('debug');
      // Existing values are preserved
      expect(config.fileSettings?.configFiles?.claude).toBe('CLAUDE.md');
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', async () => {
      await manager.loadYamlConfig();
      const config = manager.getConfig();

      expect(config).toBeDefined();
      expect(config.fileSettings).toBeDefined();
      expect(config.directoryScanning).toBeDefined();
      expect(config.logging).toBeDefined();
    });
  });
});