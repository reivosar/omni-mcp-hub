import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ConfigLoader } from '../../src/config-loader';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock yaml module
jest.mock('js-yaml');
const mockYaml = yaml as jest.Mocked<typeof yaml>;

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;
  const originalEnv = process.env;

  beforeEach(() => {
    configLoader = new ConfigLoader();
    jest.clearAllMocks();
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.CONFIG_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('load', () => {
    const mockConfig = {
      server: { port: 3000 },
      sources: [
        { type: 'github', owner: 'test', repo: 'repo', branch: 'main' }
      ],
      files: { patterns: ['CLAUDE.md'], max_size: 100000 },
      github: { token: '${GITHUB_TOKEN}', webhook_secret: 'secret' },
      fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
      cache: { ttl: 300 }
    };

    it('should load config from default path', () => {
      const configPath = path.join(process.cwd(), 'config.yaml');
      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.load();

      const expectedResult = {
        ...mockConfig,
        github: { ...mockConfig.github, token: '' } // GITHUB_TOKEN replaced with empty string
      };

      expect(mockFs.existsSync).toHaveBeenCalledWith(configPath);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(configPath, 'utf8');
      expect(result).toEqual(expectedResult);
    });

    it('should load config from explicit path', () => {
      const customPath = '/custom/config.yaml';
      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.load(customPath);

      const expectedResult = {
        ...mockConfig,
        github: { ...mockConfig.github, token: '' } // GITHUB_TOKEN replaced with empty string
      };

      expect(mockFs.existsSync).toHaveBeenCalledWith(customPath);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(customPath, 'utf8');
      expect(result).toEqual(expectedResult);
    });

    it('should load config from CONFIG_PATH environment variable', () => {
      const envPath = '/env/config.yaml';
      process.env.CONFIG_PATH = envPath;
      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.load();

      const expectedResult = {
        ...mockConfig,
        github: { ...mockConfig.github, token: '' } // GITHUB_TOKEN replaced with empty string
      };

      expect(mockFs.existsSync).toHaveBeenCalledWith(envPath);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(envPath, 'utf8');
      expect(result).toEqual(expectedResult);
    });

    it('should throw error when config file does not exist', () => {
      const configPath = path.join(process.cwd(), 'config.yaml');
      
      mockFs.existsSync.mockReturnValue(false);

      expect(() => configLoader.load()).toThrow(`Configuration file not found: ${configPath}`);
    });

    it('should replace environment variables in config', () => {
      process.env.GITHUB_TOKEN = 'test-token-123';
      process.env.WEBHOOK_SECRET = 'webhook-secret-456';
      
      const configWithEnvVars = {
        ...mockConfig,
        github: { 
          token: '${GITHUB_TOKEN}', 
          webhook_secret: '${WEBHOOK_SECRET}' 
        }
      };
      
      const expectedConfig = {
        ...mockConfig,
        github: { 
          token: 'test-token-123', 
          webhook_secret: 'webhook-secret-456' 
        }
      };

      const yamlContent = yaml.dump(configWithEnvVars);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(configWithEnvVars);

      const result = configLoader.load();

      expect(result).toEqual(expectedConfig);
    });

    it('should replace undefined environment variables with empty string', () => {
      const configWithEnvVars = {
        ...mockConfig,
        github: { 
          token: '${UNDEFINED_TOKEN}', 
          webhook_secret: 'static-secret' 
        }
      };
      
      const expectedConfig = {
        ...mockConfig,
        github: { 
          token: '', 
          webhook_secret: 'static-secret' 
        }
      };

      const yamlContent = yaml.dump(configWithEnvVars);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(configWithEnvVars);

      const result = configLoader.load();

      expect(result).toEqual(expectedConfig);
    });

    it('should handle multiple environment variables in single value', () => {
      process.env.API_HOST = 'api.github.com';
      process.env.API_VERSION = 'v3';
      
      const configWithMultipleEnvVars = {
        ...mockConfig,
        api: {
          url: 'https://${API_HOST}/${API_VERSION}'
        }
      };
      
      const expectedConfig = {
        ...mockConfig,
        github: { ...mockConfig.github, token: '' }, // GITHUB_TOKEN replaced with empty string
        api: {
          url: 'https://api.github.com/v3'
        }
      };

      const yamlContent = yaml.dump(configWithMultipleEnvVars);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(configWithMultipleEnvVars);

      const result = configLoader.load();

      expect(result).toEqual(expectedConfig);
    });

    it('should throw error when YAML parsing fails', () => {
      const invalidYaml = 'invalid: yaml: content:';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(invalidYaml);
      mockYaml.load.mockImplementation(() => {
        throw new Error('YAML parsing error');
      });

      expect(() => configLoader.load()).toThrow('YAML parsing error');
    });

    it('should cache loaded config', () => {
      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      // Load once, then get from cache
      const result1 = configLoader.load();
      const result2 = configLoader.getConfig();

      const expectedResult = {
        ...mockConfig,
        github: { ...mockConfig.github, token: '' } // GITHUB_TOKEN replaced with empty string
      };

      // File should only be read once due to caching
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(expectedResult);
      expect(result2).toEqual(expectedResult);
      expect(result1).toBe(result2); // Same object reference
    });
  });

  describe('getConfig', () => {
    it('should return cached config if already loaded', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        github: { token: 'test' },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      // Load once
      configLoader.load();
      
      // Clear mocks
      jest.clearAllMocks();
      
      // Get config should use cache
      const result = configLoader.getConfig();

      expect(mockFs.readFileSync).not.toHaveBeenCalled();
      expect(result).toEqual(mockConfig);
    });

    it('should load config if not cached', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        github: { token: 'test' },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.getConfig();

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockConfig);
    });
  });

  describe('clearCache', () => {
    it('should clear cached config', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        github: { token: 'test' },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      // Load and cache config
      configLoader.load();
      
      // Clear cache
      configLoader.clearCache();
      
      // Clear mocks to verify file is read again
      jest.clearAllMocks();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);
      
      // Get config should read file again
      configLoader.getConfig();

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSources', () => {
    it('should return sources from config', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { type: 'github', owner: 'test1', repo: 'repo1', branch: 'main' },
          { type: 'local', path: '/path/to/local' }
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        github: { token: 'test' },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.getSources();

      expect(result).toEqual(mockConfig.sources);
    });
  });

  describe('getSourcesAsEnvFormat', () => {
    it('should format sources as environment variable string', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { type: 'github', owner: 'org1', repo: 'repo1', branch: 'main' },
          { type: 'local', path: '/path/to/local' },
          { type: 'github', owner: 'org2', repo: 'repo2', branch: 'develop' }
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        github: { token: 'test' },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.getSourcesAsEnvFormat();

      expect(result).toBe('github:org1/repo1,local:/path/to/local,github:org2/repo2');
    });

    it('should filter out invalid source types', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { type: 'github', owner: 'org1', repo: 'repo1', branch: 'main' },
          { type: 'invalid', some: 'property' },
          { type: 'local', path: '/path/to/local' }
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        github: { token: 'test' },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.getSourcesAsEnvFormat();

      expect(result).toBe('github:org1/repo1,local:/path/to/local');
    });

    it('should return empty string when no valid sources', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        github: { token: 'test' },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.getSourcesAsEnvFormat();

      expect(result).toBe('');
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle file read errors', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      expect(() => configLoader.load()).toThrow('File read error');
    });

    it('should handle JSON parsing errors during environment variable replacement', () => {
      const mockConfigWithCircularRef = {
        server: { port: 3000 }
      };
      // Create circular reference to cause JSON.stringify to fail
      (mockConfigWithCircularRef as any).circular = mockConfigWithCircularRef;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('some yaml content');
      mockYaml.load.mockReturnValue(mockConfigWithCircularRef);

      expect(() => configLoader.load()).toThrow();
    });
  });
});