import { MCPSSEServer } from '../../src/servers/mcp-sse-server';
import { MockGitHubAPI } from '../__mocks__/github-api';
import { performance } from 'perf_hooks';

// Mock the GitHubAPI
jest.mock('../../src/github/github-api', () => ({
  GitHubAPI: jest.fn().mockImplementation(() => new MockGitHubAPI())
}));

describe('Performance Tests', () => {
  let server: MCPSSEServer;
  let mockGitHubAPI: MockGitHubAPI;

  beforeEach(() => {
    server = new MCPSSEServer(3003);
    
    // Get reference to the mocked GitHub API
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
      // Setup test data
      mockGitHubAPI.setMockFiles('perf', 'test', 'main', ['CLAUDE.md']);
      mockGitHubAPI.setMockFileContent('perf', 'test', 'CLAUDE.md', 'main', 
        '# Performance Test\nThis is test content for performance testing.');

      const cacheManager = (server as any).cacheManager;

      // First request (cache miss)
      const startTime1 = performance.now();
      await cacheManager.getMCPData('perf', 'test', 'main', false);
      
      // Simulate data fetching and caching
      const testData = {
        repo: 'perf/test',
        branch: 'main',
        claude_md_files: { 'CLAUDE.md': 'content' },
        external_refs: {},
        fetched_at: new Date().toISOString()
      };
      await cacheManager.setMCPData('perf', 'test', 'main', false, testData);
      const time1 = performance.now() - startTime1;

      // Second request (cache hit)
      const startTime2 = performance.now();
      const cachedResult = await cacheManager.getMCPData('perf', 'test', 'main', false);
      const time2 = performance.now() - startTime2;

      expect(cachedResult).toEqual(testData);
      expect(time2).toBeLessThan(time1); // Cache should be faster
      expect(time2).toBeLessThan(1); // Should be very fast (< 1ms)
    });

    test('should handle high cache volume', async () => {
      const cacheManager = (server as any).cacheManager;
      const iterations = 1000;
      
      const startTime = performance.now();
      
      // Store many cache entries
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
      const setTime = performance.now() - startTime;
      
      // Retrieve all cache entries
      const retrieveStartTime = performance.now();
      const retrievePromises = Array.from({ length: iterations }, async (_, i) => {
        return await cacheManager.getMCPData('owner', `repo${i}`, 'main', false);
      });
      
      const results = await Promise.all(retrievePromises);
      const retrieveTime = performance.now() - retrieveStartTime;
      
      expect(results).toHaveLength(iterations);
      expect(results.every(r => r !== null)).toBe(true);
      
      console.log(`Cache performance: Set ${iterations} items in ${setTime.toFixed(2)}ms, Retrieved in ${retrieveTime.toFixed(2)}ms`);
      
      // Should complete within reasonable time
      expect(setTime).toBeLessThan(1000); // 1 second
      expect(retrieveTime).toBeLessThan(100); // 100ms
    });
  });

  describe('Memory Usage', () => {
    test('should not leak memory with cache operations', async () => {
      const cacheManager = (server as any).cacheManager;
      const initialStats = cacheManager.getCacheStats();
      
      // Perform many cache operations
      for (let i = 0; i < 100; i++) {
        const data = {
          repo: `test/repo${i}`,
          branch: 'main',
          claude_md_files: { 'CLAUDE.md': `Large content ${'x'.repeat(1000)} ${i}` },
          external_refs: {},
          fetched_at: new Date().toISOString()
        };
        
        await cacheManager.setMCPData('test', `repo${i}`, 'main', false, data, 0.01); // Very short TTL
      }
      
      // Wait for items to expire
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Trigger cleanup by accessing cache
      await cacheManager.getMCPData('test', 'nonexistent', 'main', false);
      
      const finalStats = cacheManager.getCacheStats();
      
      // Memory should be cleaned up
      expect(finalStats.size).toBeLessThan(100);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent cache operations', async () => {
      const cacheManager = (server as any).cacheManager;
      const concurrency = 50;
      
      const startTime = performance.now();
      
      // Perform concurrent read/write operations
      const operations = Array.from({ length: concurrency }, async (_, i) => {
        const data = {
          repo: `concurrent/repo${i}`,
          branch: 'main',
          claude_md_files: { 'CLAUDE.md': `content ${i}` },
          external_refs: {},
          fetched_at: new Date().toISOString()
        };
        
        // Mix of read and write operations
        if (i % 2 === 0) {
          await cacheManager.setMCPData('concurrent', `repo${i}`, 'main', false, data);
        } else {
          await cacheManager.getMCPData('concurrent', `repo${i}`, 'main', false);
        }
        
        return i;
      });
      
      const results = await Promise.all(operations);
      const totalTime = performance.now() - startTime;
      
      expect(results).toHaveLength(concurrency);
      expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
      
      console.log(`Concurrent operations: ${concurrency} operations in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('Large Data Handling', () => {
    test('should handle large file content efficiently', async () => {
      const cacheManager = (server as any).cacheManager;
      
      // Create large content (1MB)
      const largeContent = 'x'.repeat(1024 * 1024);
      const data = {
        repo: 'large/repo',
        branch: 'main',
        claude_md_files: { 'CLAUDE.md': largeContent },
        external_refs: {},
        fetched_at: new Date().toISOString()
      };
      
      const startTime = performance.now();
      await cacheManager.setMCPData('large', 'repo', 'main', false, data);
      const setTime = performance.now() - startTime;
      
      const retrieveStartTime = performance.now();
      const result = await cacheManager.getMCPData('large', 'repo', 'main', false);
      const retrieveTime = performance.now() - retrieveStartTime;
      
      expect(result?.claude_md_files['CLAUDE.md']).toBe(largeContent);
      expect(setTime).toBeLessThan(100); // Should store large data quickly
      expect(retrieveTime).toBeLessThan(10); // Should retrieve large data quickly
      
      console.log(`Large data handling: Set 1MB in ${setTime.toFixed(2)}ms, Retrieved in ${retrieveTime.toFixed(2)}ms`);
    });
  });

  describe('TTL Performance', () => {
    test('should efficiently clean up expired entries', async () => {
      const cache = (server as any).cacheManager.cache;
      
      // Add many short-lived entries
      const numEntries = 1000;
      const setPromises = [];
      for (let i = 0; i < numEntries; i++) {
        setPromises.push(cache.set(`key${i}`, `value${i}`, 0.05)); // 50ms TTL - more time for CI
      }
      await Promise.all(setPromises);
      
      // Give a small delay to ensure all entries are set
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Check size - allow some variance due to timing
      const actualSize = cache.size();
      expect(actualSize).toBeGreaterThanOrEqual(numEntries * 0.9); // Allow 10% variance
      expect(actualSize).toBeLessThanOrEqual(numEntries);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100)); // Increase wait time for CI
      
      // Trigger cleanup
      const cleanupStartTime = performance.now();
      await cache.get('trigger-cleanup');
      const cleanupTime = performance.now() - cleanupStartTime;
      
      expect(cache.size()).toBe(0);
      expect(cleanupTime).toBeLessThan(100); // Cleanup should be fast (relaxed for CI)
      
      console.log(`TTL cleanup: Cleaned ${numEntries} expired entries in ${cleanupTime.toFixed(2)}ms`);
    });
  });
});