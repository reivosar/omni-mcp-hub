import { MemoryCache, CacheManager, CacheInterface } from '../../../src/cache/cache';

// Mock timers for TTL testing
jest.useFakeTimers();

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(1); // 1 second TTL for fast tests
  });

  afterEach(() => {
    cache.destroy();
    jest.clearAllTimers();
  });

  describe('Constructor', () => {
    it('should initialize with default TTL', () => {
      const defaultCache = new MemoryCache();
      expect(defaultCache).toBeInstanceOf(MemoryCache);
      defaultCache.destroy();
    });

    it('should initialize with custom TTL', () => {
      const customCache = new MemoryCache(120);
      expect(customCache).toBeInstanceOf(MemoryCache);
      customCache.destroy();
    });

    it('should not start cleanup interval in test environment', () => {
      process.env.NODE_ENV = 'test';
      const testCache = new MemoryCache();
      expect(testCache).toBeInstanceOf(MemoryCache);
      testCache.destroy();
    });

    it('should start cleanup interval in non-test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodCache = new MemoryCache();
      expect(prodCache).toBeInstanceOf(MemoryCache);
      prodCache.destroy();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Destroy Method', () => {
    it('should clear cache and cleanup interval on destroy', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodCache = new MemoryCache();
      prodCache.destroy();
      
      expect(prodCache.size()).toBe(0);
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle destroy when no interval is set', () => {
      cache.destroy();
      expect(() => cache.destroy()).not.toThrow();
    });
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

  describe('TTL functionality (real timers)', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    afterEach(() => {
      jest.useFakeTimers();
    });

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

    test('should return empty array when no keys exist', () => {
      const keys = cache.keys();
      expect(keys).toEqual([]);
    });
  });

  describe('TTL with fake timers', () => {
    test('should respect custom TTL with fake timers', async () => {
      await cache.set('key1', 'value1', 1); // 1 second TTL
      
      // Should exist immediately
      expect(await cache.get<string>('key1')).toBe('value1');
      
      // Fast forward time
      jest.advanceTimersByTime(1500); // 1.5 seconds
      
      // Should be expired
      expect(await cache.get<string>('key1')).toBeNull();
    });

    test('should cleanup expired entries with fake timers', async () => {
      await cache.set('key1', 'value1', 1);
      await cache.set('key2', 'value2', 10);
      
      expect(cache.size()).toBe(2);
      
      // Fast forward to expire first key
      jest.advanceTimersByTime(1500);
      
      // Force cleanup by calling size() which calls cleanup()
      expect(cache.size()).toBe(1);
      expect(await cache.get<string>('key1')).toBeNull();
      expect(await cache.get<string>('key2')).toBe('value2');
    });
  });

  describe('Edge Cases', () => {
    test('should handle setting undefined values', async () => {
      await cache.set('key1', undefined);
      const result = await cache.get('key1');
      expect(result).toBeUndefined();
    });

    test('should handle setting null values', async () => {
      await cache.set('key1', null);
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    test('should handle edge case values', async () => {
      // Test that cache can handle various edge case values
      await cache.set('empty-string', '');
      expect(await cache.get('empty-string')).toBe('');
      
      await cache.set('zero', 0);
      expect(await cache.get('zero')).toBe(0);
      
      await cache.set('false', false);
      expect(await cache.get('false')).toBe(false);
    });

    test('should handle deleting non-existent keys', async () => {
      await expect(cache.delete('non-existent')).resolves.not.toThrow();
    });

    test('should handle different data types', async () => {
      const objectValue = { name: 'test', count: 42 };
      const arrayValue = [1, 2, 3];
      const numberValue = 123;
      const booleanValue = true;

      await cache.set('object', objectValue);
      await cache.set('array', arrayValue);
      await cache.set('number', numberValue);
      await cache.set('boolean', booleanValue);

      expect(await cache.get('object')).toEqual(objectValue);
      expect(await cache.get('array')).toEqual(arrayValue);
      expect(await cache.get('number')).toBe(numberValue);
      expect(await cache.get('boolean')).toBe(booleanValue);
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
    mockCache.destroy();
  });

  describe('Constructor', () => {
    it('should initialize with provided cache', () => {
      expect(cacheManager).toBeInstanceOf(CacheManager);
    });

    it('should initialize with default MemoryCache when no cache provided', () => {
      const defaultManager = new CacheManager();
      expect(defaultManager).toBeInstanceOf(CacheManager);
    });
  });

  describe('Key Generation', () => {
    test('should generate correct cache keys', () => {
      const key = cacheManager.generateMCPKey('owner', 'repo', 'main', true);
      expect(key).toBe('mcp:owner:repo:main:true');
      
      const key2 = cacheManager.generateMCPKey('user', 'project', 'dev', false);
      expect(key2).toBe('mcp:user:project:dev:false');
    });

    test('should generate different keys for different parameters', () => {
      const key1 = cacheManager.generateMCPKey('owner1', 'repo1', 'main', true);
      const key2 = cacheManager.generateMCPKey('owner2', 'repo1', 'main', true);
      const key3 = cacheManager.generateMCPKey('owner1', 'repo2', 'main', true);
      const key4 = cacheManager.generateMCPKey('owner1', 'repo1', 'dev', true);
      const key5 = cacheManager.generateMCPKey('owner1', 'repo1', 'main', false);

      const keys = [key1, key2, key3, key4, key5];
      const uniqueKeys = [...new Set(keys)];
      expect(uniqueKeys).toHaveLength(5);
    });

    test('should handle special characters in parameters', () => {
      const key = cacheManager.generateMCPKey('owner-1', 'repo_name', 'feature/branch', true);
      expect(key).toBe('mcp:owner-1:repo_name:feature/branch:true');
    });
  });

  describe('MCP data operations', () => {

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
      await cacheManager.setMCPData('owner', 'repo', 'main', true, data, 300);
      
      const result = await cacheManager.getMCPData('owner', 'repo', 'main', true);
      expect(result).toEqual(data);
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

    test('should return correct size for MemoryCache', async () => {
      await cacheManager.setMCPData('owner', 'repo', 'main', true, { data: 1 });
      await cacheManager.setMCPData('owner', 'repo', 'dev', true, { data: 2 });

      const stats = cacheManager.getCacheStats();
      expect(stats.size).toBe(2);
    });

    test('should return stats for unknown cache type', () => {
      const mockCacheInterface: CacheInterface = {
        get: jest.fn(),
        set: jest.fn(), 
        delete: jest.fn(),
        clear: jest.fn()
      };
      const manager = new CacheManager(mockCacheInterface);
      
      const stats = manager.getCacheStats();
      expect(stats.type).toBe('unknown');
      expect(stats.size).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    let mockCacheInterface: jest.Mocked<CacheInterface>;
    let errorCacheManager: CacheManager;

    beforeEach(() => {
      mockCacheInterface = {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn()
      };
      errorCacheManager = new CacheManager(mockCacheInterface);
    });

    test('should handle cache get errors gracefully', async () => {
      mockCacheInterface.get.mockRejectedValue(new Error('Cache error'));

      await expect(errorCacheManager.getMCPData('owner', 'repo', 'main', true))
        .rejects.toThrow('Cache error');
    });

    test('should handle cache set errors gracefully', async () => {
      mockCacheInterface.set.mockRejectedValue(new Error('Set error'));

      await expect(errorCacheManager.setMCPData('owner', 'repo', 'main', true, {}))
        .rejects.toThrow('Set error');
    });

    test('should handle invalidation with non-MemoryCache gracefully', async () => {
      await expect(errorCacheManager.invalidateRepo('owner', 'repo'))
        .resolves.not.toThrow();
      
      await expect(errorCacheManager.invalidateBranch('owner', 'repo', 'main'))
        .resolves.not.toThrow();
    });
  });
});

describe('CacheInterface Compliance', () => {
  test('should implement CacheInterface correctly', () => {
    const cache = new MemoryCache();

    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
    expect(typeof cache.delete).toBe('function');
    expect(typeof cache.clear).toBe('function');

    cache.destroy();
  });

  test('should handle interface methods asynchronously', async () => {
    const cache = new MemoryCache();

    const getPromise = cache.get('test');
    const setPromise = cache.set('test', 'value');
    const deletePromise = cache.delete('test');
    const clearPromise = cache.clear();

    expect(getPromise).toBeInstanceOf(Promise);
    expect(setPromise).toBeInstanceOf(Promise);
    expect(deletePromise).toBeInstanceOf(Promise);
    expect(clearPromise).toBeInstanceOf(Promise);

    await Promise.all([getPromise, setPromise, deletePromise, clearPromise]);

    cache.destroy();
  });
});