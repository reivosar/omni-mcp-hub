import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubClient, GitHubResourceManager } from '../src/utils/github-client.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GitHubClient', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = new GitHubClient();
    mockFetch.mockClear();
  });

  describe('fetchDirectory', () => {
    it('should fetch directory contents successfully', async () => {
      const mockResponse = [
        { name: 'file1.md', type: 'file', path: 'file1.md', sha: 'abc123', size: 100 },
        { name: 'file2.md', type: 'file', path: 'file2.md', sha: 'def456', size: 200 }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const config = { owner: 'owner', repo: 'repo', branch: 'main' };
      const result = await client.fetchDirectory(config, 'path');
      
      expect(result.files).toHaveLength(2);
      expect(result.files[0].name).toBe('file1.md');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/contents/path?ref=main',
        expect.any(Object)
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const config = { owner: 'owner', repo: 'repo', branch: 'main' };
      await expect(
        client.fetchDirectory(config, 'path')
      ).rejects.toThrow('GitHub API error: 404 Not Found');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const config = { owner: 'owner', repo: 'repo', branch: 'main' };
      await expect(
        client.fetchDirectory(config, 'path')
      ).rejects.toThrow('Network error');
    });
  });

  describe('fetchFile', () => {
    it('should fetch file content successfully', async () => {
      const mockResponse = {
        name: 'test.md',
        path: 'test.md',
        content: Buffer.from('test content').toString('base64'),
        sha: 'abc123',
        size: 12,
        type: 'file',
        download_url: 'https://example.com'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const config = { owner: 'owner', repo: 'repo', branch: 'main' };
      const result = await client.fetchFile(config, 'test.md');
      
      expect(result?.content).toBe('test content');
      expect(result?.name).toBe('test.md');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/contents/test.md?ref=main',
        expect.any(Object)
      );
    });

    it('should handle 404 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const config = { owner: 'owner', repo: 'repo', branch: 'main' };
      const result = await client.fetchFile(config, 'nonexistent.md');
      expect(result).toBeNull();
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      });

      const config = { owner: 'owner', repo: 'repo', branch: 'main' };
      await expect(
        client.fetchFile(config, 'file.md')
      ).rejects.toThrow('GitHub API error: 403 Forbidden');
    });
  });
});

