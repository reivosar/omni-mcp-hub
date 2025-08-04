"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mcp_sse_server_1 = require("../../../src/servers/mcp-sse-server");
const github_api_1 = require("../../../src/github/github-api");
const cache_1 = require("../../../src/cache/cache");
const reference_resolver_1 = require("../../../src/utils/reference-resolver");
const source_config_manager_1 = require("../../../src/config/source-config-manager");
jest.mock('express');
jest.mock('../../../src/github/github-api');
jest.mock('../../../src/cache/cache');
jest.mock('../../../src/utils/reference-resolver');
jest.mock('../../../src/config/source-config-manager');
jest.mock('cors', () => jest.fn(() => (req, res, next) => next()));
jest.mock('crypto', () => ({
    createHmac: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => 'mocked-signature')
    }))
}));
const MockExpress = express_1.default;
const MockGitHubAPI = github_api_1.GitHubAPI;
const MockCacheManager = cache_1.CacheManager;
const MockReferenceResolver = reference_resolver_1.ReferenceResolver;
const MockSourceConfigManager = source_config_manager_1.SourceConfigManager;
describe('MCPSSEServer', () => {
    let server;
    let mockApp;
    let mockConfigLoader;
    let mockGithubAPI;
    let mockCacheManager;
    let mockReferenceResolver;
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
        mockConfigLoader = {
            getConfig: jest.fn().mockReturnValue(mockConfig),
            load: jest.fn(),
            clearCache: jest.fn(),
            getSources: jest.fn(),
            getSourcesAsEnvFormat: jest.fn()
        };
        MockSourceConfigManager.mockImplementation(() => mockConfigLoader);
        mockGithubAPI = {
            listFiles: jest.fn(),
            getFileContent: jest.fn(),
            getRateLimit: jest.fn()
        };
        MockGitHubAPI.mockImplementation(() => mockGithubAPI);
        mockCacheManager = {
            get: jest.fn(),
            set: jest.fn(),
            invalidateRepo: jest.fn(),
            invalidateBranch: jest.fn(),
            getStats: jest.fn(),
            generateKey: jest.fn(),
            getMCPData: jest.fn(),
            setMCPData: jest.fn()
        };
        MockCacheManager.mockImplementation(() => mockCacheManager);
        mockReferenceResolver = {
            resolveReferences: jest.fn(),
            extractExternalReferences: jest.fn(),
            resetProcessedUrls: jest.fn(),
            reset: jest.fn(),
            getStats: jest.fn().mockReturnValue({ processedUrls: 0, urls: [] })
        };
        MockReferenceResolver.mockImplementation(() => mockReferenceResolver);
        server = new mcp_sse_server_1.MCPSSEServer(3000);
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });
    describe('constructor', () => {
        it('should initialize with default port', () => {
            const defaultServer = new mcp_sse_server_1.MCPSSEServer();
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
            expect(mockApp.use).toHaveBeenCalled();
            expect(MockExpress.raw).toHaveBeenCalledWith({ type: 'application/json' });
            const webhookMiddlewareCalls = mockApp.use.mock.calls.filter((call) => call[0] === '/webhook');
            expect(webhookMiddlewareCalls.length).toBeGreaterThan(0);
            expect(MockExpress.json).toHaveBeenCalled();
            const errorMiddlewareCalls = mockApp.use.mock.calls.filter((call) => call[0] && typeof call[0] === 'function' && call[0].length === 4);
            expect(errorMiddlewareCalls.length).toBeGreaterThan(0);
        });
    });
    describe('SSE endpoint handlers', () => {
        let mockReq;
        let mockRes;
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
            const sseHandler = mockApp.all.mock.calls.find((call) => call[0] === '/sse')[1];
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
            const sseHandler = mockApp.all.mock.calls.find((call) => call[0] === '/sse')[1];
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
            const sseHandler = mockApp.all.mock.calls.find((call) => call[0] === '/sse')[1];
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
            const sseHandler = mockApp.all.mock.calls.find((call) => call[0] === '/sse')[1];
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
            mockGithubAPI.listFiles.mockResolvedValue(['CLAUDE.md']);
            mockGithubAPI.getFileContent.mockResolvedValue('# Test content');
            mockReferenceResolver.resolveReferences.mockResolvedValue([]);
            const sseHandler = mockApp.all.mock.calls.find((call) => call[0] === '/sse')[1];
            await sseHandler(mockReq, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalled();
            expect(mockRes.end).toHaveBeenCalled();
        });
    });
    describe('health check endpoint', () => {
        it('should respond with ok status', () => {
            const healthHandler = mockApp.get.mock.calls.find((call) => call[0] === '/healthz')[1];
            const mockReq = {};
            const mockRes = {
                json: jest.fn()
            };
            healthHandler(mockReq, mockRes);
            expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
        });
    });
    describe('webhook endpoint', () => {
        let mockReq;
        let mockRes;
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
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockCacheManager.invalidateBranch).toHaveBeenCalledWith('test-owner', 'test-repo', 'main');
            expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'push' });
        });
        it('should handle push webhook without signature when no secret configured', async () => {
            const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
            delete process.env.GITHUB_WEBHOOK_SECRET;
            mockConfigLoader.getConfig.mockReturnValue({
                ...mockConfig,
                sources: [],
                files: { patterns: ['CLAUDE.md'], max_size: 1048576 }
            });
            delete mockReq.headers['x-hub-signature-256'];
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'push' });
            if (originalSecret !== undefined) {
                process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
            }
        });
        it('should reject webhook with invalid signature', async () => {
            const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
            process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
            const originalSignature = mockReq.headers['x-hub-signature-256'];
            mockReq.headers['x-hub-signature-256'] = 'sha256=invalid-signature';
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
            mockReq.headers['x-hub-signature-256'] = originalSignature;
            if (originalSecret !== undefined) {
                process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
            }
            else {
                delete process.env.GITHUB_WEBHOOK_SECRET;
            }
        });
        it('should reject webhook with missing signature when secret configured', async () => {
            const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
            process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
            delete mockReq.headers['x-hub-signature-256'];
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing signature' });
            if (originalSecret !== undefined) {
                process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
            }
            else {
                delete process.env.GITHUB_WEBHOOK_SECRET;
            }
        });
        it('should handle pull_request webhook', async () => {
            mockReq.headers['x-github-event'] = 'pull_request';
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockCacheManager.invalidateRepo).toHaveBeenCalledWith('test-owner', 'test-repo');
            expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'pull_request' });
        });
        it('should handle repository webhook', async () => {
            mockReq.headers['x-github-event'] = 'repository';
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockCacheManager.invalidateRepo).toHaveBeenCalledWith('test-owner', 'test-repo');
            expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'repository' });
        });
        it('should ignore unknown webhook events', async () => {
            mockReq.headers['x-github-event'] = 'unknown_event';
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook')[1];
            await webhookHandler(mockReq, mockRes);
            expect(consoleSpy).toHaveBeenCalledWith('Ignoring webhook event: unknown_event');
            expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'unknown_event' });
            consoleSpy.mockRestore();
        });
        it('should handle webhook errors', async () => {
            mockReq.body = Buffer.from('invalid json');
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook')[1];
            await webhookHandler(mockReq, mockRes);
            expect(consoleErrorSpy).toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid JSON payload' });
            consoleErrorSpy.mockRestore();
        });
        it('should handle regular JSON body for signature verification', async () => {
            mockReq.body = {
                repository: {
                    owner: { login: 'test-owner' },
                    name: 'test-repo'
                },
                ref: 'refs/heads/main'
            };
            const webhookHandler = mockApp.post.mock.calls.find((call) => call[0] === '/webhook')[1];
            await webhookHandler(mockReq, mockRes);
            expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', event: 'push' });
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
            const errorMiddleware = mockApp.use.mock.calls.find((call) => call[0] && typeof call[0] === 'function' && call[0].length === 4)[0];
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
            const errorMiddleware = mockApp.use.mock.calls.find((call) => call[0] && typeof call[0] === 'function' && call[0].length === 4)[0];
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
            const serverAny = server;
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
            const serverAny = server;
            serverAny.sendSSEError(mockRes, '1', -32601, 'Method not found');
            expect(mockRes.write).toHaveBeenCalledWith('event: message\n');
            expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"error"'));
            expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('-32601'));
            expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('Method not found'));
        });
    });
});
