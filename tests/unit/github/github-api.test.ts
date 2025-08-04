import { GitHubAPI } from '../../../src/github/github-api';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('GitHubAPI', () => {
  let githubAPI: GitHubAPI;

  beforeAll(() => {
    // Ensure fetch is mocked globally
    (global as any).fetch = mockFetch;
  });

  beforeEach(() => {
    githubAPI = new GitHubAPI();
    jest.clearAllMocks();
  });

  describe('listFiles', () => {
    const owner = 'testowner';
    const repo = 'testrepo';
    const branch = 'main';

    it('should list files matching CLAUDE.md pattern', async () => {
      const mockTreeResponse = {
        tree: [
          { path: 'CLAUDE.md', type: 'blob', sha: 'abc123' },
          { path: 'docs/CLAUDE.md', type: 'blob', sha: 'def456' },
          { path: 'README.md', type: 'blob', sha: 'ghi789' },
          { path: 'src/main.ts', type: 'blob', sha: 'jkl012' }
        ],
        truncated: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockTreeResponse
      } as unknown as Response);

      const result = await githubAPI.listFiles(owner, repo, branch, 'CLAUDE.md');
      
      expect(result).toEqual(['CLAUDE.md', 'docs/CLAUDE.md']);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'omni-mcp-hub/1.0.0'
          }
        }
      );
    });

    it('should list files matching wildcard pattern', async () => {
      const mockTreeResponse = {
        tree: [
          { path: 'docs/README.md', type: 'blob', sha: 'abc123' },
          { path: 'docs/guide.md', type: 'blob', sha: 'def456' },
          { path: 'src/index.ts', type: 'blob', sha: 'ghi789' },
          { path: 'README.md', type: 'blob', sha: 'jkl012' }
        ],
        truncated: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockTreeResponse
      } as unknown as Response);

      const result = await githubAPI.listFiles(owner, repo, branch, '*.md');
      
      expect(result).toEqual(['docs/README.md', 'docs/guide.md', 'README.md']);
    });

    it('should include authorization header when token provided', async () => {
      const token = 'test-token';
      const mockTreeResponse = { tree: [], truncated: false };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockTreeResponse
      } as unknown as Response);

      await githubAPI.listFiles(owner, repo, branch, 'CLAUDE.md', token);
      
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'omni-mcp-hub/1.0.0',
            'Authorization': `Bearer ${token}`
          }
        }
      );
    });

    it('should throw error for repository not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: {} as Headers,
        json: async () => ({})
      } as unknown as Response);

      await expect(githubAPI.listFiles(owner, repo, branch, 'CLAUDE.md'))
        .rejects.toThrow(`Repository ${owner}/${repo} not found or branch ${branch} does not exist`);
    });

    it('should throw error for other API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: {} as Headers,
        json: async () => ({})
      } as unknown as Response);

      await expect(githubAPI.listFiles(owner, repo, branch, 'CLAUDE.md'))
        .rejects.toThrow('GitHub API error: 403 Forbidden');
    });

    it('should filter out directories (tree type)', async () => {
      const mockTreeResponse = {
        tree: [
          { path: 'CLAUDE.md', type: 'blob', sha: 'abc123' },
          { path: 'docs', type: 'tree', sha: 'def456' },
          { path: 'src', type: 'tree', sha: 'ghi789' }
        ],
        truncated: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockTreeResponse
      } as unknown as Response);

      const result = await githubAPI.listFiles(owner, repo, branch, 'CLAUDE.md');
      
      expect(result).toEqual(['CLAUDE.md']);
    });
  });

  describe('getFileContent', () => {
    const owner = 'testowner';
    const repo = 'testrepo';
    const filePath = 'CLAUDE.md';
    const branch = 'main';

    it('should get file content with base64 encoding', async () => {
      const originalContent = 'Hello, World!';
      const base64Content = Buffer.from(originalContent).toString('base64');
      
      const mockFileResponse = {
        content: base64Content,
        encoding: 'base64'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockFileResponse
      } as unknown as Response);

      const result = await githubAPI.getFileContent(owner, repo, filePath, branch);
      
      expect(result).toBe(originalContent);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'omni-mcp-hub/1.0.0'
          }
        }
      );
    });

    it('should get file content with plain text', async () => {
      const content = 'Plain text content';
      
      const mockFileResponse = {
        content: content,
        encoding: 'utf-8'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockFileResponse
      } as unknown as Response);

      const result = await githubAPI.getFileContent(owner, repo, filePath, branch);
      
      expect(result).toBe(content);
    });

    it('should include authorization header when token provided', async () => {
      const token = 'test-token';
      const mockFileResponse = {
        content: 'test content',
        encoding: 'utf-8'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockFileResponse
      } as unknown as Response);

      await githubAPI.getFileContent(owner, repo, filePath, branch, token);
      
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'omni-mcp-hub/1.0.0',
            'Authorization': `Bearer ${token}`
          }
        }
      );
    });

    it('should throw error for file not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: {} as Headers,
        json: async () => ({})
      } as unknown as Response);

      await expect(githubAPI.getFileContent(owner, repo, filePath, branch))
        .rejects.toThrow(`File ${filePath} not found in ${owner}/${repo}@${branch}`);
    });

    it('should throw error for other API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: {} as Headers,
        json: async () => ({})
      } as unknown as Response);

      await expect(githubAPI.getFileContent(owner, repo, filePath, branch))
        .rejects.toThrow('GitHub API error: 403 Forbidden');
    });
  });

  describe('getRateLimit', () => {
    it('should get rate limit information', async () => {
      const mockRateLimitResponse = {
        resources: {
          core: {
            remaining: 4999,
            reset: 1640995200
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockRateLimitResponse
      } as unknown as Response);

      const result = await githubAPI.getRateLimit();
      
      expect(result).toEqual({
        remaining: 4999,
        reset: 1640995200
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/rate_limit',
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'omni-mcp-hub/1.0.0'
          }
        }
      );
    });

    it('should include authorization header when token provided', async () => {
      const token = 'test-token';
      const mockRateLimitResponse = {
        resources: {
          core: {
            remaining: 5000,
            reset: 1640995200
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockRateLimitResponse
      } as unknown as Response);

      await githubAPI.getRateLimit(token);
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/rate_limit',
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'omni-mcp-hub/1.0.0',
            'Authorization': `Bearer ${token}`
          }
        }
      );
    });
  });

  describe('matchesPattern (private method testing)', () => {
    it('should match exact filename patterns through listFiles', async () => {
      const mockTreeResponse = {
        tree: [
          { path: 'CLAUDE.md', type: 'blob', sha: 'abc123' },
          { path: 'claude.md', type: 'blob', sha: 'def456' },
          { path: 'docs/CLAUDE.md', type: 'blob', sha: 'ghi789' }
        ],
        truncated: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockTreeResponse
      } as unknown as Response);

      const result = await githubAPI.listFiles('test', 'repo', 'main', 'CLAUDE.md');
      
      // Should match exact filename, case-sensitive
      expect(result).toEqual(['CLAUDE.md', 'docs/CLAUDE.md']);
    });

    it('should match wildcard patterns through listFiles', async () => {
      const mockTreeResponse = {
        tree: [
          { path: 'docs/README.md', type: 'blob', sha: 'abc123' },
          { path: 'docs/guide.txt', type: 'blob', sha: 'def456' },
          { path: 'src/index.md', type: 'blob', sha: 'ghi789' },
          { path: 'markdown.md', type: 'blob', sha: 'jkl012' }
        ],
        truncated: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockTreeResponse
      } as unknown as Response);

      const result = await githubAPI.listFiles('test', 'repo', 'main', 'docs/*.md');
      
      expect(result).toEqual(['docs/README.md']);
    });

    it('should handle complex wildcard patterns', async () => {
      const mockTreeResponse = {
        tree: [
          { path: 'docs/api/README.md', type: 'blob', sha: 'abc123' },
          { path: 'docs/guides/setup.md', type: 'blob', sha: 'def456' },
          { path: 'src/docs/internal.md', type: 'blob', sha: 'ghi789' },
          { path: 'README.md', type: 'blob', sha: 'jkl012' }
        ],
        truncated: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockTreeResponse
      } as unknown as Response);

      const result = await githubAPI.listFiles('test', 'repo', 'main', 'docs/**/*.md');
      
      expect(result).toEqual(['docs/api/README.md', 'docs/guides/setup.md']);
    });
  });

  describe('User-Agent header', () => {
    it('should include correct User-Agent header', async () => {
      const mockTreeResponse = { tree: [], truncated: false };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => mockTreeResponse
      } as unknown as Response);

      await githubAPI.listFiles('test', 'repo', 'main', 'CLAUDE.md');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'omni-mcp-hub/1.0.0'
          })
        })
      );
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(githubAPI.listFiles('test', 'repo', 'main', 'CLAUDE.md'))
        .rejects.toThrow('Network error');
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {} as Headers,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      } as unknown as Response);

      await expect(githubAPI.listFiles('test', 'repo', 'main', 'CLAUDE.md'))
        .rejects.toThrow('Invalid JSON');
    });
  });
});