describe('GitHubClient - Additional Methods', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = new GitHubClient();
    mockFetch.mockClear();
  });

  describe('fetchMarkdownFiles', () => {
    it('should fetch markdown files recursively', async () => {
      // Mock directory with markdown files
      const mockDirectoryResponse = [
        { name: 'README.md', type: 'file', path: 'README.md', sha: 'abc123', size: 100 },
        { name: 'doc.txt', type: 'file', path: 'doc.txt', sha: 'def456', size: 200 },
        { name: 'subdir', type: 'dir', path: 'subdir', sha: 'ghi789', size: 0 }
      ];

      const mockSubdirResponse = [
        { name: 'guide.md', type: 'file', path: 'subdir/guide.md', sha: 'jkl012', size: 150 }
      ];

      const readmeContent = '# README';
      const guideContent = '# Guide';

      // First call - root directory
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDirectoryResponse
      });

      // Fetch README.md content
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'README.md',
          path: 'README.md',
          content: Buffer.from(readmeContent).toString('base64'),
          sha: 'abc123',
          size: readmeContent.length,
          type: 'file'
        })
      });

      // Fetch subdirectory
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubdirResponse
      });

      // Fetch guide.md content
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'guide.md',
          path: 'subdir/guide.md',
          content: Buffer.from(guideContent).toString('base64'),
          sha: 'jkl012',
          size: guideContent.length,
          type: 'file'
        })
      });

      const config = { owner: 'owner', repo: 'repo', branch: 'main' };
      const result = await client.fetchMarkdownFiles(config, '');

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe(readmeContent);
      expect(result[1].content).toBe(guideContent);
    });

    it('should handle errors when fetching file content', async () => {
      const mockDirectoryResponse = [
        { name: 'file1.md', type: 'file', path: 'file1.md', sha: 'abc123', size: 100 },
        { name: 'file2.md', type: 'file', path: 'file2.md', sha: 'def456', size: 200 }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDirectoryResponse
      });

      // First file succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'file1.md',
          path: 'file1.md',
          content: Buffer.from('Content 1').toString('base64'),
          sha: 'abc123',
          size: 9,
          type: 'file'
        })
      });

      // Second file fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const config = { owner: 'owner', repo: 'repo', branch: 'main' };
      const result = await client.fetchMarkdownFiles(config, '');

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('file1.md');
    });
  });

  describe('fetchMarkdownFilesByPattern', () => {
    it('should filter markdown files by pattern', async () => {
      const mockDirectoryResponse = [
        { name: 'README.md', type: 'file', path: 'README.md', sha: 'abc123', size: 100 },
        { name: 'GUIDE.md', type: 'file', path: 'GUIDE.md', sha: 'def456', size: 200 },
        { name: 'test.md', type: 'file', path: 'test.md', sha: 'ghi789', size: 150 }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDirectoryResponse
      });

      // Mock file content fetches
      for (const file of mockDirectoryResponse) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...file,
            content: Buffer.from(`Content of ${file.name}`).toString('base64')
          })
        });
      }

      const config = { owner: 'owner', repo: 'repo', branch: 'main' };
      const pattern = /^(README|GUIDE)\.md$/;
      const result = await client.fetchMarkdownFilesByPattern(config, '', pattern);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.name)).toEqual(['README.md', 'GUIDE.md']);
    });
  });

  describe('getRepoInfo', () => {
    it('should fetch repository information', async () => {
      const mockRepoInfo = {
        name: 'test-repo',
        full_name: 'owner/test-repo',
        description: 'Test repository',
        default_branch: 'main'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRepoInfo
      });

      const config = { owner: 'owner', repo: 'test-repo', branch: 'main' };
      const result = await client.getRepoInfo(config);

      expect(result).toEqual(mockRepoInfo);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/test-repo',
        expect.any(Object)
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const config = { owner: 'owner', repo: 'nonexistent', branch: 'main' };
      await expect(client.getRepoInfo(config)).rejects.toThrow('GitHub API error: 404 Not Found');
    });
  });

  describe('getHeaders', () => {
    it('should generate headers without token', () => {
      const headers = (client as any).getHeaders();
      expect(headers['Accept']).toBe('application/vnd.github.v3+json');
      expect(headers['User-Agent']).toBe('omni-mcp-hub/1.0.0');
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should generate headers with token', () => {
      const headers = (client as any).getHeaders('test-token');
      expect(headers['Authorization']).toBe('token test-token');
    });
  });

  describe('parseGitHubUrl', () => {
    it('should parse GitHub repository URL', () => {
      const url = 'https://github.com/owner/repo';
      const result = GitHubClient.parseGitHubUrl(url);
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
    });

    it('should parse GitHub URL with tree path', () => {
      const url = 'https://github.com/owner/repo/tree/main/src';
      const result = GitHubClient.parseGitHubUrl(url);
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
      expect(result.branch).toBe('main');
      expect(result.path).toBe('src');
    });

    it('should parse GitHub URL with blob path', () => {
      const url = 'https://github.com/owner/repo/blob/develop/README.md';
      const result = GitHubClient.parseGitHubUrl(url);
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
      expect(result.branch).toBe('develop');
      expect(result.path).toBe('README.md');
    });

    it('should throw error for non-GitHub URLs', () => {
      const url = 'https://gitlab.com/owner/repo';
      expect(() => GitHubClient.parseGitHubUrl(url)).toThrow('Invalid GitHub URL');
    });

    it('should handle malformed URLs', () => {
      const url = 'not-a-url';
      expect(() => GitHubClient.parseGitHubUrl(url)).toThrow();
    });
  });
});

describe('GitHubResourceManager', () => {
  let manager: GitHubResourceManager;

  beforeEach(() => {
    manager = new GitHubResourceManager();
    mockFetch.mockClear();
  });

  describe('Basic functionality', () => {
    it('should create manager instance', () => {
      expect(manager).toBeDefined();
    });

    it('should have internal cache', () => {
      expect((manager as any).cache).toBeDefined();
    });
  });

  describe('Core Caching functionality', () => {
    it('should use cache for repeated calls', async () => {
      const cacheKey = 'test-key';
      const mockData = { test: 'data' };
      
      // Use internal getOrFetch method
      const result1 = await (manager as any).getOrFetch(cacheKey, async () => mockData);
      const result2 = await (manager as any).getOrFetch(cacheKey, async () => ({ different: 'data' }));
      
      expect(result1).toEqual(mockData);
      expect(result2).toEqual(mockData); // Should return cached value
    });
  });
});