import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

vi.mock('../../src/utils/path-resolver.js', () => ({
  PathResolver: {
    getInstance: vi.fn(() => ({
      resolveProfilePath: vi.fn((p: string) => path.resolve(p)),
      generateProfilePaths: vi.fn(() => ['./profile.md', './profile-behavior.md']),
      resolveAbsolutePath: vi.fn((p: string) => path.resolve(p))
    }))
  }
}));

vi.mock('../../src/utils/file-scanner.js', () => ({
  FileScanner: vi.fn().mockImplementation(() => ({
    findClaudeConfigFiles: vi.fn(() => []),
    scanDirectory: vi.fn(() => [])
  }))
}));

vi.mock('../../src/utils/path-security.js', () => ({
  safeResolve: vi.fn((p: string) => p),
  validatePathExists: vi.fn(() => true)
}));

// Import ClaudeConfigManager after mocking dependencies
import { ClaudeConfigManager } from '../../src/utils/claude-config.js';
import { ILogger } from '../../src/utils/logger.js';

describe('ClaudeConfigManager Coverage Tests', () => {
  let configManager: ClaudeConfigManager;
  let tempDir: string;
  let mockLogger: ILogger;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-config-test-'));
    
    const { createFileLogger } = await import('../../src/utils/logger.js');
    mockLogger = vi.mocked(createFileLogger)();
    
    configManager = new ClaudeConfigManager(mockLogger);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should create instance with logger', () => {
      expect(configManager).toBeDefined();
      expect(configManager).toBeInstanceOf(ClaudeConfigManager);
    });

    it('should create instance without logger', () => {
      const manager = new ClaudeConfigManager();
      expect(manager).toBeDefined();
    });
  });

  describe('loadClaudeConfig', () => {
    it('should load existing CLAUDE.md file', async () => {
      const configPath = path.join(tempDir, 'CLAUDE.md');
      const configContent = '# CLAUDE.md\n\n## Instructions\nTest instructions';
      fs.writeFileSync(configPath, configContent);

      const result = await configManager.loadClaudeConfig(configPath);
      
      expect(result).toBeDefined();
      expect(result.instructions).toBeDefined();
      expect(result._filePath).toBe(path.resolve(configPath));
    });

    it('should handle non-existent file', async () => {
      await expect(configManager.loadClaudeConfig('/non/existent/file.md')).rejects.toThrow();
    });

    it('should handle file read errors', async () => {
      const invalidPath = path.join('/root', 'no-permission.md');
      await expect(configManager.loadClaudeConfig(invalidPath)).rejects.toThrow();
    });

    it('should validate file extension', async () => {
      const txtPath = path.join(tempDir, 'config.txt');
      fs.writeFileSync(txtPath, 'content');
      
      const result = await configManager.loadClaudeConfig(txtPath);
      expect(result).toBeNull();
    });

    it('should handle empty files', async () => {
      const configPath = path.join(tempDir, 'empty.md');
      fs.writeFileSync(configPath, '');

      const result = await configManager.loadClaudeConfig(configPath);
      expect(result).toBeDefined();
      expect(result?.content).toBe('');
    });
  });

  describe('applyClaudeConfig', () => {
    it('should apply valid configuration', async () => {
      const config = {
        content: '# CLAUDE.md\n\n## Instructions\nApply these instructions',
        filePath: path.join(tempDir, 'apply-test.md'),
        profileName: 'apply-test'
      };

      const result = await configManager.applyClaudeConfig(config);
      
      expect(result.success).toBe(true);
      expect(result.appliedContent).toContain('Apply these instructions');
    });

    it('should handle application with options', async () => {
      const config = {
        content: '# Test Config\n\n## Instructions\nTest',
        filePath: path.join(tempDir, 'options-test.md'),
        profileName: 'options-test'
      };

      const options = {
        autoApply: false,
        dryRun: true,
        force: true
      };

      const result = await configManager.applyClaudeConfig(config, options);
      
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it('should handle empty content', async () => {
      const config = {
        content: '',
        filePath: path.join(tempDir, 'empty-apply.md'),
        profileName: 'empty-apply'
      };

      const result = await configManager.applyClaudeConfig(config);
      expect(result.success).toBe(true);
    });

    it('should validate required fields', async () => {
      const invalidConfig = {
        content: 'test',
        // missing filePath and profileName
      };

      const result = await configManager.applyClaudeConfig(invalidConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('generateProfileName', () => {
    it('should generate name from file path', () => {
      const filePath = '/path/to/my-profile.md';
      const name = configManager.generateProfileName(filePath);
      expect(name).toBe('my-profile');
    });

    it('should handle CLAUDE.md files', () => {
      const filePath = '/path/to/CLAUDE.md';
      const name = configManager.generateProfileName(filePath);
      expect(name).toContain('claude');
    });

    it('should handle files without extension', () => {
      const filePath = '/path/to/profile';
      const name = configManager.generateProfileName(filePath);
      expect(name).toBe('profile');
    });

    it('should sanitize special characters', () => {
      const filePath = '/path/to/my profile with spaces & symbols!.md';
      const name = configManager.generateProfileName(filePath);
      expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it('should handle empty paths', () => {
      const name = configManager.generateProfileName('');
      expect(name).toContain('claude-config');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config structure', () => {
      const config = {
        content: '# Valid Config',
        filePath: '/valid/path.md',
        profileName: 'valid-profile'
      };

      const isValid = configManager.validateConfig(config);
      expect(isValid).toBe(true);
    });

    it('should reject config with missing content', () => {
      const config = {
        filePath: '/path.md',
        profileName: 'profile'
      };

      const isValid = configManager.validateConfig(config);
      expect(isValid).toBe(false);
    });

    it('should reject config with missing filePath', () => {
      const config = {
        content: '# Config',
        profileName: 'profile'
      };

      const isValid = configManager.validateConfig(config);
      expect(isValid).toBe(false);
    });

    it('should reject config with missing profileName', () => {
      const config = {
        content: '# Config',
        filePath: '/path.md'
      };

      const isValid = configManager.validateConfig(config);
      expect(isValid).toBe(false);
    });

    it('should validate config with all optional fields', () => {
      const config = {
        content: '# Complete Config',
        filePath: '/complete/path.md',
        profileName: 'complete-profile',
        checksum: 'abc123',
        lastModified: new Date().toISOString(),
        metadata: { version: '1.0' }
      };

      const isValid = configManager.validateConfig(config);
      expect(isValid).toBe(true);
    });
  });

  describe('calculateChecksum', () => {
    it('should calculate consistent checksum for same content', () => {
      const content = '# Test Config\nSame content';
      const checksum1 = configManager.calculateChecksum(content);
      const checksum2 = configManager.calculateChecksum(content);
      
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA256 hex length
    });

    it('should generate different checksums for different content', () => {
      const content1 = '# Config 1';
      const content2 = '# Config 2';
      
      const checksum1 = configManager.calculateChecksum(content1);
      const checksum2 = configManager.calculateChecksum(content2);
      
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle empty content', () => {
      const checksum = configManager.calculateChecksum('');
      expect(checksum).toBeDefined();
      expect(checksum).toHaveLength(64);
    });

    it('should handle unicode content', () => {
      const unicodeContent = '# 配置文件\n测试内容 🚀';
      const checksum = configManager.calculateChecksum(unicodeContent);
      expect(checksum).toBeDefined();
      expect(checksum).toHaveLength(64);
    });
  });

  describe('parseMarkdownSections', () => {
    it('should parse standard markdown sections', () => {
      const content = `# Main Title
      
## Instructions
Test instructions content

## Memory
Important things to remember

## Custom Instructions
Custom behavior rules`;

      const sections = configManager.parseMarkdownSections(content);
      
      expect(sections).toBeDefined();
      expect(sections.instructions).toContain('Test instructions content');
      expect(sections.memory).toContain('Important things to remember');
      expect(sections.customInstructions).toContain('Custom behavior rules');
    });

    it('should handle missing sections gracefully', () => {
      const content = '# Title Only\nSome content without sections';
      const sections = configManager.parseMarkdownSections(content);
      
      expect(sections).toBeDefined();
      expect(sections.instructions).toBeDefined();
    });

    it('should handle empty content', () => {
      const sections = configManager.parseMarkdownSections('');
      expect(sections).toBeDefined();
    });

    it('should handle malformed markdown', () => {
      const malformedContent = '### No H1 or H2\nJust some content';
      const sections = configManager.parseMarkdownSections(malformedContent);
      expect(sections).toBeDefined();
    });

    it('should preserve code blocks and formatting', () => {
      const contentWithCode = `# Config

## Instructions
Here's a code example:
\`\`\`javascript
console.log("hello");
\`\`\`

And inline \`code\` too.`;

      const sections = configManager.parseMarkdownSections(contentWithCode);
      expect(sections.instructions).toContain('```javascript');
      expect(sections.instructions).toContain('`code`');
    });
  });

  describe('mergeConfigurations', () => {
    it('should merge two configurations', () => {
      const base = {
        content: '# Base Config\n\n## Instructions\nBase instructions',
        filePath: '/base.md',
        profileName: 'base'
      };

      const override = {
        content: '# Override Config\n\n## Memory\nOverride memory',
        filePath: '/override.md',
        profileName: 'override'
      };

      const merged = configManager.mergeConfigurations(base, override);
      
      expect(merged).toBeDefined();
      expect(merged.content).toContain('Base instructions');
      expect(merged.content).toContain('Override memory');
    });

    it('should handle empty configurations', () => {
      const base = {
        content: '',
        filePath: '/base.md',
        profileName: 'base'
      };

      const override = {
        content: '# Override',
        filePath: '/override.md',
        profileName: 'override'
      };

      const merged = configManager.mergeConfigurations(base, override);
      expect(merged).toBeDefined();
    });

    it('should prioritize override configuration', () => {
      const base = {
        content: '# Base\n\n## Instructions\nBase only',
        filePath: '/base.md',
        profileName: 'base'
      };

      const override = {
        content: '# Override\n\n## Instructions\nOverride wins',
        filePath: '/override.md',
        profileName: 'override'
      };

      const merged = configManager.mergeConfigurations(base, override);
      expect(merged.content).toContain('Override wins');
      expect(merged.content).not.toContain('Base only');
    });
  });

  describe('listAvailableConfigs', () => {
    it('should list config files in directory', async () => {
      // Create test files
      const config1Path = path.join(tempDir, 'config1.md');
      const config2Path = path.join(tempDir, 'config2.md');
      
      fs.writeFileSync(config1Path, '# Config 1');
      fs.writeFileSync(config2Path, '# Config 2');

      const configs = await configManager.listAvailableConfigs(tempDir);
      
      expect(configs).toHaveLength(2);
      expect(configs[0].profileName).toContain('config1');
      expect(configs[1].profileName).toContain('config2');
    });

    it('should handle empty directories', async () => {
      // Create an empty directory
      const emptyDir = path.join(tempDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });

      const configs = await configManager.listAvailableConfigs(emptyDir);
      expect(configs).toHaveLength(0);
    });

    it('should handle non-existent directories', async () => {
      const configs = await configManager.listAvailableConfigs('/non/existent/dir');
      expect(configs).toHaveLength(0);
    });
  });

  describe('getConfigMetadata', () => {
    it('should extract metadata from config', async () => {
      const configPath = path.join(tempDir, 'metadata-test.md');
      const content = '# Config with metadata\n\n## Instructions\nTest';
      fs.writeFileSync(configPath, content);

      const metadata = await configManager.getConfigMetadata(configPath);
      
      expect(metadata).toBeDefined();
      expect(metadata.filePath).toBe(configPath);
      expect(metadata.checksum).toBeDefined();
      expect(metadata.size).toBeGreaterThan(0);
      expect(metadata.lastModified).toBeDefined();
    });

    it('should handle non-existent files for metadata', async () => {
      const metadata = await configManager.getConfigMetadata('/non/existent.md');
      expect(metadata).toBeNull();
    });
  });

  describe('exportConfiguration', () => {
    it('should export configuration to JSON', async () => {
      const config = {
        content: '# Export Test',
        filePath: path.join(tempDir, 'export-test.md'),
        profileName: 'export-test'
      };

      const exportPath = path.join(tempDir, 'exported.json');
      const result = await configManager.exportConfiguration(config, exportPath);
      
      expect(result).toBe(true);
      expect(fs.existsSync(exportPath)).toBe(true);
      
      const exported = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(exported.profileName).toBe('export-test');
    });

    it('should handle export errors gracefully', async () => {
      const config = {
        content: '# Test',
        filePath: '/test.md',
        profileName: 'test'
      };

      const invalidPath = '/root/no-permission/export.json';
      const result = await configManager.exportConfiguration(config, invalidPath);
      expect(result).toBe(false);
    });
  });

  describe('importConfiguration', () => {
    it('should import configuration from JSON', async () => {
      const exportData = {
        content: '# Imported Config',
        filePath: '/imported.md',
        profileName: 'imported-profile',
        checksum: 'abc123'
      };

      const importPath = path.join(tempDir, 'import.json');
      fs.writeFileSync(importPath, JSON.stringify(exportData));

      const config = await configManager.importConfiguration(importPath);
      
      expect(config).toBeDefined();
      expect(config?.profileName).toBe('imported-profile');
      expect(config?.content).toContain('Imported Config');
    });

    it('should handle invalid JSON files', async () => {
      const invalidJsonPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidJsonPath, 'invalid json content');

      const config = await configManager.importConfiguration(invalidJsonPath);
      expect(config).toBeNull();
    });

    it('should handle non-existent import files', async () => {
      const config = await configManager.importConfiguration('/non/existent.json');
      expect(config).toBeNull();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle concurrent operations safely', async () => {
      const configPath = path.join(tempDir, 'concurrent.md');
      fs.writeFileSync(configPath, '# Concurrent Test');

      const promises = Array(5).fill(null).map(() => 
        configManager.loadClaudeConfig(configPath)
      );

      const results = await Promise.all(promises);
      expect(results.every(r => r !== null)).toBe(true);
    });

    it('should handle very large files', async () => {
      const largePath = path.join(tempDir, 'large.md');
      const largeContent = '# Large Config\n' + 'x'.repeat(10000);
      fs.writeFileSync(largePath, largeContent);

      const config = await configManager.loadClaudeConfig(largePath);
      expect(config).toBeDefined();
      expect(config?.content.length).toBeGreaterThan(10000);
    });

    it('should sanitize file paths for security', () => {
      const maliciousPath = '../../../etc/passwd';
      const sanitized = (configManager as ClaudeConfigManager & { sanitizePath: (path: string) => string }).sanitizePath(maliciousPath);
      expect(sanitized).not.toContain('..');
    });

    it('should validate content structure', () => {
      const validContent = '# Valid\n\n## Instructions\nContent';
      const isValid = (configManager as ClaudeConfigManager & { validateContentStructure: (content: unknown) => boolean }).validateContentStructure(validContent);
      expect(isValid).toBe(true);
    });

    it('should handle encoding issues', async () => {
      const configPath = path.join(tempDir, 'encoding.md');
      // Write file with specific encoding
      fs.writeFileSync(configPath, Buffer.from('# UTF-8 测试\n\n内容', 'utf-8'));

      const config = await configManager.loadClaudeConfig(configPath);
      expect(config).toBeDefined();
      expect(config?.content).toContain('测试');
    });
  });

  describe('Performance and Caching', () => {
    it('should cache frequently accessed configs', async () => {
      const configPath = path.join(tempDir, 'cached.md');
      fs.writeFileSync(configPath, '# Cached Config');

      // First load
      const config1 = await configManager.loadClaudeConfig(configPath);
      // Second load (should use cache)
      const config2 = await configManager.loadClaudeConfig(configPath);

      expect(config1).toEqual(config2);
    });

    it('should invalidate cache when file changes', async () => {
      const configPath = path.join(tempDir, 'changing.md');
      fs.writeFileSync(configPath, '# Original');

      const original = await configManager.loadClaudeConfig(configPath);
      
      // Change file
      setTimeout(() => {
        fs.writeFileSync(configPath, '# Changed');
      }, 10);

      await new Promise(resolve => setTimeout(resolve, 20));
      const changed = await configManager.loadClaudeConfig(configPath);

      expect(original?.content).not.toBe(changed?.content);
    });
  });
});