"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nock_1 = __importDefault(require("nock"));
const fetch_utils_1 = require("../../../src/utils/fetch-utils");
describe('FetchUtils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    afterEach(() => {
        nock_1.default.cleanAll();
        jest.useRealTimers();
    });
    describe('fetchWithTimeout', () => {
        test('should fetch successfully', async () => {
            (0, nock_1.default)('https://example.com')
                .get('/test')
                .reply(200, 'success');
            const response = await fetch_utils_1.FetchUtils.fetchWithTimeout('https://example.com/test');
            expect(response.status).toBe(200);
            expect(await response.text()).toBe('success');
        });
        test('should timeout after specified duration', async () => {
            (0, nock_1.default)('https://example.com')
                .get('/slow')
                .delay(200)
                .reply(200, 'too slow');
            await expect(fetch_utils_1.FetchUtils.fetchWithTimeout('https://example.com/slow', {
                timeout: 100,
                retries: 0
            })).rejects.toThrow('Request timeout after 100ms');
        });
        test('should retry on failure', async () => {
            (0, nock_1.default)('https://example.com')
                .get('/flaky')
                .reply(500, 'Server Error')
                .get('/flaky')
                .reply(500, 'Server Error')
                .get('/flaky')
                .reply(200, 'success');
            const response = await fetch_utils_1.FetchUtils.fetchWithTimeout('https://example.com/flaky', {
                retries: 2,
                retryDelay: 1
            });
            expect(response.status).toBe(200);
            expect(await response.text()).toBe('success');
        });
        test('should fail after max retries', async () => {
            (0, nock_1.default)('https://example.com')
                .get('/always-fails')
                .times(4)
                .reply(500, 'Server Error');
            await expect(fetch_utils_1.FetchUtils.fetchWithTimeout('https://example.com/always-fails', {
                retries: 3,
                retryDelay: 1
            })).rejects.toThrow('HTTP 500');
        });
        test('should not retry on 404 errors', async () => {
            (0, nock_1.default)('https://example.com')
                .get('/not-found')
                .reply(404, 'Not Found');
            await expect(fetch_utils_1.FetchUtils.fetchWithTimeout('https://example.com/not-found', {
                retries: 3
            })).rejects.toThrow('HTTP 404');
            expect(nock_1.default.isDone()).toBe(true);
        });
        test('should not retry on 401 errors', async () => {
            (0, nock_1.default)('https://example.com')
                .get('/unauthorized')
                .reply(401, 'Unauthorized');
            await expect(fetch_utils_1.FetchUtils.fetchWithTimeout('https://example.com/unauthorized', {
                retries: 3
            })).rejects.toThrow('HTTP 401');
            expect(nock_1.default.isDone()).toBe(true);
        });
    });
    describe('fetchTextWithRetry', () => {
        test('should fetch text content', async () => {
            (0, nock_1.default)('https://example.com')
                .get('/text')
                .reply(200, 'Hello, World!');
            const text = await fetch_utils_1.FetchUtils.fetchTextWithRetry('https://example.com/text');
            expect(text).toBe('Hello, World!');
        });
        test('should handle different encodings', async () => {
            const content = '# Markdown Content\n\nHello from markdown!';
            (0, nock_1.default)('https://example.com')
                .get('/markdown')
                .reply(200, content, {
                'Content-Type': 'text/markdown; charset=utf-8'
            });
            const text = await fetch_utils_1.FetchUtils.fetchTextWithRetry('https://example.com/markdown');
            expect(text).toBe(content);
        });
    });
    describe('isValidUrl', () => {
        test('should validate correct URLs', () => {
            expect(fetch_utils_1.FetchUtils.isValidUrl('https://example.com')).toBe(true);
            expect(fetch_utils_1.FetchUtils.isValidUrl('http://localhost:3000')).toBe(true);
            expect(fetch_utils_1.FetchUtils.isValidUrl('https://api.github.com/repos/user/repo')).toBe(true);
        });
        test('should reject invalid URLs', () => {
            expect(fetch_utils_1.FetchUtils.isValidUrl('not-a-url')).toBe(false);
            expect(fetch_utils_1.FetchUtils.isValidUrl('ftp://example.com')).toBe(true);
            expect(fetch_utils_1.FetchUtils.isValidUrl('')).toBe(false);
            expect(fetch_utils_1.FetchUtils.isValidUrl('javascript:alert(1)')).toBe(true);
        });
    });
    describe('normalizeGitHubUrl', () => {
        test('should convert blob URLs to raw URLs', () => {
            const blobUrl = 'https://github.com/user/repo/blob/main/docs/README.md';
            const normalized = fetch_utils_1.FetchUtils.normalizeGitHubUrl(blobUrl, 'main');
            expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/main/docs/README.md');
        });
        test('should convert blob URLs with custom branch', () => {
            const blobUrl = 'https://github.com/user/repo/blob/feature/docs/README.md';
            const normalized = fetch_utils_1.FetchUtils.normalizeGitHubUrl(blobUrl, 'dev');
            expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/dev/docs/README.md');
        });
        test('should convert tree URLs to raw URLs', () => {
            const treeUrl = 'https://github.com/user/repo/tree/main/docs/README.md';
            const normalized = fetch_utils_1.FetchUtils.normalizeGitHubUrl(treeUrl, 'main');
            expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/main/docs/README.md');
        });
        test('should update branch in existing raw URLs', () => {
            const rawUrl = 'https://raw.githubusercontent.com/user/repo/old-branch/docs/README.md';
            const normalized = fetch_utils_1.FetchUtils.normalizeGitHubUrl(rawUrl, 'new-branch');
            expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/new-branch/docs/README.md');
        });
        test('should leave non-GitHub URLs unchanged', () => {
            const externalUrl = 'https://example.com/document.md';
            const normalized = fetch_utils_1.FetchUtils.normalizeGitHubUrl(externalUrl, 'main');
            expect(normalized).toBe(externalUrl);
        });
        test('should handle URLs without branch specification', () => {
            const blobUrl = 'https://github.com/user/repo/blob/main/README.md';
            const normalized = fetch_utils_1.FetchUtils.normalizeGitHubUrl(blobUrl);
            expect(normalized).toBe('https://raw.githubusercontent.com/user/repo/main/README.md');
        });
    });
});
