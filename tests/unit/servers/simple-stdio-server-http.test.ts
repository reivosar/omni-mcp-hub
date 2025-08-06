/**
 * Tests for SimpleStdioServer HTTP MCP functionality
 */

import { SimpleStdioServer } from '../../../src/servers/simple-stdio-server';
import { SourceConfigManager } from '../../../src/config/source-config-manager';
import { MCPServerManager } from '../../../src/mcp/mcp-server-manager';

// Mock SourceConfigManager
jest.mock('../../../src/config/source-config-manager');

// Mock MCPServerManager
jest.mock('../../../src/mcp/mcp-server-manager');

// Mock fetch
global.fetch = jest.fn();

describe('SimpleStdioServer HTTP MCP', () => {
  let server: SimpleStdioServer;
  let mockConfigManager: jest.Mocked<SourceConfigManager>;
  let mockStdout: jest.SpyInstance;
  let mockStdin: any;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();

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

    // Setup mocked config manager with HTTP MCP server
    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        server: { port: 3000 },
        mcp_servers: [
          {
            name: 'microsoft-docs',
            type: 'http',
            url: 'https://learn.microsoft.com/api/mcp',
            enabled: true
          }
        ],
        github_sources: [],
        local_sources: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      })
    } as any;
    (SourceConfigManager as any).mockImplementation(() => mockConfigManager);

    // Mock MCPServerManager
    (MCPServerManager as any).mockImplementation(() => ({
      initializeServers: jest.fn().mockResolvedValue(undefined),
      getAllTools: jest.fn().mockResolvedValue([]),
      callTool: jest.fn().mockRejectedValue(new Error('Tool not found'))
    }));

    server = new SimpleStdioServer();
  });

  afterEach(() => {
    mockStdout.mockRestore();
    jest.clearAllMocks();
  });

  describe('HTTP MCP capabilities', () => {
    it('should include tools capability when HTTP MCP servers are configured', async () => {
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

    it('should fetch tools from HTTP MCP server', async () => {
      const mockTools = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            {
              name: 'microsoft_docs_search',
              description: 'Search Microsoft documentation',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' }
                }
              }
            }
          ]
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTools
      } as any);

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        'https://learn.microsoft.com/api/mcp/tools/list',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"name":"microsoft_docs_search"')
      );
    });

    it('should handle HTTP MCP server fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Errors are silently ignored in stdio mode, so should return empty tools
      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"tools":[]')
      );
    });
  });

  describe('HTTP MCP tool calls', () => {
    beforeEach(() => {
      // Mock successful tools/list response
      const mockTools = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            {
              name: 'microsoft_docs_search',
              description: 'Search Microsoft documentation'
            }
          ]
        }
      };

      mockFetch.mockImplementation((url) => {
        if (url.toString().includes('tools/list')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockTools
          } as any);
        }
        return Promise.resolve({ ok: false } as any);
      });
    });

    it('should call HTTP MCP tool successfully', async () => {
      const mockToolResult = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: 'Search results for Azure CLI'
            }
          ]
        }
      };

      mockFetch.mockImplementation((url) => {
        if (url.toString().includes('tools/call')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockToolResult
          } as any);
        }
        if (url.toString().includes('tools/list')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              result: {
                tools: [{ name: 'microsoft_docs_search' }]
              }
            })
          } as any);
        }
        return Promise.resolve({ ok: false } as any);
      });

      await server.start();

      // First get tools list to populate cache
      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      };
      dataHandler(Buffer.from(JSON.stringify(toolsRequest) + '\n'));
      await new Promise(resolve => setTimeout(resolve, 10));

      // Now call the tool
      const toolCallRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'microsoft_docs_search',
          arguments: { query: 'Azure CLI' }
        }
      };

      dataHandler(Buffer.from(JSON.stringify(toolCallRequest) + '\n'));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        'https://learn.microsoft.com/api/mcp/tools/call',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"microsoft_docs_search"')
        })
      );
    });

    it('should handle missing tool name in call', async () => {
      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          arguments: { query: 'test' }
        }
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"error":{"code":-32602,"message":"Missing tool name"}')
      );
    });

    it('should handle tool not found', async () => {
      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool',
          arguments: {}
        }
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"error":{"code":-32601,"message":"Tool nonexistent_tool not found or failed:')
      );
    });

    it('should handle HTTP errors in tool calls', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.toString().includes('tools/call')) {
          return Promise.resolve({
            ok: false,
            status: 500
          } as any);
        }
        if (url.toString().includes('tools/list')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              result: {
                tools: [{ name: 'microsoft_docs_search' }]
              }
            })
          } as any);
        }
        return Promise.resolve({ ok: false } as any);
      });

      await server.start();

      // First populate tools cache
      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      };
      dataHandler(Buffer.from(JSON.stringify(toolsRequest) + '\n'));
      await new Promise(resolve => setTimeout(resolve, 10));

      // Now call the tool
      const toolCallRequest = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'microsoft_docs_search',
          arguments: { query: 'test' }
        }
      };

      dataHandler(Buffer.from(JSON.stringify(toolCallRequest) + '\n'));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStdout).toHaveBeenCalledWith(
        expect.stringContaining('"error":{"code":-32603,"message":"HTTP error 500"}')
      );
    });
  });

  describe('Mixed configuration', () => {
    it('should handle both HTTP MCP servers and disabled servers', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        mcp_servers: [
          {
            name: 'microsoft-docs',
            type: 'http',
            url: 'https://learn.microsoft.com/api/mcp',
            enabled: true
          },
          {
            name: 'disabled-server',
            type: 'http',
            url: 'https://example.com/api/mcp',
            enabled: false
          }
        ],
        github_sources: [],
        local_sources: [],
        files: { patterns: [], max_size: 1000000 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 2 },
        security: { content_validation: { enabled: true, reject_patterns: [], additional_keywords: [], max_file_size: 10000000 } }
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { tools: [{ name: 'test_tool' }] }
        })
      } as any);

      await server.start();

      const dataHandler = mockStdin.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      dataHandler(Buffer.from(JSON.stringify(request) + '\n'));
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should only call enabled server
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://learn.microsoft.com/api/mcp/tools/list',
        expect.any(Object)
      );
    });
  });
});