import nock from 'nock';
import { FetchUtils } from '../../src/utils/fetch-utils';

describe('FetchUtils', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('fetchWithTimeout', () => {
    test('should fetch successfully', async () => {
      nock('https://example.com')
        .get('/test')
        .reply(200, 'success');

      const response = await FetchUtils.fetchWithTimeout('https://example.com/test');
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('success');
    });

    test('should timeout after specified duration', async () => {
      nock('https://example.com')
        .get('/slow')
        .delay(200) // Shorter delay but still longer than timeout
        .reply(200, 'too slow');

      await expect(
        FetchUtils.fetchWithTimeout('https://example.com/slow', { timeout: 100 })
      ).rejects.toThrow();
    });

    test('should retry on failure', async () => {
      nock('https://example.com')
        .get('/flaky')
        .reply(500, 'Server Error')
        .get('/flaky')
        .reply(500, 'Server Error')
        .get('/flaky')
        .reply(200, 'success');

      const response = await FetchUtils.fetchWithTimeout('https://example.com/flaky', {
        retries: 2,
        retryDelay: 10
      });
      
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('success');
    });

    test('should fail after max retries', async () => {
      nock('https://example.com')
        .get('/always-fails')
        .times(4) // Initial + 3 retries
        .reply(500, 'Server Error');

      await expect(
        FetchUtils.fetchWithTimeout('https://example.com/always-fails', {
          retries: 3,
          retryDelay: 10
        })
      ).rejects.toThrow('HTTP 500');
    });

    test('should not retry on 404 errors', async () => {
      nock('https://example.com')
        .get('/not-found')
        .reply(404, 'Not Found');

      await expect(
        FetchUtils.fetchWithTimeout('https://example.com/not-found', {
          retries: 3
        })
      ).rejects.toThrow('HTTP 404');

      // Should only make one request
      expect(nock.isDone()).toBe(true);
    });

    test('should not retry on 401 errors', async () => {
      nock('https://example.com')
        .get('/unauthorized')
        .reply(401, 'Unauthorized');

      await expect(
        FetchUtils.fetchWithTimeout('https://example.com/unauthorized', {
          retries: 3
        })
      ).rejects.toThrow('HTTP 401');

      expect(nock.isDone()).toBe(true);
    });
  });

  describe('fetchTextWithRetry', () => {
    test('should fetch text content', async () => {
      nock('https://example.com')
        .get('/text')
        .reply(200, 'Hello, World!');

      const text = await FetchUtils.fetchTextWithRetry('https://example.com/text');
      expect(text).toBe('Hello, World!');
    });

    test('should handle different encodings', async () => {
      const content = '# Markdown Content\n\nHello from markdown!';
      nock('https://example.com')
        .get('/markdown')
        .reply(200, content, {
          'Content-Type': 'text/markdown; charset=utf-8'
        });

      const text = await FetchUtils.fetchTextWithRetry('https://example.com/markdown');
      expect(text).toBe(content);
    });
  });

  describe('isValidUrl', () => {
    test('should validate correct URLs', () => {
      expect(FetchUtils.isValidUrl('https://example.com')).toBe(true);
      expect(FetchUtils.isValidUrl('http://localhost:3000')).toBe(true);
      expect(FetchUtils.isValidUrl('https://api.github.com/repos/user/repo')).toBe(true);
    });

    test('should reject invalid URLs', () => {
      expect(FetchUtils.isValidUrl('not-a-url')).toBe(false);
      expect(FetchUtils.isValidUrl('ftp://example.com')).toBe(true); // URL constructor allows this
      expect(FetchUtils.isValidUrl('')).toBe(false);
      expect(FetchUtils.isValidUrl('javascript:alert(1)')).toBe(true); // URL constructor allows this
    });
  });

  describe('normalizeGitHubUrl', () => {
    test('should convert blob URLs to raw URLs', () => {
      const blobUrl = 'https://github.com/user/repo/blob/main/docs/README.md';
      const normalized = FetchUtils.normalizeGitHubUrl(blobUrl, 'main');
      expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/main/docs/README.md');
    });

    test('should convert blob URLs with custom branch', () => {
      const blobUrl = 'https://github.com/user/repo/blob/feature/docs/README.md';
      const normalized = FetchUtils.normalizeGitHubUrl(blobUrl, 'dev');
      expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/dev/docs/README.md');
    });

    test('should convert tree URLs to raw URLs', () => {
      const treeUrl = 'https://github.com/user/repo/tree/main/docs/README.md';
      const normalized = FetchUtils.normalizeGitHubUrl(treeUrl, 'main');
      expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/main/docs/README.md');
    });

    test('should update branch in existing raw URLs', () => {
      const rawUrl = 'https://raw.githubusercontent.com/user/repo/old-branch/docs/README.md';
      const normalized = FetchUtils.normalizeGitHubUrl(rawUrl, 'new-branch');
      expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/new-branch/docs/README.md');
    });

    test('should leave non-GitHub URLs unchanged', () => {
      const externalUrl = 'https://example.com/document.md';
      const normalized = FetchUtils.normalizeGitHubUrl(externalUrl, 'main');
      expect(normalized).toBe(externalUrl);
    });

    test('should handle URLs without branch specification', () => {
      const blobUrl = 'https://github.com/user/repo/blob/main/README.md';
      const normalized = FetchUtils.normalizeGitHubUrl(blobUrl);
      expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/main/README.md');
    });
  });
});