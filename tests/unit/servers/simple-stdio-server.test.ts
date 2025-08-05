/**
 * Tests for SimpleStdioServer
 */

import { SimpleStdioServer } from '../../../src/servers/simple-stdio-server';
import { SourceConfigManager } from '../../../src/config/source-config-manager';

// Mock SourceConfigManager
jest.mock('../../../src/config/source-config-manager');

describe('SimpleStdioServer', () => {
  let server: SimpleStdioServer;
  let mockConfigManager: jest.Mocked<SourceConfigManager>;
  let mockStdout: jest.SpyInstance;
  let mockStdin: any;

  beforeEach(() => {
    // Mock stdout.write
    mockStdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    
    // Mock stdin
    mockStdin = {
      on: jest.fn(),
      resume: jest.fn()
    };
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true
    });

    // Setup mocked config manager with default config
    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        server: { port: 3000 },
        github_sources: [],
        local_sources: [],
        mcp_servers: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      })
    } as any;
    (SourceConfigManager as any).mockImplementation(() => mockConfigManager);

    server = new SimpleStdioServer();
  });

  afterEach(() => {
    mockStdout.mockRestore();
    jest.clearAllMocks();
  });

  describe('initialize method handling', () => {
    it('should respond to initialize with empty config', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        github_sources: [],
        local_sources: [],
        mcp_servers: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"protocolVersion":"2024-11-05"')
      );
      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"capabilities":{"resources":{},"tools":{},"prompts":{}}')
      );
    });

    it('should respond to initialize with mcp servers', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        github_sources: [],
        local_sources: [],
        mcp_servers: [{ name: 'test-server', command: 'test' }],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"tools":{"listChanged":true}')
      );
    });

    it('should respond to initialize with github sources', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        github_sources: [{ owner: 'test', repos: [{ name: 'repo1' }] }] as any,
        local_sources: [],
        mcp_servers: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"resources":{"subscribe":true,"listChanged":true}')
      );
    });
  });

  describe('resources/list method', () => {
    it('should return empty resources for empty config', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        github_sources: [],
        local_sources: [],
        mcp_servers: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/list',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"resources":[]')
      );
    });

    it('should return github resources', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        github_sources: [{ owner: 'anthropics', repos: [{ name: 'test-repo' }] }] as any,
        local_sources: [],
        mcp_servers: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/list',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"uri":"github://anthropics/test-repo"')
      );
      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"name":"anthropics/test-repo"')
      );
    });

    it('should handle single repo format and repo fallback', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        github_sources: [
          { owner: 'test1' }, // Single repo format (no repos array)
          { owner: 'test2', repos: [{ repo: 'fallback-repo' }] } // repo field fallback
        ] as any,
        local_sources: [],
        mcp_servers: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/list',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"uri":"github://test1/unknown"')
      );
      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"uri":"github://test2/fallback-repo"')
      );
    });

    it('should return local resources', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        github_sources: [],
        local_sources: [{ url: '/test/path' }],
        mcp_servers: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/list',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"uri":"file:///test/path"')
      );
    });
  });

  describe('tools/list method', () => {
    it('should return empty tools list', async () => {
      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"tools":[]')
      );
    });
  });

  describe('prompts/list method', () => {
    it('should return empty prompts list', async () => {
      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'prompts/list',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"prompts":[]')
      );
    });
  });

  describe('unknown methods', () => {
    it('should return method not found error', async () => {
      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 5,
        method: 'unknown/method',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"error":{"code":-32601,"message":"Method not found: unknown/method"}')
      );
    });

    it('should not respond to notifications', async () => {
      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(notification) + '\n'));

      // Should not write any response for notifications
      expect(mockStdout).not.toHaveBeenCalled();
    });
  });

  describe('stdin handling', () => {
    it('should exit process when stdin ends', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      await server.start();
      
      const endHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'end')[1];
      endHandler();
      
      expect(mockExit).toHaveBeenCalledWith(0);
      
      mockExit.mockRestore();
    });
  });

  describe('message parsing', () => {
    it('should handle multiple messages in buffer', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        github_sources: [],
        local_sources: [],
        mcp_servers: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const messages = [
        { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'prompts/list', params: {} }
      ];

      const buffer = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
      dataHandler(Buffer.from(buffer));

      expect(mockStdout).toHaveBeenCalledTimes(2);
    });

    it('should ignore invalid JSON', async () => {
      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      
      dataHandler(Buffer.from('invalid json\n'));

      expect(mockStdout).not.toHaveBeenCalled();
    });

    it('should ignore empty lines', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        github_sources: [],
        local_sources: [],
        mcp_servers: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      
      // Send empty lines and whitespace-only lines
      const buffer = '\n  \n\t\n' + JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      }) + '\n';
      
      dataHandler(Buffer.from(buffer));

      // Should only respond to the actual request, not the empty lines
      expect(mockStdout).toHaveBeenCalledTimes(1);
      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"tools":[]')
      );
    });
  });
});