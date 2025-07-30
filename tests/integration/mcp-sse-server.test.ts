import request from 'supertest';
import nock from 'nock';
import { MCPSSEServer } from '../../src/mcp-sse-server';
import { MockGitHubAPI } from '../__mocks__/github-api';

// Mock the GitHubAPI
jest.mock('../../src/github-api', () => ({
  GitHubAPI: jest.fn().mockImplementation(() => new MockGitHubAPI())
}));

describe('MCPSSEServer Integration', () => {
  let server: MCPSSEServer;
  let app: any;
  let mockGitHubAPI: MockGitHubAPI;

  beforeEach(() => {
    server = new MCPSSEServer(3001);
    app = (server as any).app;
    
    // Get reference to the mocked GitHub API
    const GitHubAPI = require('../../src/github-api').GitHubAPI;
    mockGitHubAPI = new GitHubAPI();
  });

  afterEach(() => {
    nock.cleanAll();
    if (mockGitHubAPI) {
      mockGitHubAPI.clear();
    }
  });

  describe('GET /mcp', () => {
    test('should return server info via SSE', async () => {
      const response = await request(app)
        .get('/mcp')
        .expect('Content-Type', /text\/event-stream/)
        .expect(200);

      expect(response.text).toContain('event: message');
      expect(response.text).toContain('"method":"server_info"');
      expect(response.text).toContain('"name":"git-mcp-compatible-server"');
    });
  });

  describe('POST /mcp - JSON-RPC requests', () => {
    test('should handle valid fetch documentation request', async () => {
      // Setup mock data
      mockGitHubAPI.setMockFiles('testuser', 'testrepo', 'main', [
        'CLAUDE.md',
        'docs/CLAUDE.md'
      ]);
      mockGitHubAPI.setMockFileContent('testuser', 'testrepo', 'CLAUDE.md', 'main', 
        '# Main CLAUDE.md\nThis is the main documentation.');
      mockGitHubAPI.setMockFileContent('testuser', 'testrepo', 'docs/CLAUDE.md', 'main',
        '# Docs CLAUDE.md\nThis is documentation in docs folder.');

      const request_body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'fetch_testuser_testrepo_documentation',
        params: {
          owner: 'testuser',
          repo: 'testrepo',
          branch: 'main',
          include_externals: false
        }
      };

      const response = await request(app)
        .post('/mcp')
        .send(request_body)
        .expect('Content-Type', /text\/event-stream/)
        .expect(200);

      // Parse SSE response
      const events = parseSSEResponse(response.text);
      
      // Should contain starting message
      expect(events.some(e => 
        e.data.method === 'fetch_owner_repo_documentation' && 
        e.data.params?.status === 'starting'
      )).toBe(true);

      // Should contain file content messages
      expect(events.some(e => 
        e.data.params?.path === 'CLAUDE.md' &&
        e.data.params?.content?.includes('Main CLAUDE.md')
      )).toBe(true);

      expect(events.some(e => 
        e.data.params?.path === 'docs/CLAUDE.md' &&
        e.data.params?.content?.includes('Docs CLAUDE.md')
      )).toBe(true);

      // Should contain completion message
      expect(events.some(e => 
        e.data.id === 1 && 
        e.data.result?.status === 'complete'
      )).toBe(true);
    });

    test('should handle external references when enabled', async () => {
      mockGitHubAPI.setMockFiles('testuser', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testuser', 'testrepo', 'CLAUDE.md', 'main',
        '# Main Docs\nSee [external guide](https://example.com/guide.md) for more info.');

      // Mock external URL
      nock('https://example.com')
        .get('/guide.md')
        .reply(200, '# External Guide\nThis is external documentation.');

      const request_body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'fetch_testuser_testrepo_documentation',
        params: {
          include_externals: true
        }
      };

      const response = await request(app)
        .post('/mcp')
        .send(request_body)
        .expect(200);

      const events = parseSSEResponse(response.text);

      // Should contain file content
      expect(events.some(e => 
        e.data.params?.path === 'CLAUDE.md'
      )).toBe(true);

      // Should contain external reference
      expect(events.some(e => 
        e.data.params?.url === 'https://example.com/guide.md' &&
        e.data.params?.content?.includes('External Guide')
      )).toBe(true);
    });

    test('should handle GitHub rate limit errors', async () => {
      mockGitHubAPI.setMockFiles('ratelimit', 'repo', 'main', []);
      
      // Mock GitHub API to return rate limit error
      const GitHubAPI = require('../../src/github-api').GitHubAPI;
      const originalListFiles = GitHubAPI.prototype.listFiles;
      GitHubAPI.prototype.listFiles = jest.fn().mockRejectedValue(
        new Error('GitHub API rate limit exceeded')
      );

      const request_body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'fetch_ratelimit_repo_documentation'
      };

      const response = await request(app)
        .post('/mcp')
        .send(request_body)
        .expect(200);

      const events = parseSSEResponse(response.text);
      
      // Should contain error response
      expect(events.some(e => 
        e.data.error?.message?.includes('rate limit')
      )).toBe(true);

      // Restore original method
      GitHubAPI.prototype.listFiles = originalListFiles;
    });

    test('should handle invalid JSON-RPC requests', async () => {
      const invalid_request = {
        jsonrpc: '1.0', // Wrong version
        id: 1,
        method: 'test'
      };

      const response = await request(app)
        .post('/mcp')
        .send(invalid_request)
        .expect(200);

      const events = parseSSEResponse(response.text);
      
      expect(events.some(e => 
        e.data.error?.code === -32600 &&
        e.data.error?.message === 'Invalid Request'
      )).toBe(true);
    });

    test('should handle unknown methods', async () => {
      const request_body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown_method'
      };

      const response = await request(app)
        .post('/mcp')
        .send(request_body)
        .expect(200);

      const events = parseSSEResponse(response.text);
      
      expect(events.some(e => 
        e.data.error?.code === -32601 &&
        e.data.error?.message?.includes('Method not found')
      )).toBe(true);
    });

    test('should extract owner/repo from method name', async () => {
      mockGitHubAPI.setMockFiles('owner', 'repo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('owner', 'repo', 'CLAUDE.md', 'main', 'Content');

      const request_body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'fetch_owner_repo_documentation' // No params, should extract from method
      };

      const response = await request(app)
        .post('/mcp')
        .send(request_body)
        .expect(200);

      const events = parseSSEResponse(response.text);

      // Should successfully process the request
      expect(events.some(e => 
        e.data.params?.status === 'starting' &&
        e.data.params?.owner === 'owner' &&
        e.data.params?.repo === 'repo'
      )).toBe(true);
    });
  });

  describe('GET /healthz', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/healthz')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('CORS handling', () => {
    test('should handle CORS preflight requests', async () => {
      await request(app)
        .options('/mcp')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type')
        .expect(204);
    });

    test('should include CORS headers in responses', async () => {
      const response = await request(app)
        .get('/mcp')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });
});

// Helper function to parse SSE response text
function parseSSEResponse(text: string): Array<{ event: string; data: any }> {
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