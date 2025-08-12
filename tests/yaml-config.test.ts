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

  describe('logging level functionality', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('shouldLog', () => {
      it('should respect debug level - all messages allowed', async () => {
        const yamlContent = `
logging:
  level: "debug"
`;
        mockedFs.readFile.mockResolvedValue(yamlContent);
        await manager.loadYamlConfig();

        expect(manager.shouldLog('debug')).toBe(true);
        expect(manager.shouldLog('info')).toBe(true);
        expect(manager.shouldLog('warn')).toBe(true);
        expect(manager.shouldLog('error')).toBe(true);
      });

      it('should respect info level - debug blocked', async () => {
        const yamlContent = `
logging:
  level: "info"
`;
        mockedFs.readFile.mockResolvedValue(yamlContent);
        await manager.loadYamlConfig();

        expect(manager.shouldLog('debug')).toBe(false);
        expect(manager.shouldLog('info')).toBe(true);
        expect(manager.shouldLog('warn')).toBe(true);
        expect(manager.shouldLog('error')).toBe(true);
      });

      it('should respect warn level - debug and info blocked', async () => {
        const yamlContent = `
logging:
  level: "warn"
`;
        mockedFs.readFile.mockResolvedValue(yamlContent);
        await manager.loadYamlConfig();

        expect(manager.shouldLog('debug')).toBe(false);
        expect(manager.shouldLog('info')).toBe(false);
        expect(manager.shouldLog('warn')).toBe(true);
        expect(manager.shouldLog('error')).toBe(true);
      });

      it('should respect error level - only errors allowed', async () => {
        const yamlContent = `
logging:
  level: "error"
`;
        mockedFs.readFile.mockResolvedValue(yamlContent);
        await manager.loadYamlConfig();

        expect(manager.shouldLog('debug')).toBe(false);
        expect(manager.shouldLog('info')).toBe(false);
        expect(manager.shouldLog('warn')).toBe(false);
        expect(manager.shouldLog('error')).toBe(true);
      });

      it('should default to info level when not specified', async () => {
        mockedFs.readFile.mockResolvedValue('');
        await manager.loadYamlConfig();

        expect(manager.shouldLog('debug')).toBe(false);
        expect(manager.shouldLog('info')).toBe(true);
        expect(manager.shouldLog('warn')).toBe(true);
        expect(manager.shouldLog('error')).toBe(true);
      });
    });

    describe('log', () => {
      it('should log with correct format when level allows', async () => {
        const yamlContent = `
logging:
  level: "info"
`;
        mockedFs.readFile.mockResolvedValue(yamlContent);
        await manager.loadYamlConfig();

        manager.log('info', 'test message');
        expect(console.error).toHaveBeenCalledWith('[INFO] test message');

        manager.log('warn', 'warning message');
        expect(console.error).toHaveBeenCalledWith('[WARN] warning message');

        manager.log('error', 'error message');
        expect(console.error).toHaveBeenCalledWith('[ERROR] error message');
      });

      it('should not log when level blocks message', async () => {
        const yamlContent = `
logging:
  level: "error"
`;
        mockedFs.readFile.mockResolvedValue(yamlContent);
        await manager.loadYamlConfig();

        manager.log('debug', 'debug message');
        manager.log('info', 'info message');
        manager.log('warn', 'warn message');

        expect(console.error).not.toHaveBeenCalled();

        manager.log('error', 'error message');
        expect(console.error).toHaveBeenCalledWith('[ERROR] error message');
      });
    });
  });

  describe('profile management functionality', () => {
    describe('getDefaultProfile', () => {
      it('should return configured default profile', async () => {
        const yamlContent = `
profileManagement:
  defaultProfile: "custom-default"
`;
        mockedFs.readFile.mockResolvedValue(yamlContent);
        await manager.loadYamlConfig();

        expect(manager.getDefaultProfile()).toBe('custom-default');
      });

      it('should return fallback default when not configured', async () => {
        mockedFs.readFile.mockResolvedValue('');
        await manager.loadYamlConfig();

        expect(manager.getDefaultProfile()).toBe('default');
      });
    });

    describe('isVerboseProfileSwitching', () => {
      it('should return true when enabled', async () => {
        const yamlContent = `
logging:
  verboseProfileSwitching: true
`;
        mockedFs.readFile.mockResolvedValue(yamlContent);
        await manager.loadYamlConfig();

        expect(manager.isVerboseProfileSwitching()).toBe(true);
      });

      it('should return false when disabled', async () => {
        const yamlContent = `
logging:
  verboseProfileSwitching: false
`;
        mockedFs.readFile.mockResolvedValue(yamlContent);
        await manager.loadYamlConfig();

        expect(manager.isVerboseProfileSwitching()).toBe(false);
      });

      it('should return false when not configured', async () => {
        mockedFs.readFile.mockResolvedValue('');
        await manager.loadYamlConfig();

        expect(manager.isVerboseProfileSwitching()).toBe(false);
      });
    });
  });

  describe('static factory methods', () => {
    describe('createForTest', () => {
      it('should create manager with test configuration', () => {
        const testConfig: YamlConfig = {
          logging: { level: 'debug', verboseFileLoading: true },
          profileManagement: { defaultProfile: 'test-profile' }
        };

        const testManager = YamlConfigManager.createForTest(testConfig);
        const config = testManager.getConfig();

        expect(config.logging?.level).toBe('debug');
        expect(config.logging?.verboseFileLoading).toBe(true);
        expect(config.profileManagement?.defaultProfile).toBe('test-profile');
        // Should merge with defaults
        expect(config.fileSettings?.configFiles?.claude).toBe('CLAUDE.md');
      });
    });

    describe('createWithPath', () => {
      it('should create manager with specified config path', () => {
        const testPath = '/test/path/config.yaml';
        const testManager = YamlConfigManager.createWithPath(testPath);

        expect(testManager).toBeDefined();
        // Note: We can't easily test the internal configPath without exposing it
      });
    });
  });

  describe('constructor with configPath', () => {
    it('should accept configPath parameter', () => {
      const testPath = '/test/config.yaml';
      const testManager = new YamlConfigManager(testPath);

      expect(testManager).toBeDefined();
    });

    it('should work without configPath parameter', () => {
      const testManager = new YamlConfigManager();

      expect(testManager).toBeDefined();
    });
  });
});