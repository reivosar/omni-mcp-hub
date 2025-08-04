import { SourceManager, SourceHandler } from '../../../src/sources/source-handler';

// Mock SourceHandler implementation for testing
class MockSourceHandler implements SourceHandler {
  public initialized = false;
  public initializeConfig = '';

  async initialize(config: string): Promise<void> {
    this.initializeConfig = config;
    this.initialized = true;
  }

  async getFiles(patterns: string[]): Promise<Map<string, string>> {
    if (!this.initialized) throw new Error('Handler not initialized');
    return new Map([
      ['test.md', 'Test content'],
      ['README.md', 'README content']
    ]);
  }

  async getFile(fileName: string): Promise<string | null> {
    if (!this.initialized) throw new Error('Handler not initialized');
    if (fileName === 'test.md') return 'Test content';
    if (fileName === 'README.md') return 'README content';
    return null;
  }

  async listFiles(): Promise<string[]> {
    if (!this.initialized) throw new Error('Handler not initialized');
    return ['test.md', 'README.md', 'docs/guide.md'];
  }

  getSourceInfo(): string {
    return `Mock: ${this.initializeConfig}`;
  }
}

class ErrorSourceHandler implements SourceHandler {
  async initialize(config: string): Promise<void> {
    throw new Error('Initialization failed');
  }

  async getFiles(patterns: string[]): Promise<Map<string, string>> {
    throw new Error('Not implemented');
  }

  async getFile(fileName: string): Promise<string | null> {
    throw new Error('Not implemented');
  }

  async listFiles(): Promise<string[]> {
    throw new Error('Not implemented');
  }

  getSourceInfo(): string {
    return 'Error handler';
  }
}

