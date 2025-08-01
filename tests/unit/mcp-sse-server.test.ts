import express from 'express';
import { MCPSSEServer } from '../../src/mcp-sse-server';
import { GitHubAPI } from '../../src/github-api';
import { CacheManager } from '../../src/cache';
import { ReferenceResolver } from '../../src/reference-resolver';
import { SourceConfigManager } from '../../src/source-config-manager';

// Mock all dependencies
jest.mock('express');
jest.mock('../../src/github-api');
jest.mock('../../src/cache');
jest.mock('../../src/reference-resolver');
jest.mock('../../src/config-loader');
jest.mock('cors', () => jest.fn(() => (req: any, res: any, next: any) => next()));

// Mock crypto module for webhook signature verification
jest.mock('crypto', () => ({
  createHmac: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mocked-signature')
  }))
}));

const MockExpress = express as jest.MockedFunction<typeof express>;
const MockGitHubAPI = GitHubAPI as jest.MockedClass<typeof GitHubAPI>;
const MockCacheManager = CacheManager as jest.MockedClass<typeof CacheManager>;
const MockReferenceResolver = ReferenceResolver as jest.MockedClass<typeof ReferenceResolver>;
const MockSourceConfigManager = SourceConfigManager as jest.MockedClass<typeof SourceConfigManager>;

