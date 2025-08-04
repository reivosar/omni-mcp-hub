"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reference_resolver_1 = require("../../../src/utils/reference-resolver");
const github_api_1 = require("../../../src/github/github-api");
const fetch_utils_1 = require("../../../src/utils/fetch-utils");
jest.mock('../../../src/github/github-api');
jest.mock('../../../src/utils/fetch-utils', () => ({
    FetchUtils: {
        normalizeGitHubUrl: jest.fn(),
        fetchTextWithRetry: jest.fn()
    }
}));
const MockGitHubAPI = github_api_1.GitHubAPI;
describe('ReferenceResolver', () => {
    let resolver;
    let mockGitHubAPI;
    beforeEach(() => {
        jest.clearAllMocks();
        mockGitHubAPI = {
            getFileContent: jest.fn(),
            getRepoInfo: jest.fn(),
            getFileList: jest.fn(),
            getFileStatus: jest.fn()
        };
        MockGitHubAPI.mockImplementation(() => mockGitHubAPI);
        fetch_utils_1.FetchUtils.normalizeGitHubUrl.mockImplementation((url, branch) => url.replace(/\/blob\/[^\/]+\//, `/blob/${branch}/`));
        fetch_utils_1.FetchUtils.fetchTextWithRetry.mockClear();
        resolver = new reference_resolver_1.ReferenceResolver(mockGitHubAPI);
        console.log = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();
    });
    describe('constructor', () => {
        it('should initialize with GitHubAPI instance', () => {
            expect(resolver).toBeInstanceOf(reference_resolver_1.ReferenceResolver);
            expect(resolver['githubAPI']).toBe(mockGitHubAPI);
            expect(resolver['processedUrls']).toBeInstanceOf(Set);
            expect(resolver['processedUrls'].size).toBe(0);
        });
    });
    describe('extractExternalReferences', () => {
        it('should extract markdown HTTP links ending with .md', () => {
            const content = 'Check out [this guide](https://example.com/guide.md) and [another](https://test.com/readme.md)';
            const refs = resolver['extractExternalReferences'](content);
            expect(refs).toContain('https://example.com/guide.md');
            expect(refs).toContain('https://test.com/readme.md');
        });
        it('should extract bare URLs ending with .md', () => {
            const content = 'See https://example.com/docs.md for more info and https://test.com/api.md';
            const refs = resolver['extractExternalReferences'](content);
            expect(refs).toContain('https://example.com/docs.md');
            expect(refs).toContain('https://test.com/api.md');
        });
        it('should extract GitHub references', () => {
            const content = 'Reference: github:owner/repo/path/file.md and github:user/project/docs/readme.md';
            const refs = resolver['extractExternalReferences'](content);
            expect(refs).toContain('github:owner/repo/path/file.md');
            expect(refs).toContain('github:user/project/docs/readme.md');
        });
        it('should extract relative GitHub references', () => {
            const content = 'See ./docs/guide.md and ../other/readme.md for details';
            const refs = resolver['extractExternalReferences'](content);
            expect(refs).toContain('./docs/guide.md');
            expect(refs).toContain('../other/readme.md');
        });
        it('should remove duplicates and filter empty refs', () => {
            const content = 'Link: [guide](https://example.com/guide.md) and [guide again](https://example.com/guide.md)';
            const refs = resolver['extractExternalReferences'](content);
            expect(refs).toEqual(['https://example.com/guide.md']);
        });
        it('should clean trailing punctuation from GitHub refs', () => {
            const content = 'See github:owner/repo/file.md, github:user/project/readme.md! and github:test/repo/doc.md;';
            const refs = resolver['extractExternalReferences'](content);
            expect(refs).toContain('github:owner/repo/file.md');
            expect(refs).toContain('github:user/project/readme.md');
            expect(refs).toContain('github:test/repo/doc.md');
        });
        it('should skip non-.md URLs', () => {
            const content = 'Links: [image](https://example.com/image.png) [page](https://test.com/page.html) [doc](https://example.com/doc.md)';
            const refs = resolver['extractExternalReferences'](content);
            expect(refs).toHaveLength(1);
            expect(refs).toContain('https://example.com/doc.md');
        });
        it('should handle empty content', () => {
            const refs = resolver['extractExternalReferences']('');
            expect(refs).toEqual([]);
        });
        it('should handle content with no references', () => {
            const content = 'This is just plain text with no external references.';
            const refs = resolver['extractExternalReferences']('');
            expect(refs).toEqual([]);
        });
    });
    describe('fetchExternalContent', () => {
        it('should fetch HTTP URLs using FetchUtils', async () => {
            const url = 'https://example.com/guide.md';
            const branch = 'main';
            const expectedContent = 'Fetched content';
            const options = { timeout: 5000, retries: 2, retryDelay: 500 };
            fetch_utils_1.FetchUtils.normalizeGitHubUrl.mockReturnValue('https://example.com/guide.md');
            fetch_utils_1.FetchUtils.fetchTextWithRetry.mockResolvedValue(expectedContent);
            const result = await resolver['fetchExternalContent'](url, branch, options);
            expect(fetch_utils_1.FetchUtils.normalizeGitHubUrl).toHaveBeenCalledWith(url, branch);
            expect(fetch_utils_1.FetchUtils.fetchTextWithRetry).toHaveBeenCalledWith('https://example.com/guide.md', options);
            expect(result).toBe(expectedContent);
        });
        it('should fetch GitHub references using GitHubAPI', async () => {
            const ref = 'github:owner/repo/path/file.md';
            const branch = 'develop';
            const expectedContent = 'GitHub file content';
            const options = { timeout: 5000, retries: 2, retryDelay: 500 };
            mockGitHubAPI.getFileContent.mockResolvedValue(expectedContent);
            const result = await resolver['fetchExternalContent'](ref, branch, options);
            expect(mockGitHubAPI.getFileContent).toHaveBeenCalledWith('owner', 'repo', 'path/file.md', branch);
            expect(result).toBe(expectedContent);
        });
        it('should throw error for invalid GitHub reference format', async () => {
            const ref = 'github:invalid-format';
            const branch = 'main';
            const options = { timeout: 5000, retries: 2, retryDelay: 500 };
            await expect(resolver['fetchExternalContent'](ref, branch, options))
                .rejects.toThrow('Unsupported reference format: github:invalid-format');
        });
        it('should throw error for unsupported reference format', async () => {
            const ref = 'ftp://example.com/file.md';
            const branch = 'main';
            const options = { timeout: 5000, retries: 2, retryDelay: 500 };
            await expect(resolver['fetchExternalContent'](ref, branch, options))
                .rejects.toThrow('Unsupported reference format: ftp://example.com/file.md');
        });
    });
    describe('resolveReferences', () => {
        const mockContent = 'See [guide](https://example.com/guide.md) for details';
        const branch = 'main';
        it('should resolve external references successfully', async () => {
            const expectedContent = 'Guide content';
            fetch_utils_1.FetchUtils.fetchTextWithRetry.mockResolvedValue(expectedContent);
            const results = await resolver.resolveReferences(mockContent, branch);
            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                url: 'https://example.com/guide.md',
                content: expectedContent,
                references: [],
                depth: 0
            });
        });
        it('should handle fetch errors gracefully', async () => {
            const error = new Error('Network error');
            fetch_utils_1.FetchUtils.fetchTextWithRetry.mockRejectedValue(error);
            const results = await resolver.resolveReferences(mockContent, branch);
            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                url: 'https://example.com/guide.md',
                content: 'Error: Network error',
                references: [],
                error: 'Network error',
                depth: 0
            });
        });
        it('should respect maxDepth limit', async () => {
            const options = { maxDepth: 0 };
            const results = await resolver.resolveReferences(mockContent, branch, options);
            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                url: 'https://example.com/guide.md',
                content: '',
                references: [],
                depth: 0
            });
            expect(fetch_utils_1.FetchUtils.fetchTextWithRetry).not.toHaveBeenCalled();
        });
        it('should prevent infinite loops with processed URLs', async () => {
            resolver['processedUrls'].add('https://example.com/guide.md');
            const results = await resolver.resolveReferences(mockContent, branch);
            expect(results).toHaveLength(0);
            expect(fetch_utils_1.FetchUtils.fetchTextWithRetry).not.toHaveBeenCalled();
        });
        it('should resolve nested references recursively', async () => {
            const firstContent = 'First level [nested](https://example.com/nested.md)';
            const nestedContent = 'Nested content';
            fetch_utils_1.FetchUtils.fetchTextWithRetry
                .mockResolvedValueOnce(firstContent)
                .mockResolvedValueOnce(nestedContent);
            const options = { maxDepth: 2 };
            const results = await resolver.resolveReferences(mockContent, branch, options);
            expect(results).toHaveLength(2);
            expect(results[0].url).toBe('https://example.com/guide.md');
            expect(results[0].depth).toBe(0);
            expect(results[1].url).toBe('https://example.com/nested.md');
            expect(results[1].depth).toBe(1);
        });
        it('should stop recursion at max depth', async () => {
            const options = { maxDepth: 1 };
            const results = await resolver.resolveReferences(mockContent, branch, options, 2);
            expect(results).toHaveLength(0);
            expect(console.log).toHaveBeenCalledWith('Max depth 1 exceeded, stopping recursion');
        });
        it('should handle nested reference resolution errors', async () => {
            const contentWithNested = 'Content with [nested](https://example.com/nested.md)';
            fetch_utils_1.FetchUtils.fetchTextWithRetry
                .mockResolvedValueOnce(contentWithNested)
                .mockRejectedValueOnce(new Error('Nested fetch failed'));
            const options = { maxDepth: 2 };
            const results = await resolver.resolveReferences(mockContent, branch, options);
            expect(results).toHaveLength(2);
            expect(results[0].content).toBe(contentWithNested);
            expect(results[1].content).toBe('Error: Nested fetch failed');
        });
        it('should use default options when not provided', async () => {
            const expectedContent = 'Content';
            fetch_utils_1.FetchUtils.fetchTextWithRetry.mockResolvedValue(expectedContent);
            await resolver.resolveReferences(mockContent, branch);
            expect(fetch_utils_1.FetchUtils.fetchTextWithRetry).toHaveBeenCalledWith(expect.any(String), {
                timeout: 10000,
                retries: 3,
                retryDelay: 1000
            });
        });
        it('should use custom options when provided', async () => {
            const options = {
                timeout: 5000,
                retries: 2,
                retryDelay: 500,
                maxDepth: 1
            };
            const expectedContent = 'Content';
            fetch_utils_1.FetchUtils.fetchTextWithRetry.mockResolvedValue(expectedContent);
            await resolver.resolveReferences(mockContent, branch, options);
            expect(fetch_utils_1.FetchUtils.fetchTextWithRetry).toHaveBeenCalledWith(expect.any(String), {
                timeout: 5000,
                retries: 2,
                retryDelay: 500
            });
        });
        it('should skip nested resolution for error content', async () => {
            const errorContent = 'Error: Failed to fetch';
            fetch_utils_1.FetchUtils.fetchTextWithRetry.mockResolvedValue(errorContent);
            const options = { maxDepth: 2 };
            const results = await resolver.resolveReferences(mockContent, branch, options);
            expect(results).toHaveLength(1);
            expect(results[0].content).toBe(errorContent);
            expect(fetch_utils_1.FetchUtils.fetchTextWithRetry).toHaveBeenCalledTimes(1);
        });
    });
    describe('reset', () => {
        it('should clear processed URLs', () => {
            resolver['processedUrls'].add('https://example.com/test.md');
            resolver['processedUrls'].add('github:owner/repo/file.md');
            resolver.reset();
            expect(resolver['processedUrls'].size).toBe(0);
        });
    });
    describe('getStats', () => {
        it('should return statistics about processed URLs', () => {
            const urls = ['https://example.com/test.md', 'github:owner/repo/file.md'];
            urls.forEach(url => resolver['processedUrls'].add(url));
            const stats = resolver.getStats();
            expect(stats.processedUrls).toBe(2);
            expect(stats.urls).toEqual(expect.arrayContaining(urls));
        });
        it('should return empty stats when no URLs processed', () => {
            const stats = resolver.getStats();
            expect(stats.processedUrls).toBe(0);
            expect(stats.urls).toEqual([]);
        });
    });
    describe('integration scenarios', () => {
        it('should handle complex content with multiple reference types', async () => {
            const complexContent = `
        # Documentation
        
        See [HTTP guide](https://example.com/guide.md) for basics.
        Check out github:owner/repo/advanced.md for advanced topics.
        Also see ./local/docs.md and ../shared/common.md.
        
        Additional resources: https://docs.example.com/api.md
      `;
            fetch_utils_1.FetchUtils.fetchTextWithRetry.mockResolvedValue('Fetched content');
            mockGitHubAPI.getFileContent.mockResolvedValue('GitHub content');
            const results = await resolver.resolveReferences(complexContent, 'main');
            expect(results.length).toBeGreaterThan(3);
            expect(results.some(r => r.url.startsWith('https://'))).toBe(true);
            expect(results.some(r => r.url.startsWith('github:'))).toBe(true);
            expect(results.some(r => r.url.startsWith('./'))).toBe(true);
        });
        it('should handle empty content gracefully', async () => {
            const results = await resolver.resolveReferences('', 'main');
            expect(results).toEqual([]);
            expect(fetch_utils_1.FetchUtils.fetchTextWithRetry).not.toHaveBeenCalled();
            expect(mockGitHubAPI.getFileContent).not.toHaveBeenCalled();
        });
        it('should handle content with no external references', async () => {
            const content = 'This is just plain text with no external references.';
            const results = await resolver.resolveReferences(content, 'main');
            expect(results).toEqual([]);
            expect(fetch_utils_1.FetchUtils.fetchTextWithRetry).not.toHaveBeenCalled();
            expect(mockGitHubAPI.getFileContent).not.toHaveBeenCalled();
        });
    });
});
