import { MemoryCache, CacheManager } from '../../src/cache/cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(1); // 1 second TTL for fast tests
  });

  afterEach(() => {
    cache.clear();
  });

  describe('basic operations', () => {
    test('should store and retrieve values', async () => {
      await cache.set('key1', 'value1');
      const result = await cache.get<string>('key1');
      expect(result).toBe('value1');
    });

    test('should return null for non-existent keys', async () => {
      const result = await cache.get('non-existent');
      expect(result).toBeNull();
    });

    test('should support different data types', async () => {
      const obj = { name: 'test', count: 42 };
      await cache.set('object', obj);
      
      const result = await cache.get<typeof obj>('object');
      expect(result).toEqual(obj);
    });

    test('should delete keys', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');
      
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    test('should clear all keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.clear();
      
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(cache.size()).toBe(0);
    });
  });

  describe('TTL functionality', () => {
    test('should expire keys after TTL', async () => {
      await cache.set('key1', 'value1', 0.1); // 100ms TTL
      
      // Should exist immediately
      expect(await cache.get('key1')).toBe('value1');
      
      // Should expire after TTL
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(await cache.get('key1')).toBeNull();
    });

    test('should use default TTL when none specified', async () => {
      await cache.set('key1', 'value1'); // Uses default 1s TTL
      
      expect(await cache.get('key1')).toBe('value1');
      
      // Should expire after default TTL
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(await cache.get('key1')).toBeNull();
    });

    test('should clean up expired entries', async () => {
      await cache.set('key1', 'value1', 0.1);
      await cache.set('key2', 'value2', 10); // Long TTL
      
      expect(cache.size()).toBe(2);
      
      // Wait for first key to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Access the cache to trigger cleanup
      await cache.get('key2');
      
      expect(cache.size()).toBe(1);
      expect(cache.keys()).toEqual(['key2']);
    });
  });

  describe('utility methods', () => {
    test('should report correct size', async () => {
      expect(cache.size()).toBe(0);
      
      await cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      
      await cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });

    test('should return all keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      const keys = cache.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });
});

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let mockCache: MemoryCache;

  beforeEach(() => {
    mockCache = new MemoryCache();
    cacheManager = new CacheManager(mockCache);
  });

  afterEach(() => {
    mockCache.clear();
  });

  describe('MCP data operations', () => {
    test('should generate correct cache keys', () => {
      const key = cacheManager.generateMCPKey('owner', 'repo', 'main', true);
      expect(key).toBe('mcp:owner:repo:main:true');
      
      const key2 = cacheManager.generateMCPKey('user', 'project', 'dev', false);
      expect(key2).toBe('mcp:user:project:dev:false');
    });

    test('should store and retrieve MCP data', async () => {
      const data = {
        repo: 'owner/repo',
        branch: 'main',
        claude_md_files: { 'CLAUDE.md': 'content' },
        external_refs: {},
        fetched_at: new Date().toISOString()
      };

      await cacheManager.setMCPData('owner', 'repo', 'main', true, data);
      const result = await cacheManager.getMCPData('owner', 'repo', 'main', true);
      
      expect(result).toEqual(data);
    });

    test('should return null for non-existent MCP data', async () => {
      const result = await cacheManager.getMCPData('owner', 'repo', 'main', true);
      expect(result).toBeNull();
    });

    test('should respect custom TTL', async () => {
      const data = { test: 'data' };
      await cacheManager.setMCPData('owner', 'repo', 'main', true, data, 0.1);
      
      expect(await cacheManager.getMCPData('owner', 'repo', 'main', true)).toEqual(data);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(await cacheManager.getMCPData('owner', 'repo', 'main', true)).toBeNull();
    });
  });

  describe('cache invalidation', () => {
    beforeEach(async () => {
      // Set up test data
      await cacheManager.setMCPData('owner', 'repo1', 'main', true, { data: '1' });
      await cacheManager.setMCPData('owner', 'repo1', 'main', false, { data: '2' });
      await cacheManager.setMCPData('owner', 'repo1', 'dev', true, { data: '3' });
      await cacheManager.setMCPData('owner', 'repo2', 'main', true, { data: '4' });
    });

    test('should invalidate entire repository', async () => {
      await cacheManager.invalidateRepo('owner', 'repo1');
      
      expect(await cacheManager.getMCPData('owner', 'repo1', 'main', true)).toBeNull();
      expect(await cacheManager.getMCPData('owner', 'repo1', 'main', false)).toBeNull();
      expect(await cacheManager.getMCPData('owner', 'repo1', 'dev', true)).toBeNull();
      
      // Other repo should remain
      expect(await cacheManager.getMCPData('owner', 'repo2', 'main', true)).toEqual({ data: '4' });
    });

    test('should invalidate specific branch', async () => {
      await cacheManager.invalidateBranch('owner', 'repo1', 'main');
      
      expect(await cacheManager.getMCPData('owner', 'repo1', 'main', true)).toBeNull();
      expect(await cacheManager.getMCPData('owner', 'repo1', 'main', false)).toBeNull();
      
      // Dev branch should remain
      expect(await cacheManager.getMCPData('owner', 'repo1', 'dev', true)).toEqual({ data: '3' });
      // Other repo should remain
      expect(await cacheManager.getMCPData('owner', 'repo2', 'main', true)).toEqual({ data: '4' });
    });
  });

  describe('cache statistics', () => {
    test('should return cache statistics', async () => {
      const stats = cacheManager.getCacheStats();
      expect(stats).toHaveProperty('type');
      expect(stats.type).toBe('memory');
      expect(stats).toHaveProperty('size');
    });
  });
});