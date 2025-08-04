"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_sse_server_1 = require("../../src/servers/mcp-sse-server");
const github_api_1 = require("../__mocks__/github-api");
const perf_hooks_1 = require("perf_hooks");
jest.mock('../../src/github/github-api', () => ({
    GitHubAPI: jest.fn().mockImplementation(() => new github_api_1.MockGitHubAPI())
}));
describe('Performance Tests', () => {
    let server;
    let mockGitHubAPI;
    beforeEach(() => {
        server = new mcp_sse_server_1.MCPSSEServer(3003);
        const GitHubAPI = require('../../src/github/github-api').GitHubAPI;
        mockGitHubAPI = new GitHubAPI();
    });
    afterEach(() => {
        if (mockGitHubAPI) {
            mockGitHubAPI.clear();
        }
    });
    describe('Cache Performance', () => {
        test('should improve response time with caching', async () => {
            mockGitHubAPI.setMockFiles('perf', 'test', 'main', ['CLAUDE.md']);
            mockGitHubAPI.setMockFileContent('perf', 'test', 'CLAUDE.md', 'main', '# Performance Test\nThis is test content for performance testing.');
            const cacheManager = server.cacheManager;
            const startTime1 = perf_hooks_1.performance.now();
            await cacheManager.getMCPData('perf', 'test', 'main', false);
            const testData = {
                repo: 'perf/test',
                branch: 'main',
                claude_md_files: { 'CLAUDE.md': 'content' },
                external_refs: {},
                fetched_at: new Date().toISOString()
            };
            await cacheManager.setMCPData('perf', 'test', 'main', false, testData);
            const time1 = perf_hooks_1.performance.now() - startTime1;
            const startTime2 = perf_hooks_1.performance.now();
            const cachedResult = await cacheManager.getMCPData('perf', 'test', 'main', false);
            const time2 = perf_hooks_1.performance.now() - startTime2;
            expect(cachedResult).toEqual(testData);
            expect(time2).toBeLessThan(time1);
            expect(time2).toBeLessThan(1);
        });
        test('should handle high cache volume', async () => {
            const cacheManager = server.cacheManager;
            const iterations = 1000;
            const startTime = perf_hooks_1.performance.now();
            const promises = Array.from({ length: iterations }, async (_, i) => {
                const data = {
                    repo: `owner/repo${i}`,
                    branch: 'main',
                    claude_md_files: { 'CLAUDE.md': `content ${i}` },
                    external_refs: {},
                    fetched_at: new Date().toISOString()
                };
                await cacheManager.setMCPData('owner', `repo${i}`, 'main', false, data);
            });
            await Promise.all(promises);
            const setTime = perf_hooks_1.performance.now() - startTime;
            const retrieveStartTime = perf_hooks_1.performance.now();
            const retrievePromises = Array.from({ length: iterations }, async (_, i) => {
                return await cacheManager.getMCPData('owner', `repo${i}`, 'main', false);
            });
            const results = await Promise.all(retrievePromises);
            const retrieveTime = perf_hooks_1.performance.now() - retrieveStartTime;
            expect(results).toHaveLength(iterations);
            expect(results.every(r => r !== null)).toBe(true);
            console.log(`Cache performance: Set ${iterations} items in ${setTime.toFixed(2)}ms, Retrieved in ${retrieveTime.toFixed(2)}ms`);
            expect(setTime).toBeLessThan(1000);
            expect(retrieveTime).toBeLessThan(100);
        });
    });
    describe('Memory Usage', () => {
        test('should not leak memory with cache operations', async () => {
            const cacheManager = server.cacheManager;
            const initialStats = cacheManager.getCacheStats();
            for (let i = 0; i < 100; i++) {
                const data = {
                    repo: `test/repo${i}`,
                    branch: 'main',
                    claude_md_files: { 'CLAUDE.md': `Large content ${'x'.repeat(1000)} ${i}` },
                    external_refs: {},
                    fetched_at: new Date().toISOString()
                };
                await cacheManager.setMCPData('test', `repo${i}`, 'main', false, data, 0.01);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
            await cacheManager.getMCPData('test', 'nonexistent', 'main', false);
            const finalStats = cacheManager.getCacheStats();
            expect(finalStats.size).toBeLessThan(100);
        });
    });
    describe('Concurrent Operations', () => {
        test('should handle concurrent cache operations', async () => {
            const cacheManager = server.cacheManager;
            const concurrency = 50;
            const startTime = perf_hooks_1.performance.now();
            const operations = Array.from({ length: concurrency }, async (_, i) => {
                const data = {
                    repo: `concurrent/repo${i}`,
                    branch: 'main',
                    claude_md_files: { 'CLAUDE.md': `content ${i}` },
                    external_refs: {},
                    fetched_at: new Date().toISOString()
                };
                if (i % 2 === 0) {
                    await cacheManager.setMCPData('concurrent', `repo${i}`, 'main', false, data);
                }
                else {
                    await cacheManager.getMCPData('concurrent', `repo${i}`, 'main', false);
                }
                return i;
            });
            const results = await Promise.all(operations);
            const totalTime = perf_hooks_1.performance.now() - startTime;
            expect(results).toHaveLength(concurrency);
            expect(totalTime).toBeLessThan(1000);
            console.log(`Concurrent operations: ${concurrency} operations in ${totalTime.toFixed(2)}ms`);
        });
    });
    describe('Large Data Handling', () => {
        test('should handle large file content efficiently', async () => {
            const cacheManager = server.cacheManager;
            const largeContent = 'x'.repeat(1024 * 1024);
            const data = {
                repo: 'large/repo',
                branch: 'main',
                claude_md_files: { 'CLAUDE.md': largeContent },
                external_refs: {},
                fetched_at: new Date().toISOString()
            };
            const startTime = perf_hooks_1.performance.now();
            await cacheManager.setMCPData('large', 'repo', 'main', false, data);
            const setTime = perf_hooks_1.performance.now() - startTime;
            const retrieveStartTime = perf_hooks_1.performance.now();
            const result = await cacheManager.getMCPData('large', 'repo', 'main', false);
            const retrieveTime = perf_hooks_1.performance.now() - retrieveStartTime;
            expect(result?.claude_md_files['CLAUDE.md']).toBe(largeContent);
            expect(setTime).toBeLessThan(100);
            expect(retrieveTime).toBeLessThan(10);
            console.log(`Large data handling: Set 1MB in ${setTime.toFixed(2)}ms, Retrieved in ${retrieveTime.toFixed(2)}ms`);
        });
    });
    describe('TTL Performance', () => {
        test('should efficiently clean up expired entries', async () => {
            const cache = server.cacheManager.cache;
            const numEntries = 1000;
            const setPromises = [];
            for (let i = 0; i < numEntries; i++) {
                setPromises.push(cache.set(`key${i}`, `value${i}`, 0.05));
            }
            await Promise.all(setPromises);
            await new Promise(resolve => setTimeout(resolve, 10));
            const actualSize = cache.size();
            expect(actualSize).toBeGreaterThanOrEqual(numEntries * 0.9);
            expect(actualSize).toBeLessThanOrEqual(numEntries);
            await new Promise(resolve => setTimeout(resolve, 100));
            const cleanupStartTime = perf_hooks_1.performance.now();
            await cache.get('trigger-cleanup');
            const cleanupTime = perf_hooks_1.performance.now() - cleanupStartTime;
            expect(cache.size()).toBe(0);
            expect(cleanupTime).toBeLessThan(100);
            console.log(`TTL cleanup: Cleaned ${numEntries} expired entries in ${cleanupTime.toFixed(2)}ms`);
        });
    });
});
