"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const nock_1 = __importDefault(require("nock"));
const mcp_sse_server_1 = require("../../src/servers/mcp-sse-server");
const github_api_1 = require("../__mocks__/github-api");
jest.mock('../../src/github/github-api', () => ({
    GitHubAPI: jest.fn().mockImplementation(() => new github_api_1.MockGitHubAPI())
}));
describe('MCPSSEServer Integration', () => {
    let server;
    let app;
    let mockGitHubAPI;
    beforeEach(() => {
        server = new mcp_sse_server_1.MCPSSEServer(3001);
        app = server.app;
        const GitHubAPI = require('../../src/github/github-api').GitHubAPI;
        mockGitHubAPI = new GitHubAPI();
        server.githubAPI = mockGitHubAPI;
        if (server.referenceResolver) {
            server.referenceResolver.githubAPI = mockGitHubAPI;
        }
    });
    afterEach(() => {
        nock_1.default.cleanAll();
        if (mockGitHubAPI) {
            mockGitHubAPI.clear();
        }
        if (server && server.cacheManager?.cache?.destroy) {
            server.cacheManager.cache.destroy();
        }
    });
    describe('GET /sse', () => {
        test('should return server info via SSE', async () => {
            const response = await (0, supertest_1.default)(app)
                .get('/sse')
                .expect('Content-Type', /text\/event-stream/)
                .expect(200);
            expect(response.text).toContain('event: message');
            expect(response.text).toContain('"method":"server_info"');
            expect(response.text).toContain('"name":"git-mcp-compatible-server"');
        });
    });
    describe('POST /sse - JSON-RPC requests', () => {
        test('should handle valid fetch documentation request', async () => {
            mockGitHubAPI.setMockFiles('testuser', 'testrepo', 'main', [
                'CLAUDE.md',
                'docs/CLAUDE.md'
            ]);
            mockGitHubAPI.setMockFileContent('testuser', 'testrepo', 'CLAUDE.md', 'main', '# Main CLAUDE.md\nThis is the main documentation.');
            mockGitHubAPI.setMockFileContent('testuser', 'testrepo', 'docs/CLAUDE.md', 'main', '# Docs CLAUDE.md\nThis is documentation in docs folder.');
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
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send(request_body)
                .expect('Content-Type', /text\/event-stream/)
                .expect(200);
            const events = parseSSEResponse(response.text);
            expect(events.some(e => e.data.method === 'fetch_owner_repo_documentation' &&
                e.data.params?.status === 'starting')).toBe(true);
            expect(events.some(e => e.data.params?.path === 'CLAUDE.md' &&
                e.data.params?.content?.includes('Main CLAUDE.md'))).toBe(true);
            expect(events.some(e => e.data.params?.path === 'docs/CLAUDE.md' &&
                e.data.params?.content?.includes('Docs CLAUDE.md'))).toBe(true);
            expect(events.some(e => e.data.id === 1 &&
                e.data.result?.status === 'complete')).toBe(true);
        });
        test('should handle external references when enabled', async () => {
            mockGitHubAPI.setMockFiles('testuser', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testuser', 'testrepo', 'CLAUDE.md', 'main', '# Main Docs\nSee [external guide](https://example.com/guide.md) for more info.');
            (0, nock_1.default)('https://example.com')
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
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send(request_body)
                .expect(200);
            const events = parseSSEResponse(response.text);
            expect(events.some(e => e.data.params?.path === 'CLAUDE.md')).toBe(true);
            expect(events.some(e => e.data.params?.url === 'https://example.com/guide.md' &&
                e.data.params?.content?.includes('External Guide'))).toBe(true);
        });
        test('should handle GitHub rate limit errors', async () => {
            const originalListFiles = mockGitHubAPI.listFiles;
            mockGitHubAPI.listFiles = jest.fn().mockRejectedValue(new Error('GitHub API rate limit exceeded'));
            const request_body = {
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_ratelimit_repo_documentation',
                params: {
                    owner: 'ratelimit',
                    repo: 'repo',
                    branch: 'main',
                    include_externals: false
                }
            };
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send(request_body)
                .expect(200);
            const events = parseSSEResponse(response.text);
            expect(events.some(e => e.data.error?.message?.includes('rate limit') ||
                e.data.error?.message?.includes('GitHub API'))).toBe(true);
            mockGitHubAPI.listFiles = originalListFiles;
        });
        test('should handle invalid JSON-RPC requests', async () => {
            const invalid_request = {
                jsonrpc: '1.0',
                id: 1,
                method: 'test'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send(invalid_request)
                .expect(200);
            const events = parseSSEResponse(response.text);
            expect(events.some(e => e.data.error?.code === -32600 &&
                e.data.error?.message === 'Invalid Request')).toBe(true);
        });
        test('should handle unknown methods', async () => {
            const request_body = {
                jsonrpc: '2.0',
                id: 1,
                method: 'unknown_method'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send(request_body)
                .expect(200);
            const events = parseSSEResponse(response.text);
            expect(events.some(e => e.data.error?.code === -32601 &&
                e.data.error?.message?.includes('Method not found'))).toBe(true);
        });
        test('should extract owner/repo from method name', async () => {
            mockGitHubAPI.setMockFiles('owner', 'repo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('owner', 'repo', 'CLAUDE.md', 'main', 'Content');
            const request_body = {
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_owner_repo_documentation'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send(request_body)
                .expect(200);
            const events = parseSSEResponse(response.text);
            expect(events.some(e => e.data.params?.status === 'starting' &&
                e.data.params?.owner === 'owner' &&
                e.data.params?.repo === 'repo')).toBe(true);
        });
    });
    describe('GET /healthz', () => {
        test('should return health status', async () => {
            const response = await (0, supertest_1.default)(app)
                .get('/healthz')
                .expect('Content-Type', /json/)
                .expect(200);
            expect(response.body).toEqual({ status: 'ok' });
        });
    });
    describe('CORS handling', () => {
        test('should handle CORS preflight requests', async () => {
            await (0, supertest_1.default)(app)
                .options('/sse')
                .set('Origin', 'https://example.com')
                .set('Access-Control-Request-Method', 'POST')
                .set('Access-Control-Request-Headers', 'Content-Type')
                .expect(204);
        });
        test('should include CORS headers in responses', async () => {
            const response = await (0, supertest_1.default)(app)
                .get('/sse')
                .expect(200);
            expect(response.headers['access-control-allow-origin']).toBe('*');
        });
    });
});
function parseSSEResponse(text) {
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
