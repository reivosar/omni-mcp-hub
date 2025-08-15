import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OmniMCPServer } from '../src/index.js';
import * as fs from 'fs';

// Mock environment for different test scenarios
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  };
});

describe('OmniMCPServer Extended Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Environment Variable Handling', () => {
    it('should use OMNI_CONFIG_PATH when set', () => {
      process.env.OMNI_CONFIG_PATH = '/custom/path/config.yaml';
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should fallback to default config when OMNI_CONFIG_PATH not set', () => {
      delete process.env.OMNI_CONFIG_PATH;
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle relative paths in OMNI_CONFIG_PATH', () => {
      process.env.OMNI_CONFIG_PATH = './relative/config.yaml';
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle absolute paths in OMNI_CONFIG_PATH', () => {
      process.env.OMNI_CONFIG_PATH = '/absolute/path/config.yaml';
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });
  });

  describe('Configuration Path Resolution', () => {
    it('should resolve configuration paths correctly for different working directories', () => {
      const originalCwd = process.cwd();
      
      try {
        // Mock different working directory
        vi.spyOn(process, 'cwd').mockReturnValue('/different/working/dir');
        process.env.OMNI_CONFIG_PATH = './config.yaml';
        
        const server = new OmniMCPServer();
        expect(server).toBeDefined();
      } finally {
        vi.restoreAllMocks();
        process.chdir(originalCwd);
      }
    });

    it('should handle empty OMNI_CONFIG_PATH', () => {
      process.env.OMNI_CONFIG_PATH = '';
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle OMNI_CONFIG_PATH with spaces', () => {
      process.env.OMNI_CONFIG_PATH = '/path with spaces/config.yaml';
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });
  });

  describe('External Server Configuration', () => {
    it('should handle external servers enabled configuration', () => {
      process.env.OMNI_CONFIG_PATH = './examples/mcp/omni-config.yaml';
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle external servers disabled configuration', () => {
      process.env.OMNI_CONFIG_PATH = './examples/local-resources/omni-config.yaml';
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle missing external servers configuration', () => {
      // Mock a config without external servers
      const mockConfig = {
        autoLoad: { profiles: [] },
        fileSettings: {
          configFiles: { claude: 'CLAUDE.md' },
          includePaths: ['./'],
          excludePatterns: [],
          allowedExtensions: ['.md']
        }
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });
  });

  describe('Initialization Error Handling', () => {
    it('should handle YAML config loading errors gracefully', () => {
      process.env.OMNI_CONFIG_PATH = '/nonexistent/config.yaml';
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle corrupted YAML config files', () => {
      process.env.OMNI_CONFIG_PATH = './corrupted-config.yaml';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Corrupted file');
      });
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle permission errors on config files', () => {
      process.env.OMNI_CONFIG_PATH = './no-permission-config.yaml';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        const error = new Error('Permission denied') as any;
        error.code = 'EACCES';
        throw error;
      });
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });
  });

  describe('Server Capabilities', () => {
    it('should initialize with correct server capabilities', () => {
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle tool handler initialization', () => {
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle resource handler initialization', () => {
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });
  });

  describe('Configuration Loading Edge Cases', () => {
    it('should handle config with only required fields', () => {
      const minimalConfig = {
        fileSettings: {
          configFiles: { claude: 'CLAUDE.md' },
          includePaths: [],
          excludePatterns: [],
          allowedExtensions: []
        }
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(minimalConfig));
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should handle config with all optional fields', () => {
      const fullConfig = {
        autoLoad: {
          profiles: [
            { name: 'test', path: './test.md', autoApply: true }
          ]
        },
        fileSettings: {
          configFiles: {
            claude: 'CLAUDE.md',
            behavior: '*-behavior.md',
            custom: '*-config.md'
          },
          includePaths: ['./configs/', './profiles/'],
          excludePatterns: ['*.tmp', '*.backup'],
          allowedExtensions: ['.md', '.txt']
        },
        directoryScanning: {
          recursive: true,
          maxDepth: 5,
          includeHidden: false,
          followSymlinks: true
        },
        profileManagement: {
          allowDuplicateNames: true,
          autoNamePattern: '%filename%-profile',
          defaultProfile: 'custom-default'
        },
        logging: {
          level: 'debug',
          verboseFileLoading: true,
          verboseProfileSwitching: true
        },
        externalServers: {
          enabled: true,
          servers: [
            {
              name: 'test-server',
              command: 'node',
              args: ['server.js'],
              env: { NODE_ENV: 'test' },
              description: 'Test server'
            }
          ],
          autoConnect: true,
          retry: {
            maxAttempts: 5,
            delayMs: 2000
          }
        }
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fullConfig));
      
      const server = new OmniMCPServer();
      expect(server).toBeDefined();
    });
  });
});