describe('SourceManager', () => {
  let sourceManager: SourceManager;
  let mockHandler: MockSourceHandler;
  let errorHandler: ErrorSourceHandler;

  beforeEach(() => {
    sourceManager = new SourceManager();
    mockHandler = new MockSourceHandler();
    errorHandler = new ErrorSourceHandler();
  });

  describe('registerHandler', () => {
    it('should register a handler for a protocol', () => {
      sourceManager.registerHandler('mock', mockHandler);
      
      const protocols = sourceManager.getSupportedProtocols();
      expect(protocols).toContain('mock');
    });

    it('should allow multiple protocol registrations', () => {
      sourceManager.registerHandler('mock', mockHandler);
      sourceManager.registerHandler('test', new MockSourceHandler());
      
      const protocols = sourceManager.getSupportedProtocols();
      expect(protocols).toContain('mock');
      expect(protocols).toContain('test');
      expect(protocols).toHaveLength(2);
    });

    it('should overwrite existing handler for same protocol', () => {
      const firstHandler = new MockSourceHandler();
      const secondHandler = new MockSourceHandler();
      
      sourceManager.registerHandler('mock', firstHandler);
      sourceManager.registerHandler('mock', secondHandler);
      
      const protocols = sourceManager.getSupportedProtocols();
      expect(protocols).toHaveLength(1);
      expect(protocols).toContain('mock');
    });
  });

  describe('getSupportedProtocols', () => {
    it('should return empty array when no handlers registered', () => {
      const protocols = sourceManager.getSupportedProtocols();
      expect(protocols).toEqual([]);
    });

    it('should return all registered protocols', () => {
      sourceManager.registerHandler('github', mockHandler);
      sourceManager.registerHandler('local', new MockSourceHandler());
      sourceManager.registerHandler('http', new MockSourceHandler());
      
      const protocols = sourceManager.getSupportedProtocols();
      expect(protocols).toHaveLength(3);
      expect(protocols).toContain('github');
      expect(protocols).toContain('local');
      expect(protocols).toContain('http');
    });
  });

  describe('parseSourceUrl', () => {
    it('should parse valid source URL with protocol and config', async () => {
      sourceManager.registerHandler('github', mockHandler);
      
      await sourceManager.initializeSource('github:user/repo');
      
      expect(mockHandler.initialized).toBe(true);
      expect(mockHandler.initializeConfig).toBe('user/repo');
    });

    it('should parse source URL with complex config', async () => {
      sourceManager.registerHandler('local', mockHandler);
      
      await sourceManager.initializeSource('local:/home/user/projects/my-app');
      
      expect(mockHandler.initialized).toBe(true);
      expect(mockHandler.initializeConfig).toBe('/home/user/projects/my-app');
    });

    it('should parse source URL with multiple colons in config', async () => {
      sourceManager.registerHandler('http', mockHandler);
      
      await sourceManager.initializeSource('http://example.com:8080/api');
      
      expect(mockHandler.initialized).toBe(true);
      expect(mockHandler.initializeConfig).toBe('//example.com:8080/api');
    });

    it('should throw error for URL without colon', async () => {
      await expect(sourceManager.initializeSource('invalidurl'))
        .rejects.toThrow('Invalid source URL format: invalidurl');
    });

    it('should throw error for empty protocol', async () => {
      await expect(sourceManager.initializeSource(':config'))
        .rejects.toThrow('Unsupported protocol: ');
    });

    it('should handle empty config part', async () => {
      sourceManager.registerHandler('test', mockHandler);
      
      await sourceManager.initializeSource('test:');
      
      expect(mockHandler.initialized).toBe(true);
      expect(mockHandler.initializeConfig).toBe('');
    });
  });

  describe('initializeSource', () => {
    it('should initialize and return handler for valid source', async () => {
      sourceManager.registerHandler('mock', mockHandler);
      
      const handler = await sourceManager.initializeSource('mock:test-config');
      
      expect(handler).toBe(mockHandler);
      expect(mockHandler.initialized).toBe(true);
      expect(mockHandler.initializeConfig).toBe('test-config');
    });

    it('should throw error for unsupported protocol', async () => {
      await expect(sourceManager.initializeSource('unsupported:config'))
        .rejects.toThrow('Unsupported protocol: unsupported');
    });

    it('should propagate handler initialization errors', async () => {
      sourceManager.registerHandler('error', errorHandler);
      
      await expect(sourceManager.initializeSource('error:config'))
        .rejects.toThrow('Initialization failed');
    });

    it('should handle case-sensitive protocol matching', async () => {
      sourceManager.registerHandler('GitHub', mockHandler);
      
      await expect(sourceManager.initializeSource('github:user/repo'))
        .rejects.toThrow('Unsupported protocol: github');
      
      // But should work with exact case
      const handler = await sourceManager.initializeSource('GitHub:user/repo');
      expect(handler).toBe(mockHandler);
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple source initializations', async () => {
      const handler1 = new MockSourceHandler();
      const handler2 = new MockSourceHandler();
      
      sourceManager.registerHandler('github', handler1);
      sourceManager.registerHandler('local', handler2);
      
      const result1 = await sourceManager.initializeSource('github:user/repo1');
      const result2 = await sourceManager.initializeSource('local:/path/to/repo2');
      
      expect(result1).toBe(handler1);
      expect(result2).toBe(handler2);
      expect(handler1.initializeConfig).toBe('user/repo1');
      expect(handler2.initializeConfig).toBe('/path/to/repo2');
    });

    it('should reuse same handler instance for same protocol', async () => {
      sourceManager.registerHandler('mock', mockHandler);
      
      const handler1 = await sourceManager.initializeSource('mock:config1');
      const handler2 = await sourceManager.initializeSource('mock:config2');
      
      expect(handler1).toBe(handler2);
      expect(handler1).toBe(mockHandler);
      // Should be re-initialized with new config
      expect(mockHandler.initializeConfig).toBe('config2');
    });

    it('should handle complex real-world source URLs', async () => {
      sourceManager.registerHandler('github', mockHandler);
      sourceManager.registerHandler('local', new MockSourceHandler());
      sourceManager.registerHandler('http', new MockSourceHandler());
      
      const testCases = [
        'github:microsoft/vscode',
        'local:/Users/dev/projects/my-app',
        'http://api.example.com:3000/data'
      ];
      
      for (const sourceUrl of testCases) {
        const handler = await sourceManager.initializeSource(sourceUrl);
        expect(handler).toBeDefined();
      }
    });
  });

  describe('error handling edge cases', () => {
    it('should handle protocol with special characters', async () => {
      sourceManager.registerHandler('test-protocol_v2', mockHandler);
      
      const handler = await sourceManager.initializeSource('test-protocol_v2:config');
      expect(handler).toBe(mockHandler);
      expect(mockHandler.initializeConfig).toBe('config');
    });

    it('should handle very long source URLs', async () => {
      sourceManager.registerHandler('test', mockHandler);
      const longConfig = 'a'.repeat(1000);
      
      const handler = await sourceManager.initializeSource(`test:${longConfig}`);
      expect(handler).toBe(mockHandler);
      expect(mockHandler.initializeConfig).toBe(longConfig);
    });

    it('should handle source URL with only colon', async () => {
      await expect(sourceManager.initializeSource(':'))
        .rejects.toThrow('Unsupported protocol: ');
    });

    it('should handle empty source URL', async () => {
      await expect(sourceManager.initializeSource(''))
        .rejects.toThrow('Invalid source URL format: ');
    });
  });
});