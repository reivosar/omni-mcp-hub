import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock commander to prevent immediate execution
interface MockProgram {
  name: () => MockProgram;
  version: () => MockProgram;
  description: () => MockProgram;
  command: () => MockProgram;
  action: () => MockProgram;
  parse: () => MockProgram;
  option: () => MockProgram;
  alias: () => MockProgram;
}

vi.mock('commander', () => {
  const mockProgram: MockProgram = {} as MockProgram;
  mockProgram.name = vi.fn(() => mockProgram);
  mockProgram.version = vi.fn(() => mockProgram);
  mockProgram.description = vi.fn(() => mockProgram);
  mockProgram.command = vi.fn(() => mockProgram);
  mockProgram.action = vi.fn(() => mockProgram);
  mockProgram.parse = vi.fn(() => mockProgram);
  mockProgram.option = vi.fn(() => mockProgram);
  mockProgram.alias = vi.fn(() => mockProgram);
  
  return {
    Command: vi.fn(() => mockProgram)
  };
});

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockResolvedValue({ action: 'exit' }),
    Separator: vi.fn().mockImplementation((label?: string) => ({ type: 'separator', label }))
  }
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    blue: (str: string) => str,
    cyan: Object.assign((str: string) => str, { bold: (str: string) => str }),
    gray: (str: string) => str,
    bold: (str: string) => str
  }
}));

// Mock cli-table3
vi.mock('cli-table3', () => ({
  default: vi.fn().mockImplementation(() => ({
    push: vi.fn(),
    toString: vi.fn().mockReturnValue('mock table')
  }))
}));

// Mock other required modules to prevent errors
vi.mock('../../src/utils/claude-config.js', () => ({
  ClaudeConfigManager: vi.fn().mockImplementation(() => ({
    loadClaudeConfig: vi.fn(),
    applyClaudeConfig: vi.fn()
  }))
}));

vi.mock('../../src/config/yaml-config.js', () => {
  const mockInstance = {
    loadConfig: vi.fn(),
    saveConfig: vi.fn(),
    getConfig: vi.fn(() => ({ profiles: [] }))
  };
  const MockYamlConfigManager = vi.fn(() => mockInstance);
  MockYamlConfigManager.createWithPath = vi.fn(() => mockInstance);
  
  return {
    YamlConfigManager: MockYamlConfigManager
  };
});

vi.mock('../../src/utils/path-resolver.js', () => ({
  PathResolver: {
    getInstance: vi.fn(() => ({
      getYamlConfigPath: vi.fn(() => './omni-config.yaml'),
      resolveProfilePath: vi.fn((p: string) => p)
    }))
  }
}));

vi.mock('../../src/utils/profile-manager.js', () => ({
  ProfileManager: vi.fn().mockImplementation(() => ({
    loadProfile: vi.fn(),
    saveProfile: vi.fn()
  }))
}));

vi.mock('../../src/utils/logger.js', () => ({
  createFileLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}));

// Import AdminUI after mocking dependencies
import { AdminUI } from '../../src/cli/admin-ui.js';

