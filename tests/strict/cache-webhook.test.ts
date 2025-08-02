import request from 'supertest';
import crypto from 'crypto';
import { MCPSSEServer } from '../../src/servers/mcp-sse-server';
import { MockGitHubAPI } from '../__mocks__/github-api';

// Mock the GitHubAPI
jest.mock('../../src/github/github-api', () => ({
  GitHubAPI: jest.fn().mockImplementation(() => new MockGitHubAPI())
}));

function parseSSEStream(text: string): Array<{ event: string; data: any }> {
  const events: Array<{ event: string; data: any }> = [];
  const lines = text.split('\n');
  
  let currentEvent = '';
  let currentData = '';
  
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.substring(7);
    } else if (line.startsWith('data: ')) {
      currentData = line.substring(6);
    } else if (line === '' && currentEvent && currentData) {
      try {
        events.push({
          event: currentEvent,
          data: JSON.parse(currentData)
        });
      } catch (e) {
        console.warn('Failed to parse SSE data:', currentData);
      }
      currentEvent = '';
      currentData = '';
    }
  }
  
  return events;
}

function generateWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return 'sha256=' + hmac.digest('hex');
}

describe('Cache and Webhook Integration Tests', () => {
  let server: MCPSSEServer;
  let app: any;
  let mockGitHubAPI: MockGitHubAPI;
  let cacheManager: any;

  beforeEach(() => {
    // Set webhook secret for testing BEFORE creating the server
    process.env.GITHUB_WEBHOOK_SECRET = 'test-secret-key';
    
    server = new MCPSSEServer(3007);
    app = (server as any).app;
    cacheManager = (server as any).cacheManager;
    
    // Get reference to the mocked GitHub API and inject it
    const GitHubAPI = require('../../src/github/github-api').GitHubAPI;
    mockGitHubAPI = new GitHubAPI();
    
    // Inject the mock into the server
    (server as any).githubAPI = mockGitHubAPI;
    if ((server as any).referenceResolver) {
      (server as any).referenceResolver.githubAPI = mockGitHubAPI;
    }
  });

  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    if (mockGitHubAPI) {
      mockGitHubAPI.clear();
    }
    if (cacheManager) {
      cacheManager.cache.clear();
    }
  });

  describe('Cache Hit/Miss Behavior', () => {
    test('should serve from cache on second request (cache hit)', async () => {
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Original content');

      // First request - cache miss
      const firstResponse = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation'
        })
        .expect(200);

      const firstEvents = parseSSEStream(firstResponse.text);
      const firstFileEvent = firstEvents.find(e => e.data.params?.path === 'CLAUDE.md');
      expect(firstFileEvent?.data.params.content).toBe('Original content');

      // Verify cache was populated
      const cachedData = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
      expect(cachedData).toBeDefined();
      expect(cachedData.claude_md_files['CLAUDE.md']).toBe('Original content');

      // Second request - should be cache hit
      const secondResponse = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'fetch_testorg_testrepo_documentation'
        })
        .expect(200);

      const secondEvents = parseSSEStream(secondResponse.text);
      
      // Should have cache hit status
      const cacheHitEvent = secondEvents.find(e => e.data.params?.status === 'cache_hit');
      expect(cacheHitEvent).toBeDefined();

      const secondFileEvent = secondEvents.find(e => e.data.params?.path === 'CLAUDE.md');
      expect(secondFileEvent?.data.params.content).toBe('Original content');
    });

    test('should differentiate cache based on include_externals parameter', async () => {
      const contentWithRefs = 'See [guide](https://example.com/guide.md)';
      
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', contentWithRefs);

      // Request with include_externals=false
      await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: { include_externals: false }
        })
        .expect(200);

      // Request with include_externals=true (should be cache miss)
      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'fetch_testorg_testrepo_documentation',
          params: { include_externals: true }
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      
      // Should not have cache hit status for different parameters
      const cacheHitEvent = events.find(e => e.data.params?.status === 'cache_hit');
      expect(cacheHitEvent).toBeUndefined();
    });

    test('should differentiate cache based on branch parameter', async () => {
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'develop', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Main content');
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'develop', 'Develop content');

      // Request for main branch
      await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: { branch: 'main' }
        })
        .expect(200);

      // Request for develop branch (should be cache miss)
      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'fetch_testorg_testrepo_documentation',
          params: { branch: 'develop' }
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      const fileEvent = events.find(e => e.data.params?.path === 'CLAUDE.md');
      expect(fileEvent?.data.params.content).toBe('Develop content');
    });

    test('should expire cache after TTL', async () => {
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Content');

      // Set very short TTL for testing
      await cacheManager.setMCPData('testorg', 'testrepo', 'main', true, {
        repo: 'testorg/testrepo',
        branch: 'main',
        claude_md_files: { 'CLAUDE.md': 'Cached content' },
        external_refs: {},
        fetched_at: new Date().toISOString()
      }, 0.1); // 100ms TTL

      // Immediate request should be cache hit
      let response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation'
        })
        .expect(200);

      let events = parseSSEStream(response.text);
      let cacheHitEvent = events.find(e => e.data.params?.status === 'cache_hit');
      expect(cacheHitEvent).toBeDefined();

      // Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next request should be cache miss
      response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'fetch_testorg_testrepo_documentation'
        })
        .expect(200);

      events = parseSSEStream(response.text);
      cacheHitEvent = events.find(e => e.data.params?.status === 'cache_hit');
      expect(cacheHitEvent).toBeUndefined();
    });
  });

  describe('Webhook Cache Invalidation', () => {
    test('should invalidate cache on push webhook', async () => {
      // Pre-populate cache
      await cacheManager.setMCPData('testorg', 'testrepo', 'main', true, {
        repo: 'testorg/testrepo',
        branch: 'main',
        claude_md_files: { 'CLAUDE.md': 'Old content' },
        external_refs: {},
        fetched_at: new Date().toISOString()
      });

      // Verify cache exists
      let cachedData = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
      expect(cachedData).toBeDefined();

      // Send push webhook
      const webhookPayload = {
        ref: 'refs/heads/main',
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo',
          default_branch: 'main'
        },
        commits: [
          {
            id: 'abc123',
            message: 'Update CLAUDE.md',
            modified: ['CLAUDE.md']
          }
        ]
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = generateWebhookSignature(payloadString, 'test-secret-key');

      await request(app)
        .post('/webhook')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'test-delivery-id')
        .send(webhookPayload)
        .expect(200);

      // Cache should be invalidated
      cachedData = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
      expect(cachedData).toBeNull();
    });

    test('should invalidate cache on pull request webhook', async () => {
      // Pre-populate cache
      await cacheManager.setMCPData('testorg', 'testrepo', 'main', true, {
        repo: 'testorg/testrepo',
        branch: 'main',
        claude_md_files: { 'CLAUDE.md': 'Old content' },
        external_refs: {},
        fetched_at: new Date().toISOString()
      });

      const webhookPayload = {
        action: 'opened',
        pull_request: {
          head: { ref: 'feature-branch' },
          base: { ref: 'main' }
        },
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo',
          default_branch: 'main'
        }
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = generateWebhookSignature(payloadString, 'test-secret-key');

      await request(app)
        .post('/webhook')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'pull_request')
        .send(webhookPayload)
        .expect(200);

      // Cache should be invalidated for default branch
      const cachedData = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
      expect(cachedData).toBeNull();
    });

    test('should invalidate all repository cache on repository webhook', async () => {
      // Pre-populate cache for multiple branches
      await cacheManager.setMCPData('testorg', 'testrepo', 'main', true, { test: 'data1' });
      await cacheManager.setMCPData('testorg', 'testrepo', 'develop', true, { test: 'data2' });
      await cacheManager.setMCPData('testorg', 'testrepo', 'feature', false, { test: 'data3' });

      const webhookPayload = {
        action: 'publicized',
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        }
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = generateWebhookSignature(payloadString, 'test-secret-key');

      await request(app)
        .post('/webhook')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'repository')
        .send(webhookPayload)
        .expect(200);

      // All cache entries for this repository should be invalidated
      expect(await cacheManager.getMCPData('testorg', 'testrepo', 'main', true)).toBeNull();
      expect(await cacheManager.getMCPData('testorg', 'testrepo', 'develop', true)).toBeNull();
      expect(await cacheManager.getMCPData('testorg', 'testrepo', 'feature', false)).toBeNull();
    });

    test('should verify webhook signature', async () => {
      const webhookPayload = {
        ref: 'refs/heads/main',
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        }
      };

      const payloadString = JSON.stringify(webhookPayload);
      const invalidSignature = 'sha256=invalid-signature';

      const response = await request(app)
        .post('/webhook')
        .set('X-Hub-Signature-256', invalidSignature)
        .set('X-GitHub-Event', 'push')
        .send(webhookPayload)
        .expect(401);

      expect(response.body.error).toBe('Invalid signature');
    });

    test('should handle webhooks without signature when secret is not configured', async () => {
      // Set environment variable to empty string to disable webhook validation
      process.env.GITHUB_WEBHOOK_SECRET = '';
      
      // Recreate server without webhook secret
      server = new MCPSSEServer(3007);
      app = (server as any).app;

      const webhookPayload = {
        ref: 'refs/heads/main',
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        }
      };

      await request(app)
        .post('/webhook')
        .set('X-GitHub-Event', 'push')
        .send(webhookPayload)
        .expect(200);
    });

    test('should ignore unknown webhook events', async () => {
      const webhookPayload = {
        action: 'unknown',
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        }
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = generateWebhookSignature(payloadString, 'test-secret-key');

      await request(app)
        .post('/webhook')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'unknown_event')
        .send(webhookPayload)
        .expect(200);

      // Response should indicate event was ignored (but still successful)
      // Cache should remain unchanged
    });

    test('should handle malformed webhook payloads', async () => {
      const malformedPayload = {
        // Missing repository information
        ref: 'refs/heads/main'
      };

      const payloadString = JSON.stringify(malformedPayload);
      const signature = generateWebhookSignature(payloadString, 'test-secret-key');

      await request(app)
        .post('/webhook')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'push')
        .send(malformedPayload)
        .expect(200);

      // Should handle gracefully without crashing
    });
  });

  describe('Cache-Webhook Integration', () => {
    test('should serve fresh data after webhook invalidation', async () => {
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Old content');

      // First request - populates cache
      await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation'
        })
        .expect(200);

      // Update mock content (simulating file change)
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'New content');

      // Send webhook to invalidate cache
      const webhookPayload = {
        ref: 'refs/heads/main',
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        }
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = generateWebhookSignature(payloadString, 'test-secret-key');

      await request(app)
        .post('/webhook')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'push')
        .send(webhookPayload)
        .expect(200);

      // Next request should get fresh content
      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'fetch_testorg_testrepo_documentation'
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      const fileEvent = events.find(e => e.data.params?.path === 'CLAUDE.md');
      expect(fileEvent?.data.params.content).toBe('New content');

      // Should not be a cache hit
      const cacheHitEvent = events.find(e => e.data.params?.status === 'cache_hit');
      expect(cacheHitEvent).toBeUndefined();
    });

    test('should maintain cache for unrelated repositories during webhook', async () => {
      // Pre-populate cache for two different repositories
      await cacheManager.setMCPData('testorg', 'testrepo', 'main', true, {
        repo: 'testorg/testrepo',
        claude_md_files: { 'CLAUDE.md': 'Content 1' },
        external_refs: {},
        fetched_at: new Date().toISOString()
      });

      await cacheManager.setMCPData('otherorg', 'otherrepo', 'main', true, {
        repo: 'otherorg/otherrepo',
        claude_md_files: { 'CLAUDE.md': 'Content 2' },
        external_refs: {},
        fetched_at: new Date().toISOString()
      });

      // Send webhook only for testorg/testrepo
      const webhookPayload = {
        ref: 'refs/heads/main',
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        }
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = generateWebhookSignature(payloadString, 'test-secret-key');

      await request(app)
        .post('/webhook')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'push')
        .send(webhookPayload)
        .expect(200);

      // testorg/testrepo cache should be invalidated
      const testRepoCache = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
      expect(testRepoCache).toBeNull();

      // otherorg/otherrepo cache should remain
      const otherRepoCache = await cacheManager.getMCPData('otherorg', 'otherrepo', 'main', true);
      expect(otherRepoCache).toBeDefined();
      expect(otherRepoCache.claude_md_files['CLAUDE.md']).toBe('Content 2');
    });
  });
});