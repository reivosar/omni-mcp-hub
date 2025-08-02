import nock from 'nock';
import { ReferenceResolver } from '../../src/utils/reference-resolver';
import { MockGitHubAPI } from '../__mocks__/github-api';

describe('ReferenceResolver', () => {
  let resolver: ReferenceResolver;
  let mockGitHubAPI: MockGitHubAPI;

  beforeEach(() => {
    mockGitHubAPI = new MockGitHubAPI();
    resolver = new ReferenceResolver(mockGitHubAPI as any);
    resolver.reset();
  });

  afterEach(() => {
    nock.cleanAll();
    mockGitHubAPI.clear();
  });

  describe('extractExternalReferences', () => {
    test('should extract HTTP markdown links', async () => {
      const content = `
# Documentation
See [external guide](https://example.com/guide.md) for details.
Also check out [API docs](https://api.example.com/docs.md).
`;

      const results = await resolver.resolveReferences(content, 'main', { maxDepth: 0 });
      const urls = results.map(r => r.url);
      
      expect(urls).toContain('https://example.com/guide.md');
      expect(urls).toContain('https://api.example.com/docs.md');
    });

    test('should extract bare URLs', async () => {
      const content = `
# Links
Direct link: https://example.com/direct.md
Another one: https://docs.example.com/readme.md
`;

      const results = await resolver.resolveReferences(content, 'main', { maxDepth: 0 });
      const urls = results.map(r => r.url);
      
      expect(urls).toContain('https://example.com/direct.md');
      expect(urls).toContain('https://docs.example.com/readme.md');
    });

    test('should extract GitHub references', async () => {
      const content = `
# References
See github:user/repo/docs/README.md
Also github:other/project/GUIDE.md
`;

      mockGitHubAPI.setMockFileContent('user', 'repo', 'docs/README.md', 'main', 'README content');
      mockGitHubAPI.setMockFileContent('other', 'project', 'GUIDE.md', 'main', 'GUIDE content');

      const results = await resolver.resolveReferences(content, 'main', { maxDepth: 0 });
      const urls = results.map(r => r.url);
      
      expect(urls).toContain('github:user/repo/docs/README.md');
      expect(urls).toContain('github:other/project/GUIDE.md');
    });

    test('should deduplicate references', async () => {
      const content = `
[Link 1](https://example.com/doc.md)
[Link 2](https://example.com/doc.md)
https://example.com/doc.md
`;

      nock('https://example.com')
        .get('/doc.md')
        .reply(200, 'content');

      const results = await resolver.resolveReferences(content, 'main', { maxDepth: 0 });
      
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://example.com/doc.md');
    });
  });

  describe('reference resolution', () => {
    test('should resolve HTTP references', async () => {
      const content = 'See [guide](https://example.com/guide.md)';
      
      nock('https://example.com')
        .get('/guide.md')
        .reply(200, '# External Guide\nThis is external content.');

      const results = await resolver.resolveReferences(content, 'main');
      
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://example.com/guide.md');
      expect(results[0].content).toBe('# External Guide\nThis is external content.');
      expect(results[0].depth).toBe(0);
    });

    test('should resolve GitHub references', async () => {
      const content = 'See github:user/repo/README.md';
      
      mockGitHubAPI.setMockFileContent('user', 'repo', 'README.md', 'main', '# Project README\nContent here.');

      const results = await resolver.resolveReferences(content, 'main');
      
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('github:user/repo/README.md');
      expect(results[0].content).toBe('# Project README\nContent here.');
    });

    test('should handle fetch errors gracefully', async () => {
      const content = 'See [broken](https://example.com/broken.md)';
      
      nock('https://example.com')
        .get('/broken.md')
        .reply(404, 'Not Found');

      const results = await resolver.resolveReferences(content, 'main');
      
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://example.com/broken.md');
      expect(results[0].content).toContain('Error: HTTP 404');
      expect(results[0].error).toBeDefined();
    });
  });

  describe('recursive resolution', () => {
    test('should resolve nested references', async () => {
      const rootContent = 'See [guide](https://example.com/guide.md)';
      const guideContent = 'Also see [api](https://example.com/api.md)';
      const apiContent = '# API Documentation\nFinal content.';
      
      nock('https://example.com')
        .get('/guide.md')
        .reply(200, guideContent)
        .get('/api.md')
        .reply(200, apiContent);

      const results = await resolver.resolveReferences(rootContent, 'main', { maxDepth: 2 });
      
      expect(results).toHaveLength(2);
      
      const guideResult = results.find(r => r.url === 'https://example.com/guide.md');
      const apiResult = results.find(r => r.url === 'https://example.com/api.md');
      
      expect(guideResult?.depth).toBe(0);
      expect(guideResult?.references).toContain('https://example.com/api.md');
      expect(apiResult?.depth).toBe(1);
    });

    test('should respect max depth', async () => {
      const content1 = 'See [doc2](https://example.com/doc2.md)';
      const content2 = 'See [doc3](https://example.com/doc3.md)';
      const content3 = 'See [doc4](https://example.com/doc4.md)';
      
      nock('https://example.com')
        .get('/doc2.md').reply(200, content2)
        .get('/doc3.md').reply(200, content3);
      
      // Should not fetch doc4.md due to maxDepth=2
      const results = await resolver.resolveReferences(content1, 'main', { maxDepth: 2 });
      
      expect(results).toHaveLength(2); // doc2 and doc3, but not doc4
      expect(results.some(r => r.url === 'https://example.com/doc4.md')).toBe(false);
    });

    test('should prevent infinite loops', async () => {
      const content1 = 'See [doc2](https://example.com/doc2.md)';
      const content2 = 'See [doc1](https://example.com/doc1.md)'; // Circular reference
      
      nock('https://example.com')
        .get('/doc2.md').reply(200, content2)
        .get('/doc1.md').reply(200, content1);

      const results = await resolver.resolveReferences(content1, 'main', { maxDepth: 3 });
      
      // Should resolve both doc2 and doc1, but prevent infinite recursion
      expect(results).toHaveLength(2);
      expect(results.some(r => r.url === 'https://example.com/doc2.md')).toBe(true);
      expect(results.some(r => r.url === 'https://example.com/doc1.md')).toBe(true);
      
      // Verify no deeper recursion occurred (would indicate infinite loop prevention)
      expect(results.every(r => r.depth <= 1)).toBe(true);
    });
  });

  describe('branch consistency', () => {
    test('should use specified branch for GitHub references', async () => {
      const content = 'See github:user/repo/README.md';
      
      mockGitHubAPI.setMockFileContent('user', 'repo', 'README.md', 'dev', 'Dev branch content');

      const results = await resolver.resolveReferences(content, 'dev');
      
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Dev branch content');
    });

    test('should normalize GitHub URLs with correct branch', async () => {
      const content = 'See [doc](https://github.com/user/repo/blob/main/README.md)';
      
      nock('https://raw.githubusercontent.com')
        .get('/user/repo/feature/README.md')  // Should use 'feature' branch
        .reply(200, 'Feature branch content');

      const results = await resolver.resolveReferences(content, 'feature');
      
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Feature branch content');
    });
  });

  describe('timeout and retry', () => {
    test('should respect timeout settings', async () => {
      const content = 'See [slow](https://example.com/slow.md)';
      
      nock('https://example.com')
        .get('/slow.md')
        .delay(200)
        .reply(200, 'slow content');

      const results = await resolver.resolveReferences(content, 'main', {
        timeout: 100,
        retries: 0
      });
      
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('Request timeout after 100ms');
      expect(results[0].error).toBeDefined();
    });

    test('should retry failed requests', async () => {
      const content = 'See [flaky](https://example.com/flaky.md)';
      
      nock('https://example.com')
        .get('/flaky.md').reply(500, 'Server Error')
        .get('/flaky.md').reply(200, 'success on retry');

      const results = await resolver.resolveReferences(content, 'main', {
        retries: 2,
        retryDelay: 10
      });
      
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('success on retry');
    });
  });

  describe('statistics and utilities', () => {
    test('should track processed URLs', async () => {
      const content = `
[doc1](https://example.com/doc1.md)
[doc2](https://example.com/doc2.md)
`;

      nock('https://example.com')
        .get('/doc1.md').reply(200, 'content1')
        .get('/doc2.md').reply(200, 'content2');

      await resolver.resolveReferences(content, 'main');
      
      const stats = resolver.getStats();
      expect(stats.processedUrls).toBe(2);
      expect(stats.urls).toContain('https://example.com/doc1.md');
      expect(stats.urls).toContain('https://example.com/doc2.md');
    });

    test('should reset processed URLs', async () => {
      const content = 'See [doc](https://example.com/doc.md)';
      
      nock('https://example.com')
        .get('/doc.md').reply(200, 'content');

      await resolver.resolveReferences(content, 'main');
      expect(resolver.getStats().processedUrls).toBe(1);
      
      resolver.reset();
      expect(resolver.getStats().processedUrls).toBe(0);
    });
  });
});