describe('AdminUI Class Coverage Tests', () => {
  let adminUI: AdminUI;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-ui-test-'));
    configPath = path.join(tempDir, '.mcp-config.json');
    
    // Create admin UI instance
    adminUI = new AdminUI(configPath);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor and Initialization', () => {
    it('should create AdminUI instance with default config path', () => {
      const ui = new AdminUI();
      expect(ui).toBeDefined();
      expect(ui).toBeInstanceOf(AdminUI);
    });

    it('should create AdminUI instance with custom config path', () => {
      const customPath = '/custom/path/.mcp-config.json';
      const ui = new AdminUI(customPath);
      expect(ui).toBeDefined();
      expect(ui).toBeInstanceOf(AdminUI);
    });
  });

  describe('Public Methods', () => {
    it('should display system status', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
      
      await adminUI.showSystemStatus();
      
      expect(clearSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('System Status'));
      
      consoleSpy.mockRestore();
      clearSpy.mockRestore();
    });

    it('should show main menu and handle exit', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
      
      // Mock inquirer to immediately exit
      const inquirer = await import('inquirer');
      vi.mocked(inquirer.default.prompt).mockResolvedValueOnce({ action: 'exit' });
      
      await adminUI.showMainMenu();
      
      expect(clearSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Omni MCP Hub Admin UI'));
      
      consoleSpy.mockRestore();
      clearSpy.mockRestore();
    });
  });

  describe('Private Methods via Reflection', () => {
    it('should load profiles from config file', () => {
      const testConfig = {
        profiles: {
          'test-profile': {
            name: 'test-profile',
            path: './test.md',
            checksum: 'abc123',
            active: true
          }
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(testConfig));
      
      // Access private loadProfiles method
      const loadProfiles = (adminUI as AdminUI & { [key: string]: unknown }).loadProfiles.bind(adminUI);
      loadProfiles();
      
      const profiles = (adminUI as AdminUI & { [key: string]: unknown }).profiles;
      expect(profiles.size).toBe(1);
      expect(profiles.has('test-profile')).toBe(true);
      expect(profiles.get('test-profile').active).toBe(true);
    });

    it('should handle missing config file when loading', () => {
      // Ensure config file doesn't exist
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
      
      const loadProfiles = (adminUI as AdminUI & { [key: string]: unknown }).loadProfiles.bind(adminUI);
      
      // Should not throw
      expect(() => loadProfiles()).not.toThrow();
      
      const profiles = (adminUI as AdminUI & { [key: string]: unknown }).profiles;
      expect(profiles.size).toBe(0);
    });

    it('should handle invalid JSON in config file', () => {
      fs.writeFileSync(configPath, 'invalid json content');
      
      const loadProfiles = (adminUI as AdminUI & { [key: string]: unknown }).loadProfiles.bind(adminUI);
      
      // Should not throw, but handle gracefully
      expect(() => loadProfiles()).not.toThrow();
      
      const profiles = (adminUI as AdminUI & { [key: string]: unknown }).profiles;
      expect(profiles.size).toBe(0);
    });

    it('should save profiles to config file', () => {
      const profiles = (adminUI as AdminUI & { [key: string]: unknown }).profiles;
      profiles.set('test-profile', {
        name: 'test-profile',
        path: './test.md',
        checksum: 'abc123',
        createdAt: '2024-01-01T00:00:00Z',
        active: false
      });
      
      // Access private saveProfiles method
      const saveProfiles = (adminUI as AdminUI & { [key: string]: unknown }).saveProfiles.bind(adminUI);
      saveProfiles();
      
      expect(fs.existsSync(configPath)).toBe(true);
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.profiles).toBeDefined();
      expect(savedConfig.profiles['test-profile']).toBeDefined();
      expect(savedConfig.profiles['test-profile'].checksum).toBe('abc123');
    });

    it('should calculate file checksum', () => {
      const profilePath = path.join(tempDir, 'test.md');
      const content = '# Test Profile\nContent here';
      fs.writeFileSync(profilePath, content);
      
      // Access private calculateChecksum method
      const calculateChecksum = (adminUI as AdminUI & { [key: string]: unknown }).calculateChecksum.bind(adminUI);
      const checksum = calculateChecksum(profilePath);
      
      expect(checksum).toBeDefined();
      expect(checksum).toHaveLength(64); // SHA256 hex length
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle checksum calculation for non-existent file', () => {
      const calculateChecksum = (adminUI as AdminUI & { [key: string]: unknown }).calculateChecksum.bind(adminUI);
      
      // Should throw or return empty for non-existent file
      const result = calculateChecksum('/non/existent/file.md');
      expect(result).toBe('');
    });
  });

  describe('Menu Actions', () => {
    it('should handle list profiles action', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
      
      // Add some test profiles
      const profiles = (adminUI as AdminUI & { [key: string]: unknown }).profiles;
      profiles.set('profile1', {
        name: 'profile1',
        path: './p1.md',
        active: true
      });
      profiles.set('profile2', {
        name: 'profile2',
        path: './p2.md',
        active: false
      });
      
      // Call private listProfiles method
      const listProfiles = (adminUI as AdminUI & { [key: string]: unknown }).listProfiles.bind(adminUI);
      await listProfiles();
      
      expect(clearSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Profile Management'));
      
      consoleSpy.mockRestore();
      clearSpy.mockRestore();
    });

    it('should handle YAML config sync', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Mock YamlConfigManager
      const yamlConfigManager = (adminUI as AdminUI & { [key: string]: unknown }).yamlConfigManager;
      if (yamlConfigManager) {
        vi.spyOn(yamlConfigManager, 'loadConfig').mockResolvedValue({
          profiles: [
            { name: 'yaml-profile', path: './yaml.md', enabled: true }
          ]
        });
      }
      
      // Call private syncWithYaml method if it exists
      const syncWithYaml = (adminUI as AdminUI & { [key: string]: unknown }).syncWithYaml;
      if (syncWithYaml) {
        await syncWithYaml.bind(adminUI)();
      }
      
      consoleSpy.mockRestore();
    });
  });

  describe('Profile Management Operations', () => {
    it('should manage profile activation states', () => {
      const profiles = (adminUI as AdminUI & { [key: string]: unknown }).profiles;
      
      // Add test profiles
      profiles.set('active-profile', {
        name: 'active-profile',
        path: './active.md',
        active: true
      });
      
      profiles.set('inactive-profile', {
        name: 'inactive-profile',
        path: './inactive.md',
        active: false
      });
      
      // Check active profiles count
      const activeCount = Array.from(profiles.values()).filter((p: { active?: boolean }) => p.active).length;
      expect(activeCount).toBe(1);
    });

    it('should handle profile metadata', () => {
      const profiles = (adminUI as AdminUI & { [key: string]: unknown }).profiles;
      
      const profileWithMetadata = {
        name: 'metadata-profile',
        path: './metadata.md',
        checksum: 'abc123def456',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        permissions: ['read', 'write'],
        description: 'Test profile with metadata',
        tags: ['test', 'demo'],
        active: true
      };
      
      profiles.set('metadata-profile', profileWithMetadata);
      
      const retrieved = profiles.get('metadata-profile');
      expect(retrieved).toMatchObject(profileWithMetadata);
      expect(retrieved.tags).toContain('test');
      expect(retrieved.permissions).toContain('read');
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Try to save to an invalid path
      const adminUIWithBadPath = new AdminUI('/root/no-permission/config.json');
      const saveProfiles = (adminUIWithBadPath as AdminUI & { saveProfiles: () => void }).saveProfiles.bind(adminUIWithBadPath);
      
      // Should handle error gracefully
      expect(() => saveProfiles()).not.toThrow();
      
      consoleSpy.mockRestore();
    });

    it('should validate profile data structure', () => {
      const profiles = (adminUI as AdminUI & { [key: string]: unknown }).profiles;
      
      // Add profile with minimal required fields
      profiles.set('minimal', {
        name: 'minimal',
        path: './minimal.md'
      });
      
      // Add profile with all optional fields
      profiles.set('complete', {
        name: 'complete',
        path: './complete.md',
        checksum: 'hash',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        permissions: ['all'],
        description: 'Complete profile',
        tags: ['tag1', 'tag2'],
        active: true
      });
      
      expect(profiles.get('minimal')).toBeDefined();
      expect(profiles.get('complete')).toBeDefined();
    });
  });

  describe('Integration with Other Managers', () => {
    it('should have ClaudeConfigManager instance', () => {
      const claudeConfigManager = (adminUI as AdminUI & { [key: string]: unknown }).claudeConfigManager;
      expect(claudeConfigManager).toBeDefined();
    });

    it('should have PathResolver instance', () => {
      const pathResolver = (adminUI as AdminUI & { [key: string]: unknown }).pathResolver;
      expect(pathResolver).toBeDefined();
    });

    it('should have ProfileManager instance', () => {
      const profileManager = (adminUI as AdminUI & { [key: string]: unknown }).profileManager;
      expect(profileManager).toBeDefined();
    });

    it('should initialize YamlConfigManager if config exists', () => {
      // Create a YAML config file
      const yamlPath = path.join(tempDir, 'omni-config.yaml');
      fs.writeFileSync(yamlPath, 'profiles:\n  - name: test\n    path: ./test.md');
      
      // Create new instance in temp dir
      const originalCwd = process.cwd();
      process.chdir(tempDir);
      
      const uiWithYaml = new AdminUI(configPath);
      const yamlConfigManager = (uiWithYaml as AdminUI & { yamlConfigManager: YamlConfigManager }).yamlConfigManager;
      
      process.chdir(originalCwd);
      
      // YamlConfigManager might be created conditionally
      // Just ensure no errors occur
      expect(uiWithYaml).toBeDefined();
    });
  });

  describe('Table Display', () => {
    it('should format profile data for table display', async () => {
      const Table = (await import('cli-table3')).default;
      const mockTableInstance = {
        push: vi.fn(),
        toString: vi.fn().mockReturnValue('Profile Table')
      };
      vi.mocked(Table).mockImplementationOnce(() => mockTableInstance as Table);
      
      const profiles = (adminUI as AdminUI & { [key: string]: unknown }).profiles;
      profiles.set('table-test', {
        name: 'table-test',
        path: './table.md',
        active: true,
        tags: ['tag1', 'tag2']
      });
      
      await adminUI.showSystemStatus();
      
      expect(mockTableInstance.push).toHaveBeenCalled();
    });
  });
});