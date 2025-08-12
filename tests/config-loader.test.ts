import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigLoader } from '../src/config/loader.js';
import { ClaudeConfigManager } from '../src/utils/claude-config.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock filesystem
vi.mock('fs/promises');
const mockedFs = vi.mocked(fs);

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;
  let mockClaudeConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockClaudeConfigManager = {
      loadClaudeConfig: vi.fn()
    };

    configLoader = new ConfigLoader(mockClaudeConfigManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadInitialConfig', () => {
    it('should load profiles from valid .mcp-config.json', async () => {
      const mockConfig = {
        initialProfiles: [
          {
            name: 'test-profile',
            path: './test-config.md'
          },
          {
            name: 'another-profile', 
            path: '/absolute/path/another.md'
          }
        ]
      };

      const mockClaudeConfig = {
        project_name: 'Test Project',
        instructions: 'Test instructions'
      };

      // Mock file reading setup
      mockedFs.readFile.mockImplementation((filePath) => {
        if ((filePath as string).includes('.mcp-config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        // YAML config file doesn't exist
        return Promise.reject(new Error('File not found'));
      });

      // Mock for directory scanning
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);

      // Mock CLAUDE.md file reading
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue(mockClaudeConfig);

      const result = await configLoader.loadInitialConfig();

      expect(mockedFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('.mcp-config.json'),
        'utf-8'
      );
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledTimes(2);
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledWith(
        expect.stringContaining('test-config.md')
      );
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledWith(
        '/absolute/path/another.md'
      );

      expect(result.size).toBe(2);
      expect(result.has('test-profile')).toBe(true);
      expect(result.has('another-profile')).toBe(true);
      expect(result.get('test-profile')).toEqual(mockClaudeConfig);
    });

    it('should return empty map when .mcp-config.json does not exist', async () => {
      // Mock file reading error
      mockedFs.readFile.mockRejectedValue(new Error('File not found'));
      
      // Mock for directory scanning
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);

      const result = await configLoader.loadInitialConfig();

      expect(result.size).toBe(0);
      expect(mockClaudeConfigManager.loadClaudeConfig).not.toHaveBeenCalled();
    });

    it('should return empty map when .mcp-config.json is invalid JSON', async () => {
      mockedFs.readFile.mockImplementation((filePath) => {
        if ((filePath as string).includes('.mcp-config.json')) {
          return Promise.resolve('{ invalid json }');
        }
        return Promise.reject(new Error('File not found'));
      });
      
      // Mock for directory scanning
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);

      const result = await configLoader.loadInitialConfig();

      expect(result.size).toBe(0);
      expect(mockClaudeConfigManager.loadClaudeConfig).not.toHaveBeenCalled();
    });

    it('should return empty map when initialProfiles is not an array', async () => {
      const invalidConfig = {
        initialProfiles: 'not an array'
      };

      mockedFs.readFile.mockImplementation((filePath) => {
        if ((filePath as string).includes('.mcp-config.json')) {
          return Promise.resolve(JSON.stringify(invalidConfig));
        }
        return Promise.reject(new Error('File not found'));
      });
      
      // Mock for directory scanning
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);

      const result = await configLoader.loadInitialConfig();

      expect(result.size).toBe(0);
      expect(mockClaudeConfigManager.loadClaudeConfig).not.toHaveBeenCalled();
    });

    it('should skip profiles with missing name or path', async () => {
      const mockConfig = {
        initialProfiles: [
          {
            name: 'valid-profile',
            path: './valid.md'
          },
          {
            name: '', // Empty name
            path: './empty-name.md'
          },
          {
            name: 'missing-path-profile'
            // No path
          },
          {
            path: './missing-name.md'
            // No name
          }
        ]
      };

      const mockClaudeConfig = {
        project_name: 'Valid Project'
      };

      mockedFs.readFile.mockImplementation((filePath) => {
        if ((filePath as string).includes('.mcp-config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        return Promise.reject(new Error('File not found'));
      });
      
      // Mock for directory scanning
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue(mockClaudeConfig);

      const result = await configLoader.loadInitialConfig();

      // Only valid profiles are loaded
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledTimes(1);
      expect(result.size).toBe(1);
      expect(result.has('valid-profile')).toBe(true);
    });

    it('should handle Claude config loading errors gracefully', async () => {
      const mockConfig = {
        initialProfiles: [
          {
            name: 'failing-profile',
            path: './failing.md'
          },
          {
            name: 'working-profile',
            path: './working.md'
          }
        ]
      };

      const workingConfig = {
        project_name: 'Working Project'
      };

      mockedFs.readFile.mockImplementation((filePath) => {
        if ((filePath as string).includes('.mcp-config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        return Promise.reject(new Error('File not found'));
      });
      
      // Mock for directory scanning
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      
      // First call fails, second call succeeds
      mockClaudeConfigManager.loadClaudeConfig
        .mockRejectedValueOnce(new Error('Failed to load config'))
        .mockResolvedValueOnce(workingConfig);

      const result = await configLoader.loadInitialConfig();

      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledTimes(2);
      expect(result.size).toBe(1);
      expect(result.has('working-profile')).toBe(true);
      expect(result.has('failing-profile')).toBe(false);
    });

    it('should handle absolute and relative paths correctly', async () => {
      const mockConfig = {
        initialProfiles: [
          {
            name: 'relative-profile',
            path: './relative/config.md'
          },
          {
            name: 'absolute-profile',
            path: '/absolute/path/config.md'
          }
        ]
      };

      mockedFs.readFile.mockImplementation((filePath) => {
        if ((filePath as string).includes('.mcp-config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        return Promise.reject(new Error('File not found'));
      });
      
      // Mock for directory scanning
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);
      
      mockClaudeConfigManager.loadClaudeConfig.mockResolvedValue({});

      await configLoader.loadInitialConfig();

      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledWith(
        expect.stringMatching(/.*relative\/config\.md$/)
      );
      expect(mockClaudeConfigManager.loadClaudeConfig).toHaveBeenCalledWith(
        '/absolute/path/config.md'
      );
    });

    it('should handle empty initialProfiles array', async () => {
      const mockConfig = {
        initialProfiles: []
      };

      mockedFs.readFile.mockImplementation((filePath) => {
        if ((filePath as string).includes('.mcp-config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        return Promise.reject(new Error('File not found'));
      });
      
      // Mock for directory scanning
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);

      const result = await configLoader.loadInitialConfig();

      expect(result.size).toBe(0);
      expect(mockClaudeConfigManager.loadClaudeConfig).not.toHaveBeenCalled();
    });

    it('should handle missing initialProfiles property', async () => {
      const mockConfig = {
        someOtherProperty: 'value'
      };

      mockedFs.readFile.mockImplementation((filePath) => {
        if ((filePath as string).includes('.mcp-config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        return Promise.reject(new Error('File not found'));
      });
      
      // Mock for directory scanning
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.stat.mockResolvedValue({ isFile: () => true } as any);

      const result = await configLoader.loadInitialConfig();

      expect(result.size).toBe(0);
      expect(mockClaudeConfigManager.loadClaudeConfig).not.toHaveBeenCalled();
    });
  });
});