describe('MCPSSEServer', () => {
  let server: MCPSSEServer;
  let mockApp: any;
  let mockConfigLoader: jest.Mocked<SourceConfigManager>;
  let mockGithubAPI: jest.Mocked<GitHubAPI>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockReferenceResolver: jest.Mocked<ReferenceResolver>;

  const mockConfig = {
    fetch: {
      timeout: 30000,
      retries: 3,
      retry_delay: 1000,
      max_depth: 3
    },
    server: {
      port: 3000
    },
    file: {
      patterns: ['CLAUDE.md'],
      max_size: 1048576
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock express app
    mockApp = {
      use: jest.fn(),
      all: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      listen: jest.fn()
    };
    MockExpress.mockReturnValue(mockApp);
    MockExpress.json = jest.fn();
    MockExpress.raw = jest.fn();

    // Mock config loader
    mockConfigLoader = {
      getConfig: jest.fn().mockReturnValue(mockConfig),
      load: jest.fn(),
      clearCache: jest.fn(),
      getSources: jest.fn(),
      getSourcesAsEnvFormat: jest.fn()
    } as any;
    MockSourceConfigManager.mockImplementation(() => mockConfigLoader);

    // Mock GitHub API
    mockGithubAPI = {
      listFiles: jest.fn(),
      getFileContent: jest.fn(),
      getRateLimit: jest.fn()
    } as any;
    MockGitHubAPI.mockImplementation(() => mockGithubAPI);

    // Mock cache manager
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      invalidateRepo: jest.fn(),
      invalidateBranch: jest.fn(),
      getStats: jest.fn(),
      generateKey: jest.fn(),
      getMCPData: jest.fn(),
      setMCPData: jest.fn()
    } as any;
    MockCacheManager.mockImplementation(() => mockCacheManager);

    // Mock reference resolver
    mockReferenceResolver = {
      resolveReferences: jest.fn(),
      extractExternalReferences: jest.fn(),
      resetProcessedUrls: jest.fn(),
      reset: jest.fn(),
      getStats: jest.fn().mockReturnValue({ processedUrls: 0, urls: [] })
    } as any;
    MockReferenceResolver.mockImplementation(() => mockReferenceResolver);

    server = new MCPSSEServer(3000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default port', () => {
      const defaultServer = new MCPSSEServer();
      expect(MockExpress).toHaveBeenCalled();
      expect(MockSourceConfigManager).toHaveBeenCalled();
    });

    it('should initialize with custom port', () => {
      expect(MockExpress).toHaveBeenCalled();
      expect(MockSourceConfigManager).toHaveBeenCalled();
      expect(MockGitHubAPI).toHaveBeenCalled();
      expect(MockCacheManager).toHaveBeenCalled();
      expect(MockReferenceResolver).toHaveBeenCalledWith(mockGithubAPI);
    });

    it('should configure fetch options from config', () => {
      expect(mockConfigLoader.getConfig).toHaveBeenCalled();
    });

    it('should setup middleware and routes', () => {
      expect(mockApp.use).toHaveBeenCalled();
      expect(mockApp.all).toHaveBeenCalledWith('/sse', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/healthz', expect.any(Function));
      expect(mockApp.post).toHaveBeenCalledWith('/webhook', expect.any(Function));
    });
  });

  describe('setupMiddleware', () => {
    it('should setup CORS and JSON parsing middleware', () => {
      // Verify CORS is configured
      expect(mockApp.use).toHaveBeenCalled();
      
      // Verify webhook raw body middleware
      expect(MockExpress.raw).toHaveBeenCalledWith({ type: 'application/json' });
      
      // Check if /webhook middleware was called (the raw middleware call)
      const webhookMiddlewareCalls = mockApp.use.mock.calls.filter((call: any) => 
        call[0] === '/webhook'
      );
      expect(webhookMiddlewareCalls.length).toBeGreaterThan(0);
      
      // Verify JSON parsing middleware
      expect(MockExpress.json).toHaveBeenCalled();
      
      // Verify error handling middleware
      const errorMiddlewareCalls = mockApp.use.mock.calls.filter((call: any) => 
        call[0] && typeof call[0] === 'function' && call[0].length === 4
      );
      expect(errorMiddlewareCalls.length).toBeGreaterThan(0);
    });
  });

  describe('SSE endpoint handlers', () => {
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
      mockReq = {
        method: 'GET',
        path: '/sse',
        body: {},
        headers: {}
      };
      mockRes = {
        writeHead: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
    });

    it('should handle GET request with server info', async () => {
      // Get the SSE route handler
      const sseHandler = mockApp.all.mock.calls.find((call: any) => call[0] === '/sse')[1];
      
      await sseHandler(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }));
      expect(mockRes.write).toHaveBeenCalledWith('event: message\n');
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('git-mcp-compatible-server'));
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle POST request with JSON-RPC', async () => {
      mockReq.method = 'POST';
      mockReq.body = {
        jsonrpc: '2.0',
        id: '1',
        method: 'fetch_owner_repo_documentation',
        params: {
          owner: 'test-owner',
          repo: 'test-repo'
        }
      };

      const sseHandler = mockApp.all.mock.calls.find((call: any) => call[0] === '/sse')[1];
      
      await sseHandler(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalled();
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle invalid JSON-RPC version', async () => {
      mockReq.method = 'POST';
      mockReq.body = {
        jsonrpc: '1.0',
        id: '1',
        method: 'test_method'
      };

      const sseHandler = mockApp.all.mock.calls.find((call: any) => call[0] === '/sse')[1];
      
      await sseHandler(mockReq, mockRes);

      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('Invalid Request'));
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle method not found', async () => {
      mockReq.method = 'POST';
      mockReq.body = {
        jsonrpc: '2.0',
        id: '1',
        method: 'unknown_method'
      };

      const sseHandler = mockApp.all.mock.calls.find((call: any) => call[0] === '/sse')[1];
      
      await sseHandler(mockReq, mockRes);

      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('Method not found'));
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle git-mcp compatible method names', async () => {
      mockReq.method = 'POST';
      mockReq.body = {
        jsonrpc: '2.0',
        id: '1',
        method: 'fetch_testowner_testrepo_documentation'
      };

      // Mock GitHub API responses
      mockGithubAPI.listFiles.mockResolvedValue(['CLAUDE.md']);
      mockGithubAPI.getFileContent.mockResolvedValue('# Test content');
      // mockCacheManager.get.mockResolvedValue(null); // Not needed for this test
      mockReferenceResolver.resolveReferences.mockResolvedValue([]);

      const sseHandler = mockApp.all.mock.calls.find((call: any) => call[0] === '/sse')[1];
      
      await sseHandler(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalled();
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('health check endpoint', () => {
    it('should respond with ok status', () => {
      const healthHandler = mockApp.get.mock.calls.find((call: any) => call[0] === '/healthz')[1];
      const mockReq = {};
      const mockRes = {
        json: jest.fn()
      };

      healthHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
    });
  });

  describe('webhook endpoint', () => {
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
      mockReq = {
        headers: {
          'x-github-event': 'push',
          'x-hub-signature-256': 'sha256=mocked-signature',
          'x-github-delivery': 'test-delivery'
        },
        body: Buffer.from(JSON.stringify({
          repository: {
            owner: { login: 'test-owner' },
            name: 'test-repo'
          },
          ref: 'refs/heads/main'
        }))
      };
      mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
    });

    it('should handle push webhook with signature verification', async () => {
      const webhookHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/webhook')[1];
      
      await webhookHandler(mockReq, mockRes);

      expect(mockCacheManager.invalidateBranch).toHaveBeenCalledWith('test-owner', 'test-repo', 'main');
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'push' });
    });

    it('should handle push webhook without signature when no secret configured', async () => {
      // Remove webhook secret from environment
      const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
      delete process.env.GITHUB_WEBHOOK_SECRET;
      
      // Mock config to return empty secret
      mockConfigLoader.getConfig.mockReturnValue({
        ...mockConfig,
        sources: [],
        files: { patterns: ['CLAUDE.md'], max_size: 1048576 },
        cache: { ttl: 300000, cleanup_interval: 60000 }
      } as any);

      delete mockReq.headers['x-hub-signature-256'];

      const webhookHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/webhook')[1];
      
      await webhookHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'push' });
      
      // Restore environment
      if (originalSecret !== undefined) {
        process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
      }
    });

    it('should reject webhook with invalid signature', async () => {
      // Set webhook secret in environment  
      const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
      process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
      
      // Temporarily change the expected signature in the mock body to trigger mismatch
      const originalSignature = mockReq.headers['x-hub-signature-256'];
      mockReq.headers['x-hub-signature-256'] = 'sha256=invalid-signature';
      
      const webhookHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/webhook')[1];
      
      await webhookHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
      
      // Restore original values
      mockReq.headers['x-hub-signature-256'] = originalSignature;
      if (originalSecret !== undefined) {
        process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
      } else {
        delete process.env.GITHUB_WEBHOOK_SECRET;
      }
    });

    it('should reject webhook with missing signature when secret configured', async () => {
      // Set webhook secret in environment
      const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
      process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
      
      delete mockReq.headers['x-hub-signature-256'];
      
      const webhookHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/webhook')[1];
      
      await webhookHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing signature' });
      
      // Restore environment
      if (originalSecret !== undefined) {
        process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
      } else {
        delete process.env.GITHUB_WEBHOOK_SECRET;
      }
    });

    it('should handle pull_request webhook', async () => {
      mockReq.headers['x-github-event'] = 'pull_request';
      
      const webhookHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/webhook')[1];
      
      await webhookHandler(mockReq, mockRes);

      expect(mockCacheManager.invalidateRepo).toHaveBeenCalledWith('test-owner', 'test-repo');
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'pull_request' });
    });

    it('should handle repository webhook', async () => {
      mockReq.headers['x-github-event'] = 'repository';
      
      const webhookHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/webhook')[1];
      
      await webhookHandler(mockReq, mockRes);

      expect(mockCacheManager.invalidateRepo).toHaveBeenCalledWith('test-owner', 'test-repo');
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'repository' });
    });

    it('should ignore unknown webhook events', async () => {
      mockReq.headers['x-github-event'] = 'unknown_event';
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const webhookHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/webhook')[1];
      
      await webhookHandler(mockReq, mockRes);

      expect(consoleSpy).toHaveBeenCalledWith('Ignoring webhook event: unknown_event');
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'unknown_event' });
      
      consoleSpy.mockRestore();
    });

    it('should handle webhook errors', async () => {
      // Set invalid body that will cause JSON.parse to fail
      mockReq.body = Buffer.from('invalid json');
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const webhookHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/webhook')[1];
      
      await webhookHandler(mockReq, mockRes);

      expect(consoleErrorSpy).toHaveBeenCalled();
      // Should return 400 for invalid JSON, not 500 (security improvement)
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid JSON payload' });
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle regular JSON body for signature verification', async () => {
      // Mock non-buffer body (regular JSON parsing)
      mockReq.body = {
        repository: {
          owner: { login: 'test-owner' },
          name: 'test-repo'
        },
        ref: 'refs/heads/main'
      };

      const webhookHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/webhook')[1];
      
      await webhookHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'push' });
    });
  });

  describe('start method', () => {
    it('should start the server on specified port', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      server.start();

      expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
      
      // Test the callback
      const callback = mockApp.listen.mock.calls[0][1];
      if (callback) {
        callback();
        expect(consoleSpy).toHaveBeenCalledWith('MCP SSE Server started on port 3000');
        expect(consoleSpy).toHaveBeenCalledWith('Compatible with idosal/git-mcp clients');
      }
      
      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle JSON parse errors in SSE endpoint', async () => {
      const mockReq = {
        method: 'GET',
        path: '/sse'
      };
      const mockRes = {
        writeHead: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      // Simulate error by calling the error middleware directly
      const errorMiddleware = mockApp.use.mock.calls.find((call: any) => 
        call[0] && typeof call[0] === 'function' && call[0].length === 4
      )[0];

      const syntaxError = new SyntaxError('Unexpected token in JSON');
      const mockNext = jest.fn();

      errorMiddleware(syntaxError, mockReq, mockRes, mockNext);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream'
      }));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('Parse error'));
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should pass non-JSON errors to next middleware', () => {
      const mockReq = { path: '/other' };
      const mockRes = {};
      const mockNext = jest.fn();

      const errorMiddleware = mockApp.use.mock.calls.find((call: any) => 
        call[0] && typeof call[0] === 'function' && call[0].length === 4
      )[0];

      const otherError = new Error('Other error');
      errorMiddleware(otherError, mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(otherError);
    });
  });

  describe('sendSSEMessage and sendSSEError helpers', () => {
    it('should format SSE messages correctly', () => {
      const mockRes = {
        write: jest.fn()
      };

      // Access private method via type assertion
      const serverAny = server as any;
      serverAny.sendSSEMessage(mockRes, {
        jsonrpc: '2.0',
        method: 'test',
        params: { test: 'data' }
      });

      expect(mockRes.write).toHaveBeenCalledWith('event: message\n');
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"jsonrpc":"2.0"'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"method":"test"'));
    });

    it('should format SSE errors correctly', () => {
      const mockRes = {
        write: jest.fn()
      };

      const serverAny = server as any;
      serverAny.sendSSEError(mockRes, '1', -32601, 'Method not found');

      expect(mockRes.write).toHaveBeenCalledWith('event: message\n');
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"error"'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('-32601'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('Method not found'));
    });
  });
});