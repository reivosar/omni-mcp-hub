"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const rest_server_1 = require("../../../src/servers/rest-server");
const github_api_1 = require("../../../src/github/github-api");
const cache_1 = require("../../../src/cache/cache");
const crypto_1 = __importDefault(require("crypto"));
jest.mock('express');
jest.mock('../../../src/github/github-api');
jest.mock('../../../src/cache/cache');
jest.mock('cors', () => jest.fn(() => (req, res, next) => next()));
jest.mock('crypto');
global.fetch = jest.fn();
const MockExpress = express_1.default;
const MockGitHubAPI = github_api_1.GitHubAPI;
const MockCacheManager = cache_1.CacheManager;
const mockCrypto = crypto_1.default;
describe('RESTServer', () => {
    let server;
    let mockApp;
    let mockGithubAPI;
    let mockCacheManager;
    beforeEach(() => {
        jest.clearAllMocks();
        mockApp = {
            use: jest.fn(),
            get: jest.fn(),
            post: jest.fn(),
            listen: jest.fn()
        };
        MockExpress.mockReturnValue(mockApp);
        MockExpress.json = jest.fn();
        MockExpress.raw = jest.fn();
        mockGithubAPI = {
            listFiles: jest.fn(),
            getFileContent: jest.fn(),
            getRateLimit: jest.fn()
        };
        MockGitHubAPI.mockImplementation(() => mockGithubAPI);
        mockCacheManager = {
            getMCPData: jest.fn(),
            setMCPData: jest.fn(),
            invalidateBranch: jest.fn(),
            invalidateRepo: jest.fn(),
            getCacheStats: jest.fn().mockReturnValue({ size: 10 })
        };
        MockCacheManager.mockImplementation(() => mockCacheManager);
        const mockHmac = {
            update: jest.fn().mockReturnThis(),
            digest: jest.fn(() => 'mocked-hash')
        };
        mockCrypto.createHmac = jest.fn(() => mockHmac);
        mockCrypto.timingSafeEqual = jest.fn(() => true);
        server = new rest_server_1.RESTServer(3000);
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });
    describe('constructor', () => {
        it('should initialize with default port', () => {
            const defaultServer = new rest_server_1.RESTServer();
            expect(MockExpress).toHaveBeenCalled();
            expect(MockGitHubAPI).toHaveBeenCalled();
            expect(MockCacheManager).toHaveBeenCalled();
        });
        it('should initialize with custom port', () => {
            expect(MockExpress).toHaveBeenCalled();
            expect(MockGitHubAPI).toHaveBeenCalled();
            expect(MockCacheManager).toHaveBeenCalled();
        });
        it('should setup middleware', () => {
            expect(mockApp.use).toHaveBeenCalled();
            expect(MockExpress.json).toHaveBeenCalled();
            expect(MockExpress.raw).toHaveBeenCalledWith({ type: 'application/x-hub-signature-256' });
        });
        it('should setup all routes', () => {
            expect(mockApp.get).toHaveBeenCalledWith('/healthz', expect.any(Function));
            expect(mockApp.get).toHaveBeenCalledWith('/metrics', expect.any(Function));
            expect(mockApp.get).toHaveBeenCalledWith('/:owner/:repo/sse', expect.any(Function));
            expect(mockApp.get).toHaveBeenCalledWith('/:owner/:repo/files', expect.any(Function));
            expect(mockApp.get).toHaveBeenCalledWith('/:owner/:repo/raw/*', expect.any(Function));
            expect(mockApp.post).toHaveBeenCalledWith('/webhook/github', expect.any(Function));
            expect(mockApp.get).toHaveBeenCalledWith('/config', expect.any(Function));
            expect(mockApp.get).toHaveBeenCalledWith('/version', expect.any(Function));
        });
    });
    describe('health check endpoint', () => {
        it('should respond with ok status', () => {
            const healthHandler = mockApp.get.mock.calls.find((call) => call[0] === '/healthz')[1];
            const mockReq = {};
            const mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            healthHandler(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
        });
    });
    describe('metrics endpoint', () => {
        it('should return Prometheus metrics', () => {
            const metricsHandler = mockApp.get.mock.calls.find((call) => call[0] === '/metrics')[1];
            const mockReq = {};
            const mockRes = {
                set: jest.fn(),
                send: jest.fn()
            };
            metricsHandler(mockReq, mockRes);
            expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/plain; version=0.0.4');
            expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('http_requests_total'));
            expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('cache_hits_total'));
            expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('cache_misses_total'));
        });
    });
    describe('MCP SSE endpoint', () => {
        let mockReq;
        let mockRes;
        beforeEach(() => {
            mockReq = {
                params: { owner: 'test-owner', repo: 'test-repo' },
                query: { branch: 'main', include_externals: 'true' },
                get: jest.fn()
            };
            mockRes = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis()
            };
        });
        it('should handle successful MCP data request with cache hit', async () => {
            const cachedData = {
                repo: 'test-owner/test-repo',
                branch: 'main',
                claude_md_files: { 'CLAUDE.md': 'cached content' },
                external_refs: {},
                fetched_at: '2023-01-01T00:00:00.000Z'
            };
            mockCacheManager.getMCPData.mockResolvedValue(cachedData);
            const mcpHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/sse')[1];
            await mcpHandler(mockReq, mockRes);
            expect(mockCacheManager.getMCPData).toHaveBeenCalledWith('test-owner', 'test-repo', 'main', true);
            expect(mockRes.json).toHaveBeenCalledWith(cachedData);
        });
        it('should handle successful MCP data request with cache miss', async () => {
            mockCacheManager.getMCPData.mockResolvedValue(null);
            mockGithubAPI.listFiles.mockResolvedValue(['CLAUDE.md']);
            mockGithubAPI.getFileContent.mockResolvedValue('# Test content');
            const mcpHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/sse')[1];
            await mcpHandler(mockReq, mockRes);
            expect(mockGithubAPI.listFiles).toHaveBeenCalledWith('test-owner', 'test-repo', 'main', 'CLAUDE.md', undefined);
            expect(mockGithubAPI.getFileContent).toHaveBeenCalledWith('test-owner', 'test-repo', 'CLAUDE.md', 'main', undefined);
            expect(mockCacheManager.setMCPData).toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                repo: 'test-owner/test-repo',
                branch: 'main',
                claude_md_files: { 'CLAUDE.md': '# Test content' }
            }));
        });
        it('should extract and handle auth token', async () => {
            mockReq.get.mockReturnValue('Bearer test-token');
            mockCacheManager.getMCPData.mockResolvedValue(null);
            mockGithubAPI.listFiles.mockResolvedValue([]);
            const mcpHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/sse')[1];
            await mcpHandler(mockReq, mockRes);
            expect(mockGithubAPI.listFiles).toHaveBeenCalledWith('test-owner', 'test-repo', 'main', 'CLAUDE.md', 'test-token');
        });
        it('should handle external references when include_externals is true', async () => {
            mockCacheManager.getMCPData.mockResolvedValue(null);
            mockGithubAPI.listFiles.mockResolvedValue(['CLAUDE.md']);
            mockGithubAPI.getFileContent.mockResolvedValue('See https://example.com/docs.md for details');
            global.fetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('External content')
            });
            const mcpHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/sse')[1];
            await mcpHandler(mockReq, mockRes);
            expect(global.fetch).toHaveBeenCalledWith('https://example.com/docs.md');
        });
        it('should handle GitHub reference format', async () => {
            mockCacheManager.getMCPData.mockResolvedValue(null);
            mockGithubAPI.listFiles.mockResolvedValue(['CLAUDE.md']);
            mockGithubAPI.getFileContent
                .mockResolvedValueOnce('See github:owner/repo/docs/guide.md for details')
                .mockResolvedValueOnce('External GitHub content');
            const mcpHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/sse')[1];
            await mcpHandler(mockReq, mockRes);
            expect(mockGithubAPI.getFileContent).toHaveBeenCalledWith('owner', 'repo', 'docs/guide.md', 'main');
        });
        it('should handle 404 errors', async () => {
            const error = new Error('Repository not found');
            mockCacheManager.getMCPData.mockRejectedValue(error);
            const mcpHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/sse')[1];
            await mcpHandler(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Repository not found' });
        });
        it('should handle rate limit errors', async () => {
            const error = new Error('GitHub API rate limit exceeded');
            mockCacheManager.getMCPData.mockRejectedValue(error);
            const mcpHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/sse')[1];
            await mcpHandler(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(429);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'GitHub API rate limit exceeded' });
        });
        it('should handle authentication errors', async () => {
            const error = new Error('Unauthorized access');
            mockCacheManager.getMCPData.mockRejectedValue(error);
            const mcpHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/sse')[1];
            await mcpHandler(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
        });
        it('should use default branch when not specified', async () => {
            mockReq.query = {};
            mockCacheManager.getMCPData.mockResolvedValue(null);
            mockGithubAPI.listFiles.mockResolvedValue([]);
            const mcpHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/sse')[1];
            await mcpHandler(mockReq, mockRes);
            expect(mockGithubAPI.listFiles).toHaveBeenCalledWith('test-owner', 'test-repo', 'main', 'CLAUDE.md', undefined);
        });
    });
    describe('files endpoint', () => {
        let mockReq;
        let mockRes;
        beforeEach(() => {
            mockReq = {
                params: { owner: 'test-owner', repo: 'test-repo' },
                query: { pattern: 'README.md', branch: 'develop' },
                get: jest.fn()
            };
            mockRes = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis()
            };
        });
        it('should list files successfully', async () => {
            mockGithubAPI.listFiles.mockResolvedValue(['README.md', 'docs/guide.md']);
            const filesHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/files')[1];
            await filesHandler(mockReq, mockRes);
            expect(mockGithubAPI.listFiles).toHaveBeenCalledWith('test-owner', 'test-repo', 'develop', 'README.md', undefined);
            expect(mockRes.json).toHaveBeenCalledWith({
                repo: 'test-owner/test-repo',
                branch: 'develop',
                files: ['README.md', 'docs/guide.md'],
                fetched_at: expect.any(String)
            });
        });
        it('should use default values when query params missing', async () => {
            mockReq.query = {};
            mockGithubAPI.listFiles.mockResolvedValue([]);
            const filesHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/files')[1];
            await filesHandler(mockReq, mockRes);
            expect(mockGithubAPI.listFiles).toHaveBeenCalledWith('test-owner', 'test-repo', 'main', 'CLAUDE.md', undefined);
        });
        it('should handle errors appropriately', async () => {
            const error = new Error('Repository not found');
            mockGithubAPI.listFiles.mockRejectedValue(error);
            const filesHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/files')[1];
            await filesHandler(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Repository not found' });
        });
    });
    describe('raw file proxy endpoint', () => {
        let mockReq;
        let mockRes;
        beforeEach(() => {
            mockReq = {
                params: { owner: 'test-owner', repo: 'test-repo' },
                path: '/test-owner/test-repo/raw/docs/README.md',
                query: { branch: 'main' },
                get: jest.fn()
            };
            mockRes = {
                set: jest.fn(),
                send: jest.fn(),
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
        });
        it('should serve raw file with correct content type for markdown', async () => {
            mockGithubAPI.getFileContent.mockResolvedValue('# Markdown content');
            const rawHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/raw/*')[1];
            await rawHandler(mockReq, mockRes);
            expect(mockGithubAPI.getFileContent).toHaveBeenCalledWith('test-owner', 'test-repo', 'docs/README.md', 'main', undefined);
            expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/markdown');
            expect(mockRes.send).toHaveBeenCalledWith('# Markdown content');
        });
        it('should serve raw file with correct content type for JSON', async () => {
            mockReq.path = '/test-owner/test-repo/raw/package.json';
            mockGithubAPI.getFileContent.mockResolvedValue('{"name": "test"}');
            const rawHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/raw/*')[1];
            await rawHandler(mockReq, mockRes);
            expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'application/json');
        });
        it('should serve raw file with correct content type for YAML', async () => {
            mockReq.path = '/test-owner/test-repo/raw/config.yaml';
            mockGithubAPI.getFileContent.mockResolvedValue('name: test');
            const rawHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/raw/*')[1];
            await rawHandler(mockReq, mockRes);
            expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/yaml');
        });
        it('should use text/plain for unknown file types', async () => {
            mockReq.path = '/test-owner/test-repo/raw/unknown.xyz';
            mockGithubAPI.getFileContent.mockResolvedValue('content');
            const rawHandler = mockApp.get.mock.calls.find((call) => call[0] === '/:owner/:repo/raw/*')[1];
            await rawHandler(mockReq, mockRes);
            expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
        });
    });
    describe('webhook endpoint', () => {
        let mockReq;
        let mockRes;
        beforeEach(() => {
            mockReq = {
                get: jest.fn(),
                body: {
                    repository: {
                        owner: { login: 'test-owner' },
                        name: 'test-repo',
                        default_branch: 'main'
                    },
                    ref: 'refs/heads/develop'
                }
            };
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
        });
        it('should handle push webhook with valid signature', async () => {
            mockReq.get.mockImplementation((header) => {
                if (header === 'X-GitHub-Event')
                    return 'push';
                if (header === 'X-Hub-Signature-256')
                    return 'sha256=valid-signature';
                if (header === 'X-GitHub-Delivery')
                    return 'delivery-id';
                return undefined;
            });
            process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
            mockCrypto.timingSafeEqual.mockReturnValue(true);
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook/github')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockCacheManager.invalidateBranch).toHaveBeenCalledWith('test-owner', 'test-repo', 'develop');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ received: true });
            delete process.env.GITHUB_WEBHOOK_SECRET;
        });
        it('should handle push webhook without signature when no secret configured', async () => {
            mockReq.get.mockImplementation((header) => {
                if (header === 'X-GitHub-Event')
                    return 'push';
                if (header === 'X-Hub-Signature-256')
                    return undefined;
                return undefined;
            });
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook/github')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ received: true });
        });
        it('should reject webhook with invalid signature', async () => {
            mockReq.get.mockImplementation((header) => {
                if (header === 'X-GitHub-Event')
                    return 'push';
                if (header === 'X-Hub-Signature-256')
                    return 'sha256=invalid-signature';
                return undefined;
            });
            process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
            mockCrypto.timingSafeEqual.mockReturnValue(false);
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook/github')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
            delete process.env.GITHUB_WEBHOOK_SECRET;
        });
        it('should handle pull_request webhook', async () => {
            mockReq.get.mockImplementation((header) => {
                if (header === 'X-GitHub-Event')
                    return 'pull_request';
                return undefined;
            });
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook/github')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockCacheManager.invalidateBranch).toHaveBeenCalledWith('test-owner', 'test-repo', 'main');
        });
        it('should handle repository webhook', async () => {
            mockReq.get.mockImplementation((header) => {
                if (header === 'X-GitHub-Event')
                    return 'repository';
                return undefined;
            });
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook/github')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockCacheManager.invalidateRepo).toHaveBeenCalledWith('test-owner', 'test-repo');
        });
        it('should ignore unknown webhook events', async () => {
            mockReq.get.mockImplementation((header) => {
                if (header === 'X-GitHub-Event')
                    return 'unknown_event';
                return undefined;
            });
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook/github')[1];
            await webhookHandler(mockReq, mockRes);
            expect(consoleSpy).toHaveBeenCalledWith('Ignoring webhook event: unknown_event');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            consoleSpy.mockRestore();
        });
    });
    describe('config endpoint', () => {
        it('should return configuration', () => {
            const configHandler = mockApp.get.mock.calls.find((call) => call[0] === '/config')[1];
            const mockReq = {};
            const mockRes = {
                json: jest.fn()
            };
            configHandler(mockReq, mockRes);
            expect(mockRes.json).toHaveBeenCalledWith({
                supported_files: ['CLAUDE.md', 'README.md', 'llms.txt'],
                default_branch: 'main'
            });
        });
    });
    describe('version endpoint', () => {
        it('should return version information', () => {
            const versionHandler = mockApp.get.mock.calls.find((call) => call[0] === '/version')[1];
            const mockReq = {};
            const mockRes = {
                json: jest.fn()
            };
            versionHandler(mockReq, mockRes);
            expect(mockRes.json).toHaveBeenCalledWith({
                service: 'git-mcp',
                version: '1.0.0',
                build: expect.stringMatching(/^20250730-[a-z0-9]{6}$/)
            });
        });
    });
    describe('start method', () => {
        it('should start the server on specified port', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            server.start();
            expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
            const callback = mockApp.listen.mock.calls[0][1];
            if (callback) {
                callback();
                expect(consoleSpy).toHaveBeenCalledWith('REST API server started on port 3000');
            }
            consoleSpy.mockRestore();
        });
    });
    describe('request counting middleware', () => {
        it('should increment request count', () => {
            const middlewareCalls = mockApp.use.mock.calls;
            const counterMiddleware = middlewareCalls.find((call) => typeof call[0] === 'function' && call[0].length === 3)[0];
            const mockReq = {};
            const mockRes = {};
            const mockNext = jest.fn();
            counterMiddleware(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalled();
        });
    });
    describe('extractExternalReferences', () => {
        it('should extract HTTP URLs', () => {
            const content = 'See https://example.com/docs.md and http://test.com/guide.md';
            const refs = server.extractExternalReferences(content);
            expect(refs).toContain('https://example.com/docs.md');
            expect(refs).toContain('http://test.com/guide.md');
        });
        it('should extract GitHub references', () => {
            const content = 'Check github:owner/repo/docs/guide.md for details';
            const refs = server.extractExternalReferences(content);
            expect(refs).toContain('github:owner/repo/docs/guide.md');
        });
        it('should remove duplicates', () => {
            const content = 'See https://example.com/docs.md and https://example.com/docs.md again';
            const refs = server.extractExternalReferences(content);
            expect(refs).toEqual(['https://example.com/docs.md']);
        });
    });
    describe('fetchExternalContent', () => {
        it('should fetch HTTP content', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('HTTP content')
            });
            const content = await server.fetchExternalContent('https://example.com/docs.md');
            expect(content).toBe('HTTP content');
            expect(global.fetch).toHaveBeenCalledWith('https://example.com/docs.md');
        });
        it('should handle HTTP errors', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            });
            await expect(server.fetchExternalContent('https://example.com/missing.md'))
                .rejects.toThrow('HTTP 404: Not Found');
        });
        it('should fetch GitHub content', async () => {
            mockGithubAPI.getFileContent.mockResolvedValue('GitHub content');
            const content = await server.fetchExternalContent('github:owner/repo/docs/guide.md');
            expect(content).toBe('GitHub content');
            expect(mockGithubAPI.getFileContent).toHaveBeenCalledWith('owner', 'repo', 'docs/guide.md', 'main');
        });
        it('should throw error for unsupported reference format', async () => {
            await expect(server.fetchExternalContent('ftp://example.com/file.md'))
                .rejects.toThrow('Unsupported reference format: ftp://example.com/file.md');
        });
    });
    describe('verifyWebhookSignature', () => {
        it('should verify valid signature', () => {
            const payload = { test: 'data' };
            const signature = 'sha256=valid-signature';
            const secret = 'test-secret';
            mockCrypto.timingSafeEqual.mockReturnValue(true);
            const isValid = server.verifyWebhookSignature(payload, signature, secret);
            expect(isValid).toBe(true);
            expect(mockCrypto.createHmac).toHaveBeenCalledWith('sha256', secret);
        });
        it('should handle Buffer payload', () => {
            const payload = Buffer.from('test data');
            const signature = 'sha256=valid-signature';
            const secret = 'test-secret';
            server.verifyWebhookSignature(payload, signature, secret);
            expect(mockCrypto.createHmac).toHaveBeenCalledWith('sha256', secret);
        });
    });
});
