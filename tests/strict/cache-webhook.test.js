"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const crypto_1 = __importDefault(require("crypto"));
const mcp_sse_server_1 = require("../../src/servers/mcp-sse-server");
const github_api_1 = require("../__mocks__/github-api");
jest.mock('../../src/github/github-api', () => ({
    GitHubAPI: jest.fn().mockImplementation(() => new github_api_1.MockGitHubAPI())
}));
function parseSSEStream(text) {
    const events = [];
    const lines = text.split('\n');
    let currentEvent = '';
    let currentData = '';
    for (const line of lines) {
        if (line.startsWith('event: ')) {
            currentEvent = line.substring(7);
        }
        else if (line.startsWith('data: ')) {
            currentData = line.substring(6);
        }
        else if (line === '' && currentEvent && currentData) {
            try {
                events.push({
                    event: currentEvent,
                    data: JSON.parse(currentData)
                });
            }
            catch (e) {
                console.warn('Failed to parse SSE data:', currentData);
            }
            currentEvent = '';
            currentData = '';
        }
    }
    return events;
}
function generateWebhookSignature(payload, secret) {
    const hmac = crypto_1.default.createHmac('sha256', secret);
    hmac.update(payload);
    return 'sha256=' + hmac.digest('hex');
}
describe('Cache and Webhook Integration Tests', () => {
    let server;
    let app;
    let mockGitHubAPI;
    let cacheManager;
    beforeEach(() => {
        process.env.GITHUB_WEBHOOK_SECRET = 'test-secret-key';
        server = new mcp_sse_server_1.MCPSSEServer(3007);
        app = server.app;
        cacheManager = server.cacheManager;
        const GitHubAPI = require('../../src/github/github-api').GitHubAPI;
        mockGitHubAPI = new GitHubAPI();
        server.githubAPI = mockGitHubAPI;
        if (server.referenceResolver) {
            server.referenceResolver.githubAPI = mockGitHubAPI;
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
            const firstResponse = await (0, supertest_1.default)(app)
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
            const cachedData = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
            expect(cachedData).toBeDefined();
            expect(cachedData.claude_md_files['CLAUDE.md']).toBe('Original content');
            const secondResponse = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 2,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const secondEvents = parseSSEStream(secondResponse.text);
            const cacheHitEvent = secondEvents.find(e => e.data.params?.status === 'cache_hit');
            expect(cacheHitEvent).toBeDefined();
            const secondFileEvent = secondEvents.find(e => e.data.params?.path === 'CLAUDE.md');
            expect(secondFileEvent?.data.params.content).toBe('Original content');
        });
        test('should differentiate cache based on include_externals parameter', async () => {
            const contentWithRefs = 'See [guide](https://example.com/guide.md)';
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', contentWithRefs);
            await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation',
                params: { include_externals: false }
            })
                .expect(200);
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 2,
                method: 'fetch_testorg_testrepo_documentation',
                params: { include_externals: true }
            })
                .expect(200);
            const events = parseSSEStream(response.text);
            const cacheHitEvent = events.find(e => e.data.params?.status === 'cache_hit');
            expect(cacheHitEvent).toBeUndefined();
        });
        test('should differentiate cache based on branch parameter', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'develop', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Main content');
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'develop', 'Develop content');
            await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation',
                params: { branch: 'main' }
            })
                .expect(200);
            const response = await (0, supertest_1.default)(app)
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
            await cacheManager.setMCPData('testorg', 'testrepo', 'main', true, {
                repo: 'testorg/testrepo',
                branch: 'main',
                claude_md_files: { 'CLAUDE.md': 'Cached content' },
                external_refs: {},
                fetched_at: new Date().toISOString()
            }, 0.1);
            let response = await (0, supertest_1.default)(app)
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
            await new Promise(resolve => setTimeout(resolve, 150));
            response = await (0, supertest_1.default)(app)
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
            await cacheManager.setMCPData('testorg', 'testrepo', 'main', true, {
                repo: 'testorg/testrepo',
                branch: 'main',
                claude_md_files: { 'CLAUDE.md': 'Old content' },
                external_refs: {},
                fetched_at: new Date().toISOString()
            });
            let cachedData = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
            expect(cachedData).toBeDefined();
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
            await (0, supertest_1.default)(app)
                .post('/webhook')
                .set('X-Hub-Signature-256', signature)
                .set('X-GitHub-Event', 'push')
                .set('X-GitHub-Delivery', 'test-delivery-id')
                .send(webhookPayload)
                .expect(200);
            cachedData = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
            expect(cachedData).toBeNull();
        });
        test('should invalidate cache on pull request webhook', async () => {
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
            await (0, supertest_1.default)(app)
                .post('/webhook')
                .set('X-Hub-Signature-256', signature)
                .set('X-GitHub-Event', 'pull_request')
                .send(webhookPayload)
                .expect(200);
            const cachedData = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
            expect(cachedData).toBeNull();
        });
        test('should invalidate all repository cache on repository webhook', async () => {
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
            await (0, supertest_1.default)(app)
                .post('/webhook')
                .set('X-Hub-Signature-256', signature)
                .set('X-GitHub-Event', 'repository')
                .send(webhookPayload)
                .expect(200);
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
            const response = await (0, supertest_1.default)(app)
                .post('/webhook')
                .set('X-Hub-Signature-256', invalidSignature)
                .set('X-GitHub-Event', 'push')
                .send(webhookPayload)
                .expect(401);
            expect(response.body.error).toBe('Invalid signature');
        });
        test('should handle webhooks without signature when secret is not configured', async () => {
            process.env.GITHUB_WEBHOOK_SECRET = '';
            server = new mcp_sse_server_1.MCPSSEServer(3007);
            app = server.app;
            const webhookPayload = {
                ref: 'refs/heads/main',
                repository: {
                    owner: { login: 'testorg' },
                    name: 'testrepo'
                }
            };
            await (0, supertest_1.default)(app)
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
            await (0, supertest_1.default)(app)
                .post('/webhook')
                .set('X-Hub-Signature-256', signature)
                .set('X-GitHub-Event', 'unknown_event')
                .send(webhookPayload)
                .expect(200);
        });
        test('should handle malformed webhook payloads', async () => {
            const malformedPayload = {
                ref: 'refs/heads/main'
            };
            const payloadString = JSON.stringify(malformedPayload);
            const signature = generateWebhookSignature(payloadString, 'test-secret-key');
            await (0, supertest_1.default)(app)
                .post('/webhook')
                .set('X-Hub-Signature-256', signature)
                .set('X-GitHub-Event', 'push')
                .send(malformedPayload)
                .expect(200);
        });
    });
    describe('Cache-Webhook Integration', () => {
        test('should serve fresh data after webhook invalidation', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Old content');
            await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'New content');
            const webhookPayload = {
                ref: 'refs/heads/main',
                repository: {
                    owner: { login: 'testorg' },
                    name: 'testrepo'
                }
            };
            const payloadString = JSON.stringify(webhookPayload);
            const signature = generateWebhookSignature(payloadString, 'test-secret-key');
            await (0, supertest_1.default)(app)
                .post('/webhook')
                .set('X-Hub-Signature-256', signature)
                .set('X-GitHub-Event', 'push')
                .send(webhookPayload)
                .expect(200);
            const response = await (0, supertest_1.default)(app)
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
            const cacheHitEvent = events.find(e => e.data.params?.status === 'cache_hit');
            expect(cacheHitEvent).toBeUndefined();
        });
        test('should maintain cache for unrelated repositories during webhook', async () => {
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
            const webhookPayload = {
                ref: 'refs/heads/main',
                repository: {
                    owner: { login: 'testorg' },
                    name: 'testrepo'
                }
            };
            const payloadString = JSON.stringify(webhookPayload);
            const signature = generateWebhookSignature(payloadString, 'test-secret-key');
            await (0, supertest_1.default)(app)
                .post('/webhook')
                .set('X-Hub-Signature-256', signature)
                .set('X-GitHub-Event', 'push')
                .send(webhookPayload)
                .expect(200);
            const testRepoCache = await cacheManager.getMCPData('testorg', 'testrepo', 'main', true);
            expect(testRepoCache).toBeNull();
            const otherRepoCache = await cacheManager.getMCPData('otherorg', 'otherrepo', 'main', true);
            expect(otherRepoCache).toBeDefined();
            expect(otherRepoCache.claude_md_files['CLAUDE.md']).toBe('Content 2');
        });
    });
});
