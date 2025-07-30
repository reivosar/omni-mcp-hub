export interface CacheInterface {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCache implements CacheInterface {
  private cache = new Map<string, { value: any; expiry: number }>();
  private defaultTTL: number;

  constructor(defaultTTLSeconds: number = 300) { // 5 minutes default
    this.defaultTTL = defaultTTLSeconds;
    
    // Cleanup expired entries every minute
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.defaultTTL;
    const expiry = Date.now() + (ttl * 1000);
    
    this.cache.set(key, { value, expiry });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  // Utility methods for debugging/monitoring
  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

export class CacheManager {
  private cache: CacheInterface;

  constructor(cache?: CacheInterface) {
    this.cache = cache || new MemoryCache();
  }

  generateMCPKey(owner: string, repo: string, branch: string, includeExternals: boolean): string {
    return `mcp:${owner}:${repo}:${branch}:${includeExternals}`;
  }

  async getMCPData(owner: string, repo: string, branch: string, includeExternals: boolean): Promise<any | null> {
    const key = this.generateMCPKey(owner, repo, branch, includeExternals);
    return await this.cache.get(key);
  }

  async setMCPData(
    owner: string, 
    repo: string, 
    branch: string, 
    includeExternals: boolean, 
    data: any,
    ttlSeconds?: number
  ): Promise<void> {
    const key = this.generateMCPKey(owner, repo, branch, includeExternals);
    await this.cache.set(key, data, ttlSeconds);
  }

  async invalidateRepo(owner: string, repo: string): Promise<void> {
    // Invalidate all cache entries for this repository
    const pattern = `mcp:${owner}:${repo}:`;
    
    if (this.cache instanceof MemoryCache) {
      const keys = this.cache.keys();
      for (const key of keys) {
        if (key.startsWith(pattern)) {
          await this.cache.delete(key);
        }
      }
    }
  }

  async invalidateBranch(owner: string, repo: string, branch: string): Promise<void> {
    // Invalidate cache entries for specific branch
    const pattern = `mcp:${owner}:${repo}:${branch}:`;
    
    if (this.cache instanceof MemoryCache) {
      const keys = this.cache.keys();
      for (const key of keys) {
        if (key.startsWith(pattern)) {
          await this.cache.delete(key);
        }
      }
    }
  }

  // For monitoring/metrics
  getCacheStats(): { size?: number; type: string } {
    if (this.cache instanceof MemoryCache) {
      return {
        size: this.cache.size(),
        type: 'memory'
      };
    }
    
    return { type: 'unknown' };
  }
}