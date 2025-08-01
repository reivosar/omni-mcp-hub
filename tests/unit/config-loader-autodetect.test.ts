import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SourceConfigManager } from '../../src/source-config-manager';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock yaml module
jest.mock('js-yaml');
const mockYaml = yaml as jest.Mocked<typeof yaml>;

describe('SourceConfigManager Auto-Detection', () => {
  let configLoader: SourceConfigManager;
  const originalEnv = process.env;

  beforeEach(() => {
    configLoader = new SourceConfigManager();
    jest.clearAllMocks();
    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('autoDetectSourceType', () => {
    it('should auto-detect GitHub HTTPS URLs', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { url: 'https://github.com/microsoft/vscode' },
          { url: 'https://github.com/facebook/react/tree/main' },
          { url: 'https://github.com/user/repo/blob/develop' }
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.load();

      expect(result.sources[0]).toEqual({
        type: 'github',
        owner: 'microsoft',
        repo: 'vscode',
        branch: 'main',
        url: 'https://github.com/microsoft/vscode'
      });

      expect(result.sources[1]).toEqual({
        type: 'github',
        owner: 'facebook',
        repo: 'react',
        branch: 'main',
        url: 'https://github.com/facebook/react/tree/main'
      });

      expect(result.sources[2]).toEqual({
        type: 'github',
        owner: 'user',
        repo: 'repo',
        branch: 'develop',
        url: 'https://github.com/user/repo/blob/develop'
      });
    });

    it('should auto-detect GitHub shorthand formats', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { url: 'github:facebook/react@main' },
          { url: 'microsoft/vscode@develop' },
          { url: 'user/repo' } // デフォルトブランチ
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.load();

      expect(result.sources[0]).toEqual({
        type: 'github',
        owner: 'facebook',
        repo: 'react',
        branch: 'main',
        url: 'github:facebook/react@main'
      });

      expect(result.sources[1]).toEqual({
        type: 'github',
        owner: 'microsoft',
        repo: 'vscode',
        branch: 'develop',
        url: 'microsoft/vscode@develop'
      });

      expect(result.sources[2]).toEqual({
        type: 'github',
        owner: 'user',
        repo: 'repo',
        branch: 'main',
        url: 'user/repo'
      });
    });

    it('should auto-detect local paths', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { url: '/absolute/path/to/project' },
          { url: './relative/path' },
          { url: '../parent/path' },
          { url: 'file:///file/protocol/path' },
          { url: 'C:\\Windows\\Path' } // Windows path
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.load();

      expect(result.sources[0]).toEqual({
        type: 'local',
        path: '/absolute/path/to/project',
        url: '/absolute/path/to/project'
      });

      expect(result.sources[1]).toEqual({
        type: 'local',
        path: './relative/path',
        url: './relative/path'
      });

      expect(result.sources[2]).toEqual({
        type: 'local',
        path: '../parent/path',
        url: '../parent/path'
      });

      expect(result.sources[3]).toEqual({
        type: 'local',
        path: '/file/protocol/path',
        url: 'file:///file/protocol/path'
      });

      expect(result.sources[4]).toEqual({
        type: 'local',
        path: 'C:\\Windows\\Path',
        url: 'C:\\Windows\\Path'
      });
    });

    it('should preserve existing properties when auto-detecting', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { 
            url: 'github:microsoft/vscode@develop',
            token: 'custom-token'
          }
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.load();

      expect(result.sources[0]).toEqual({
        type: 'github',
        owner: 'microsoft',
        repo: 'vscode',
        branch: 'develop', // URL解析結果
        token: 'custom-token', // 既存の設定が保持
        url: 'github:microsoft/vscode@develop'
      });
    });

    it('should not modify sources with explicit type and no url', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { 
            type: 'github',
            owner: 'facebook',
            repo: 'react',
            branch: 'main'
          },
          { 
            type: 'local',
            path: '/path/to/project'
          }
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.load();

      // 既存の形式はそのまま保持される
      expect(result.sources[0]).toEqual({
        type: 'github',
        owner: 'facebook',
        repo: 'react',
        branch: 'main'
      });

      expect(result.sources[1]).toEqual({
        type: 'local',
        path: '/path/to/project'
      });
    });

    it('should throw error for unrecognized URL formats', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { url: 'invalid://unsupported/url/format' }
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      expect(() => configLoader.load()).toThrow('Unable to auto-detect source type for URL: invalid://unsupported/url/format');
    });

    it('should handle .git suffix removal', () => {
      const mockConfig = {
        server: { port: 3000 },
        sources: [
          { url: 'https://github.com/microsoft/vscode.git' },
          { url: 'microsoft/typescript.git' }
        ],
        files: { patterns: ['CLAUDE.md'], max_size: 100000 },
        fetch: { timeout: 10000, retries: 3, retry_delay: 1000, max_depth: 2 },
        cache: { ttl: 300 }
      };

      const yamlContent = yaml.dump(mockConfig);
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);
      mockYaml.load.mockReturnValue(mockConfig);

      const result = configLoader.load();

      expect(result.sources[0].repo).toBe('vscode');
      expect(result.sources[1].repo).toBe('typescript');
    });
  });

  describe('getConfigExamples', () => {
    it('should return configuration examples', () => {
      const examples = SourceConfigManager.getConfigExamples();
      
      expect(examples).toContain('Auto-detection enabled configuration examples');
      expect(examples).toContain('url: https://github.com/microsoft/vscode');
      expect(examples).toContain('url: github:facebook/react@main');
      expect(examples).toContain('url: /Users/mac/my-project');
      expect(examples).toContain('Traditional format (backward compatibility)');
    });
  });
});