import request from 'supertest';
import nock from 'nock';
import { MCPSSEServer } from '../../src/servers/mcp-sse-server';
import { MockGitHubAPI } from '../__mocks__/github-api';

// Mock the GitHubAPI
jest.mock('../../src/github/github-api', () => ({
  GitHubAPI: jest.fn().mockImplementation(() => new MockGitHubAPI())
}));

// Helper to parse SSE stream
interface SSEEvent {
  event: string;
  data: any;
  raw: string;
}

function parseSSEStream(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
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
          data: JSON.parse(currentData),
          raw: currentData
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

describe('MCP Protocol Strict Compliance Tests', () => {
  let server: MCPSSEServer;
  let app: any;
  let mockGitHubAPI: MockGitHubAPI;

  beforeEach(() => {
    server = new MCPSSEServer(3004);
    app = (server as any).app;
    
    // Get reference to the mocked GitHub API and inject it
    const GitHubAPI = require('../../src/github/github-api').GitHubAPI;
    mockGitHubAPI = new GitHubAPI();
    
    // Inject the mock into the server
    (server as any).githubAPI = mockGitHubAPI;
    if ((server as any).referenceResolver) {
      (server as any).referenceResolver.githubAPI = mockGitHubAPI;
    }
  });

  beforeAll(() => {
    nock.enableNetConnect(/^(127\.0\.0\.1|localhost|example\.com)/);
  });

  afterEach(() => {
    nock.cleanAll();
    if (mockGitHubAPI) {
      mockGitHubAPI.clear();
    }
  });

  afterAll(() => {
    nock.disableNetConnect();
  });

  describe('External Reference Extraction and Fetching', () => {
    test('should extract and fetch external HTTP references', async () => {
      // Setup CLAUDE.md with external references
      const claudeContent = `# Project Documentation

See the [API Guide](https://api.example.com/guide.md) for details.
Also check [deployment docs](https://deploy.example.com/deploy.md).

## More Info
Direct link: https://direct.example.com/info.md
`;

      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', claudeContent);

      // Mock external URLs
      nock('https://api.example.com')
        .get('/guide.md')
        .reply(200, '# API Guide\\nThis is the API documentation.');
      
      nock('https://deploy.example.com')
        .get('/deploy.md')
        .reply(200, '# Deployment\\nDeployment instructions here.');
      
      nock('https://direct.example.com')
        .get('/info.md')
        .reply(200, '# Info\\nDirect link content.');

      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            include_externals: true
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      // Should have file content
      const fileEvent = events.find(e => e.data.params?.path === 'CLAUDE.md');
      expect(fileEvent).toBeDefined();
      expect(fileEvent?.data.params.content).toBe(claudeContent);

      // Should have external references
      const externalUrls = events
        .filter(e => e.data.params?.url)
        .map(e => e.data.params.url);

      expect(externalUrls).toContain('https://api.example.com/guide.md');
      expect(externalUrls).toContain('https://deploy.example.com/deploy.md');
      expect(externalUrls).toContain('https://direct.example.com/info.md');

      // Should have external content
      const apiEvent = events.find(e => e.data.params?.url === 'https://api.example.com/guide.md');
      expect(apiEvent?.data.params.content).toBe('# API Guide\\nThis is the API documentation.');
    });

    test('should extract and fetch GitHub references with correct branch', async () => {
      const claudeContent = `# Documentation

See github:otherorg/otherrepo/docs/README.md for more info.
Also github:thirdorg/thirdrepo/GUIDE.md.
`;

      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'develop', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'develop', claudeContent);
      
      // Setup external GitHub files with develop branch
      mockGitHubAPI.setMockFileContent('otherorg', 'otherrepo', 'docs/README.md', 'develop', 'External README content');
      mockGitHubAPI.setMockFileContent('thirdorg', 'thirdrepo', 'GUIDE.md', 'develop', 'External GUIDE content');

      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            branch: 'develop',
            include_externals: true
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      // Should fetch external GitHub references with correct branch
      const githubRefs = events.filter(e => e.data.params?.url?.startsWith('github:'));
      expect(githubRefs).toHaveLength(2);

      const readmeRef = events.find(e => e.data.params?.url === 'github:otherorg/otherrepo/docs/README.md');
      expect(readmeRef?.data.params.content).toBe('External README content');

      const guideRef = events.find(e => e.data.params?.url === 'github:thirdorg/thirdrepo/GUIDE.md');
      expect(guideRef?.data.params.content).toBe('External GUIDE content');
    });

    test('should handle external reference fetch errors gracefully', async () => {
      const claudeContent = `# Documentation

See [broken link](https://broken.example.com/missing.md) for info.
`;

      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', claudeContent);

      nock('https://broken.example.com')
        .get('/missing.md')
        .reply(404, 'Not Found');

      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            include_externals: true
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      const errorEvent = events.find(e => e.data.params?.url === 'https://broken.example.com/missing.md');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data.params.content).toContain('Error: HTTP 404');
      expect(errorEvent?.data.params.error).toBe(true);
    });

    test('should handle recursive external references', async () => {
      const rootContent = `# Root Doc

See [guide](https://example.com/guide.md) for more.
`;
      
      const guideContent = `# Guide

Also see [api](https://example.com/api.md).
`;

      const apiContent = `# API

Final documentation here.
`;

      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', rootContent);

      nock('https://example.com')
        .get('/guide.md').reply(200, guideContent)
        .get('/api.md').reply(200, apiContent);

      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            include_externals: true
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      // Should have both levels of external references
      const guideEvent = events.find(e => e.data.params?.url === 'https://example.com/guide.md');
      const apiEvent = events.find(e => e.data.params?.url === 'https://example.com/api.md');

      expect(guideEvent?.data.params.content).toBe(guideContent);
      expect(apiEvent?.data.params.content).toBe(apiContent);
      
      // Should have depth information
      expect(guideEvent?.data.params.depth).toBe(0);
      expect(apiEvent?.data.params.depth).toBe(1);
    });
  });

  describe('include_externals=false Option', () => {
    test('should not fetch external references when include_externals=false', async () => {
      const claudeContent = `# Documentation

See [external guide](https://example.com/guide.md) for details.
Also github:otherorg/otherrepo/README.md.
`;

      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', claudeContent);

      // These should NOT be called
      nock('https://example.com').get('/guide.md').reply(200, 'Should not be fetched');

      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            include_externals: false
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      // Should have file content
      const fileEvents = events.filter(e => e.data.params?.path);
      expect(fileEvents).toHaveLength(1);

      // Should NOT have any external references
      const externalEvents = events.filter(e => e.data.params?.url);
      expect(externalEvents).toHaveLength(0);

      // Verify external URLs were not called
      expect(nock.isDone()).toBe(false);
    });

    test('should default to include_externals=true when not specified', async () => {
      const claudeContent = `# Documentation

See [guide](https://example.com/guide.md).
`;

      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', claudeContent);

      nock('https://example.com')
        .get('/guide.md')
        .reply(200, 'External guide content');

      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            // include_externals not specified, should default to true
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);

      // Should have external reference
      const externalEvent = events.find(e => e.data.params?.url === 'https://example.com/guide.md');
      expect(externalEvent).toBeDefined();
      expect(externalEvent?.data.params.content).toBe('External guide content');
    });
  });

  describe('Branch Specification', () => {
    test('should fetch files from specified branch', async () => {
      const mainContent = 'Main branch content';
      const devContent = 'Development branch content';

      // Setup different content for different branches
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'develop', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', mainContent);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'develop', devContent);

      // Test main branch
      const mainResponse = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: { branch: 'main' }
        })
        .expect(200);

      const mainEvents = parseSSEStream(mainResponse.text);
      const mainFileEvent = mainEvents.find(e => e.data.params?.path === 'CLAUDE.md');
      expect(mainFileEvent?.data.params.content).toBe(mainContent);

      // Test develop branch
      const devResponse = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'fetch_testorg_testrepo_documentation',
          params: { branch: 'develop' }
        })
        .expect(200);

      const devEvents = parseSSEStream(devResponse.text);
      const devFileEvent = devEvents.find(e => e.data.params?.path === 'CLAUDE.md');
      expect(devFileEvent?.data.params.content).toBe(devContent);
    });

    test('should default to main branch when not specified', async () => {
      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Main branch content');

      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            // branch not specified, should default to 'main'
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      const startEvent = events.find(e => e.data.params?.status === 'starting');
      expect(startEvent?.data.params.branch).toBe('main');
    });

    test('should use specified branch for external GitHub references', async () => {
      const claudeContent = `# Documentation

See github:otherorg/otherrepo/README.md
`;

      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'feature', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'feature', claudeContent);
      mockGitHubAPI.setMockFileContent('otherorg', 'otherrepo', 'README.md', 'feature', 'Feature branch external content');

      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            branch: 'feature',
            include_externals: true
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      const externalEvent = events.find(e => e.data.params?.url === 'github:otherorg/otherrepo/README.md');
      expect(externalEvent?.data.params.content).toBe('Feature branch external content');
    });

    test('should normalize external HTTP GitHub URLs with correct branch', async () => {
      const claudeContent = `# Documentation

See [docs](https://github.com/otherorg/otherrepo/blob/main/docs/README.md)
`;

      mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'develop', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'develop', claudeContent);

      // Should normalize to raw URL with develop branch
      nock('https://raw.githubusercontent.com')
        .get('/otherorg/otherrepo/develop/docs/README.md')
        .reply(200, 'Normalized external content');

      const response = await request(app)
        .post('/sse')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'fetch_testorg_testrepo_documentation',
          params: {
            branch: 'develop',
            include_externals: true
          }
        })
        .expect(200);

      const events = parseSSEStream(response.text);
      const externalEvent = events.find(e => e.data.params?.url?.includes('github.com'));
      expect(externalEvent?.data.params.content).toBe('Normalized external content');
    });
  });
});