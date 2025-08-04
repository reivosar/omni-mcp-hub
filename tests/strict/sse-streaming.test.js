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
describe('SSE Streaming Format Validation', () => {
    let server;
    let app;
    let mockGitHubAPI;
    beforeEach(() => {
        server = new mcp_sse_server_1.MCPSSEServer(3006);
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
    });
    describe('SSE Format Compliance', () => {
        test('should follow strict SSE format with event and data lines', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Test content');
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect('Content-Type', /text\/event-stream/)
                .expect(200);
            const lines = response.text.split('\n');
            let eventLines = 0;
            let dataLines = 0;
            let emptyLines = 0;
            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    eventLines++;
                    expect(line).toBe('event: message');
                }
                else if (line.startsWith('data: ')) {
                    dataLines++;
                    const jsonData = line.substring(6);
                    expect(() => JSON.parse(jsonData)).not.toThrow();
                }
                else if (line === '') {
                    emptyLines++;
                }
            }
            expect(eventLines).toBeGreaterThan(0);
            expect(dataLines).toBeGreaterThan(0);
            expect(eventLines).toBe(dataLines);
            expect(emptyLines).toBeGreaterThan(0);
        });
        test('should send proper HTTP headers for SSE', async () => {
            const response = await (0, supertest_1.default)(app)
                .get('/sse')
                .expect(200);
            expect(response.headers['content-type']).toContain('text/event-stream');
            expect(response.headers['cache-control']).toBe('no-cache');
            expect(response.headers['connection']).toBe('keep-alive');
            expect(response.headers['access-control-allow-origin']).toBe('*');
        });
        test('should maintain proper message ordering', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['doc1/CLAUDE.md', 'doc2/CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'doc1/CLAUDE.md', 'main', 'Content 1');
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'doc2/CLAUDE.md', 'main', 'Content 2');
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const events = parseSSEStream(response.text);
            expect(events[0].data.method).toBe('fetch_owner_repo_documentation');
            expect(events[0].data.params.status).toBe('starting');
            const lastEvent = events[events.length - 1];
            expect(lastEvent.data.id).toBe(1);
            expect(lastEvent.data.result.status).toBe('complete');
            const fileEvents = events.filter(e => e.data.params?.path);
            expect(fileEvents.length).toBe(2);
        });
        test('should handle special characters in JSON data', async () => {
            const specialContent = `# Special Characters Test

This content has "quotes", 'single quotes', \\backslashes\\, and 
newlines, plus émojis: 🚀 and unicode: ñáéíóú

Code block:
\`\`\`json
{
  "key": "value with \\"escaped quotes\\"",
  "newline": "line1\\nline2"
}
\`\`\`
`;
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', specialContent);
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const lines = response.text.split('\n');
            const dataLines = lines.filter(line => line.startsWith('data: '));
            for (const dataLine of dataLines) {
                const jsonData = dataLine.substring(6);
                expect(() => {
                    const parsed = JSON.parse(jsonData);
                    expect(parsed).toHaveProperty('jsonrpc', '2.0');
                }).not.toThrow();
            }
            const events = parseSSEStream(response.text);
            const fileEvent = events.find(e => e.data.params?.path === 'CLAUDE.md');
            expect(fileEvent?.data.params.content).toBe(specialContent);
        });
    });
    describe('JSON-RPC Message Format', () => {
        test('should follow JSON-RPC 2.0 specification exactly', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Content');
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 42,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const events = parseSSEStream(response.text);
            for (const event of events) {
                const msg = event.data;
                expect(msg).toHaveProperty('jsonrpc', '2.0');
                if (msg.id !== undefined) {
                    expect(msg.id).toBe(42);
                    expect(msg).toHaveProperty('result');
                    expect(msg).not.toHaveProperty('method');
                    expect(msg).not.toHaveProperty('params');
                }
                else {
                    expect(msg).toHaveProperty('method');
                    expect(msg.method).toBe('fetch_owner_repo_documentation');
                    expect(msg).toHaveProperty('params');
                    expect(msg).not.toHaveProperty('result');
                    expect(msg).not.toHaveProperty('error');
                }
            }
        });
        test('should include proper progress information', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['doc1/CLAUDE.md', 'doc2/CLAUDE.md', 'doc3/CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'doc1/CLAUDE.md', 'main', 'Content 1');
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'doc2/CLAUDE.md', 'main', 'Content 2');
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'doc3/CLAUDE.md', 'main', 'Content 3');
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const events = parseSSEStream(response.text);
            const fileEvents = events.filter(e => e.data.params?.path);
            expect(fileEvents.length).toBe(3);
            for (let i = 0; i < fileEvents.length; i++) {
                const event = fileEvents[i];
                if (event.data.params.progress) {
                    expect(event.data.params.progress.current).toBe(i + 1);
                    expect(event.data.params.progress.total).toBe(3);
                }
            }
        });
        test('should include proper timestamps', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Content');
            const startTime = Date.now();
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const endTime = Date.now();
            const events = parseSSEStream(response.text);
            const completeEvent = events.find(e => e.data.id === 1);
            expect(completeEvent?.data.result).toHaveProperty('timestamp');
            const timestamp = new Date(completeEvent?.data.result.timestamp).getTime();
            expect(timestamp).toBeGreaterThanOrEqual(startTime);
            expect(timestamp).toBeLessThanOrEqual(endTime);
        });
    });
    describe('Performance and Timing', () => {
        test('should start streaming within 500ms', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Content');
            const startTime = Date.now();
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const responseTime = Date.now() - startTime;
            expect(responseTime).toBeLessThan(500);
            const events = parseSSEStream(response.text);
            const startEvent = events.find(e => e.data.params?.status === 'starting');
            expect(startEvent).toBeDefined();
        });
        test('should stream file events progressively', async () => {
            const files = Array.from({ length: 5 }, (_, i) => `doc${i}/CLAUDE.md`);
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', files);
            files.forEach((file, i) => {
                mockGitHubAPI.setMockFileContent('testorg', 'testrepo', file, 'main', `Content ${i}`);
            });
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const events = parseSSEStream(response.text);
            const fileEvents = events.filter(e => e.data.params?.path);
            expect(fileEvents.length).toBe(5);
            for (let i = 0; i < fileEvents.length; i++) {
                expect(fileEvents[i].data.params.path).toBe(`doc${i}/CLAUDE.md`);
                expect(fileEvents[i].data.params.content).toBe(`Content ${i}`);
            }
        });
        test('should complete streaming within reasonable time', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Content');
            const startTime = Date.now();
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            expect(totalTime).toBeLessThan(5000);
            const events = parseSSEStream(response.text);
            const completeEvent = events.find(e => e.data.id === 1);
            expect(completeEvent?.data.result.status).toBe('complete');
        });
    });
    describe('Stream Termination', () => {
        test('should properly terminate stream after completion', async () => {
            mockGitHubAPI.setMockFiles('testorg', 'testrepo', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('testorg', 'testrepo', 'CLAUDE.md', 'main', 'Content');
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const events = parseSSEStream(response.text);
            const lastEvent = events[events.length - 1];
            expect(lastEvent.data.id).toBe(1);
            expect(lastEvent.data.result.status).toBe('complete');
            expect(response.text).toMatch(/\n\n$/);
        });
        test('should terminate stream on error', async () => {
            mockGitHubAPI.listFiles = jest.fn().mockRejectedValue(new Error('Test error'));
            const response = await (0, supertest_1.default)(app)
                .post('/sse')
                .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'fetch_testorg_testrepo_documentation'
            })
                .expect(200);
            const events = parseSSEStream(response.text);
            const errorEvent = events.find(e => e.data.error);
            expect(errorEvent?.data.id).toBe(1);
            expect(errorEvent?.data.error.message).toContain('Test error');
        });
    });
});
