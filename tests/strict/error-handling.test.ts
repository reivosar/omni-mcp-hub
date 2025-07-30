import request from 'supertest';
import nock from 'nock';
import { MCPSSEServer } from '../../src/mcp-sse-server';
import { MockGitHubAPI } from '../__mocks__/github-api';

// Mock the GitHubAPI
jest.mock('../../src/github-api', () => ({
  GitHubAPI: jest.fn().mockImplementation(() => new MockGitHubAPI())
}));

function parseSSEStream(text: string): Array<{ event: string; data: any }> {
  const events: Array<{ event: string; data: any }> = [];
  const lines = text.split('\\n');
  
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

describe('Error Handling and Edge Cases', () => {
  let server: MCPSSEServer;
  let app: any;
  let mockGitHubAPI: MockGitHubAPI;

  beforeEach(() => {
    server = new MCPSSEServer(3005);
    app = (server as any).app;
    
    const GitHubAPI = require('../../src/github-api').GitHubAPI;
    mockGitHubAPI = new GitHubAPI();
  });

  afterEach(() => {
    nock.cleanAll();
    if (mockGitHubAPI) {
      mockGitHubAPI.clear();
    }
  });

  describe('File Not Found Errors', () => {
    test('should handle repository not found', async () => {
      // Mock GitHub API to throw repository not found error
      const GitHubAPI = require('../../src/github-api').GitHubAPI;
      const originalListFiles = GitHubAPI.prototype.listFiles;
      GitHubAPI.prototype.listFiles = jest.fn().mockRejectedValue(
        new Error('Repository nonexistent/repo not found or branch main does not exist')
      );

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_nonexistent_repo_documentation',
          params: {
            owner: 'nonexistent',
            repo: 'repo'
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      
      // Should contain error in final response
      const errorEvent = events.find(e => e.data.error);
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data.id).toBe(1);
      expect(errorEvent?.data.error.message).toContain('not found');

      // Restore original method
      GitHubAPI.prototype.listFiles = originalListFiles;
    });

    test('should handle branch not found', async () => {
      const GitHubAPI = require('../../src/github-api').GitHubAPI;
      const originalListFiles = GitHubAPI.prototype.listFiles;
      GitHubAPI.prototype.listFiles = jest.fn().mockRejectedValue(
        new Error('Repository testorg/testrepo not found or branch nonexistent does not exist')
      );

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            branch: 'nonexistent'
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      
      const errorEvent = events.find(e => e.data.error);
      expect(errorEvent?.data.id).toBe(2);
      expect(errorEvent?.data.error.message).toContain('does not exist');

      GitHubAPI.prototype.listFiles = originalListFiles;
    });

    test('should handle empty repository (no CLAUDE.md files)', async () => {
      mockGitHubAPI.setMockFiles('empty', 'repo', 'main', []); // No files

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'fetch_empty_repo_documentation'
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      // Should complete successfully but with no file events
      const fileEvents = events.filter(e => e.data.params?.path);
      expect(fileEvents).toHaveLength(0);

      const completeEvent = events.find(e => e.data.id === 3 && e.data.result);
      expect(completeEvent).toBeDefined();
      expect(completeEvent?.data.result.status).toBe('complete');
    });

    test('should handle individual file read errors', async () => {
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md', 'docs/CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Good content');
      // docs/CLAUDE.md will fail to fetch (not set up)

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 4,
          method: 'fetch_testorg_testrepo_documentation'
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      // Should have success for first file
      const goodFileEvent = events.find(e => e.data.params?.path === 'CLAUDE.md');
      expect(goodFileEvent?.data.params.content).toBe('Good content');
      expect(goodFileEvent?.data.params.error).toBeUndefined();

      // Should have error for second file
      const badFileEvent = events.find(e => e.data.params?.path === 'docs/CLAUDE.md');
      expect(badFileEvent?.data.params.content).toContain('Error:');
      expect(badFileEvent?.data.params.error).toBe(true);

      // Should still complete
      const completeEvent = events.find(e => e.data.id === 4);
      expect(completeEvent?.data.result.status).toBe('complete');
    });
  });

  describe('Authentication and Rate Limiting', () => {
    test('should handle GitHub API rate limit errors', async () => {
      const GitHubAPI = require('../../src/github-api').GitHubAPI;
      const originalListFiles = GitHubAPI.prototype.listFiles;
      GitHubAPI.prototype.listFiles = jest.fn().mockRejectedValue(
        new Error('GitHub API rate limit exceeded')
      );

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 5,
          method: 'fetch_testorg_testrepo_documentation'
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      
      const errorEvent = events.find(e => e.data.error);
      expect(errorEvent?.data.error.message).toContain('rate limit');

      GitHubAPI.prototype.listFiles = originalListFiles;
    });

    test('should handle authentication failures', async () => {
      const GitHubAPI = require('../../src/github-api').GitHubAPI;
      const originalListFiles = GitHubAPI.prototype.listFiles;
      GitHubAPI.prototype.listFiles = jest.fn().mockRejectedValue(
        new Error('GitHub API error: 401 Unauthorized')
      );

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 6,
          method: 'fetch_private_repo_documentation'
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      
      const errorEvent = events.find(e => e.data.error);
      expect(errorEvent?.data.error.message).toContain('Unauthorized');

      GitHubAPI.prototype.listFiles = originalListFiles;
    });
  });

  describe('JSON-RPC Protocol Errors', () => {
    test('should handle invalid JSON-RPC version', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '1.0', // Wrong version
          id: 7,
          method: 'fetch_test_test_documentation'
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      
      const errorEvent = events.find(e => e.data.error);
      expect(errorEvent?.data.error.code).toBe(-32600);
      expect(errorEvent?.data.error.message).toBe('Invalid Request');
      expect(errorEvent?.data.id).toBe(7);
    });

    test('should handle unknown methods', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 8,
          method: 'unknown_method'
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      
      const errorEvent = events.find(e => e.data.error);
      expect(errorEvent?.data.error.code).toBe(-32601);
      expect(errorEvent?.data.error.message).toContain('Method not found');
      expect(errorEvent?.data.id).toBe(8);
    });

    test('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .send('{"jsonrpc": "2.0", "id": 9, "method": incomplete}')
        .expect(200);

      const events = parseSSEStream(response.text);
      
      // Should handle JSON parse error gracefully
      const errorEvent = events.find(e => e.data.error);
      expect(errorEvent).toBeDefined();
    });

    test('should handle missing required parameters', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 10,
          method: 'fetch_owner_repo_documentation'
          // Missing params
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      
      // Should attempt to extract from method name or provide defaults
      const startEvent = events.find(e => e.data.params?.status === 'starting');
      expect(startEvent).toBeDefined();
    });
  });

  describe('External Reference Errors', () => {
    test('should handle external HTTP timeouts', async () => {
      const claudeContent = 'See [slow link](https://slow.example.com/doc.md)';
      
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', claudeContent);

      nock('https://slow.example.com')
        .get('/doc.md')
        .delay(15000) // 15 second delay, longer than timeout
        .reply(200, 'slow content');

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 11,
          method: 'fetch_testorg_testrepo_documentation',
          params: { include_externals: true }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      const externalEvent = events.find(e => e.data.params?.url === 'https://slow.example.com/doc.md');
      expect(externalEvent?.data.params.content).toContain('timeout');
      expect(externalEvent?.data.params.error).toBe(true);
    });

    test('should handle external HTTP errors (404, 500, etc.)', async () => {
      const claudeContent = `
See [not found](https://example.com/404.md)
And [server error](https://example.com/500.md)
`;
      
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', claudeContent);

      nock('https://example.com')
        .get('/404.md').reply(404, 'Not Found')
        .get('/500.md').reply(500, 'Internal Server Error');

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 12,
          method: 'fetch_testorg_testrepo_documentation',
          params: { include_externals: true }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      const notFoundEvent = events.find(e => e.data.params?.url === 'https://example.com/404.md');
      expect(notFoundEvent?.data.params.content).toContain('HTTP 404');
      expect(notFoundEvent?.data.params.error).toBe(true);

      const serverErrorEvent = events.find(e => e.data.params?.url === 'https://example.com/500.md');
      expect(serverErrorEvent?.data.params.content).toContain('HTTP 500');
      expect(serverErrorEvent?.data.params.error).toBe(true);
    });

    test('should handle external GitHub reference errors', async () => {
      const claudeContent = 'See github:nonexistent/repo/README.md';
      
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', claudeContent);
      // nonexistent/repo/README.md not set up, will fail

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 13,
          method: 'fetch_testorg_testrepo_documentation',
          params: { include_externals: true }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      const externalEvent = events.find(e => e.data.params?.url === 'github:nonexistent/repo/README.md');
      expect(externalEvent?.data.params.content).toContain('not found');
      expect(externalEvent?.data.params.error).toBe(true);
    });

    test('should handle malformed external URLs', async () => {
      const claudeContent = 'See [malformed](not-a-url) and [another](ftp://invalid.url/doc.md)';
      
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', claudeContent);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 14,
          method: 'fetch_testorg_testrepo_documentation',
          params: { include_externals: true }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      // Should not attempt to fetch malformed URLs
      const externalEvents = events.filter(e => e.data.params?.url);
      const malformedUrls = externalEvents.filter(e => 
        e.data.params.url === 'not-a-url' || e.data.params.url === 'ftp://invalid.url/doc.md'
      );
      
      // These should either not appear or appear with errors
      expect(malformedUrls.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Internal Server Errors', () => {
    test('should handle cache errors gracefully', async () => {
      // Mock cache to throw error
      const cacheManager = (server as any).cacheManager;
      const originalGet = cacheManager.getMCPData;
      cacheManager.getMCPData = jest.fn().mockRejectedValue(new Error('Cache error'));

      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Content');

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 15,
          method: 'fetch_testorg_testrepo_documentation'
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      // Should still process the request despite cache error
      const fileEvent = events.find(e => e.data.params?.path === 'CLAUDE.md');
      expect(fileEvent?.data.params.content).toBe('Content');

      // Restore original method
      cacheManager.getMCPData = originalGet;
    });

    test('should handle concurrent request errors', async () => {
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Content');

      // Send multiple concurrent requests
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/mcp')
          .send({
            jsonrpc: '2.0',
            id: 20 + i,
            method: 'fetch_testorg_testrepo_documentation'
          })
          .expect(200)
      );

      const responses = await Promise.all(promises);

      // All requests should complete successfully
      responses.forEach((response, i) => {
        const events = parseSSEStream(response.text);
        const completeEvent = events.find(e => e.data.id === 20 + i);
        expect(completeEvent?.data.result.status).toBe('complete');
      });
    });
  });
});