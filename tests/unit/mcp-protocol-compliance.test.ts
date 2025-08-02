import { MCPHandler } from '../../src/handlers/mcp-handler';
import { SourceConfigManager } from '../../src/config/source-config-manager';
import { ContentValidator } from '../../src/utils/content-validator';
import { MCPServerManager } from '../../src/mcp/mcp-server-manager';

// Mock dependencies
jest.mock('../../src/utils/content-validator');
jest.mock('../../src/mcp/mcp-server-manager');

const mockContentValidator = ContentValidator as jest.MockedClass<typeof ContentValidator>;
const mockMCPServerManager = MCPServerManager as jest.MockedClass<typeof MCPServerManager>;

describe('MCP Protocol Compliance Tests', () => {
  let handler: MCPHandler;
  let mockConfig: any;
  let mockServerManager: jest.Mocked<MCPServerManager>;

  beforeEach(() => {
    // Setup mock config
    mockConfig = {
      server: { port: 3000 },
      github_sources: [],
      local_sources: [],
      mcp_servers: [
        {
          name: 'test-server',
          command: 'python',
          args: ['-m', 'test'],
          enabled: true
        }
      ],
      files: { patterns: ['*.md'], max_size: 1048576 },
      fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 3 }
    };

    // Setup mock server manager
    mockServerManager = {
      startServer: jest.fn(),
      stopServer: jest.fn(),
      stopAllServers: jest.fn(),
      getServer: jest.fn(),
      getAllServers: jest.fn().mockReturnValue([]),
      getAllTools: jest.fn().mockResolvedValue([
        {
          name: 'test-server__search',
          description: 'Search tool',
          _server: 'test-server',
          _originalName: 'search',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string' }
            }
          }
        }
      ]),
      callTool: jest.fn().mockResolvedValue({ result: 'tool executed' })
    } as any;

    mockMCPServerManager.mockImplementation(() => mockServerManager);

    // Setup content validator mock
    mockContentValidator.validate.mockResolvedValue({
      isValid: true,
      flaggedPatterns: []
    });

    const sourceManager = new SourceConfigManager();
    jest.spyOn(sourceManager, 'getConfig').mockReturnValue(mockConfig);

    handler = new MCPHandler(sourceManager, mockServerManager);

    jest.clearAllMocks();
  });

  describe('Protocol Version Compliance', () => {
    test('should support MCP protocol version 2025-06-18', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };

      const response = await handler.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.protocolVersion).toBe('2025-06-18');
      expect(response.result.capabilities).toBeDefined();
      expect(response.result.serverInfo).toBeDefined();
      expect(response.result.serverInfo.name).toBe('omni-mcp-hub');
    });

    test('should reject unsupported protocol versions', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-01-01',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };

      const response = await handler.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32602);
      expect(response.error.message).toContain('Unsupported protocol version');
    });

    test('should handle missing protocol version', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };

      const response = await handler.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32602);
    });
  });

  describe('JSON-RPC 2.0 Compliance', () => {
    test('should require jsonrpc field', async () => {
      const request = {
        id: 1,
        method: 'initialize',
        params: {}
      };

      const response = await handler.handleRequest(request as any);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
      expect(response.error.message).toContain('Invalid JSON-RPC request');
    });

    test('should require correct jsonrpc version', async () => {
      const request = {
        jsonrpc: '1.0',
        id: 1,
        method: 'initialize',
        params: {}
      };

      const response = await handler.handleRequest(request as any);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });

    test('should handle requests without id (notifications)', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'initialized',
        params: {}
      };

      const response = await handler.handleRequest(request);

      // Notifications should not return a response
      expect(response).toBeNull();
    });

    test('should preserve request id in response', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 12345,
        method: 'ping',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.id).toBe(12345);
    });

    test('should handle string ids', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 'test-request-id',
        method: 'ping',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.id).toBe('test-request-id');
    });

    test('should handle null ids', async () => {
      const request = {
        jsonrpc: '2.0',
        id: null,
        method: 'ping',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.id).toBeNull();
    });
  });

  describe('Core MCP Methods', () => {
    test('should handle ping method', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.result).toEqual({});
      expect(response.error).toBeUndefined();
    });

    test('should require initialization before other methods', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32002);
      expect(response.error.message).toContain('Server not initialized');
    });

    test('should handle initialized notification', async () => {
      // First initialize
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      // Then send initialized notification
      const request = {
        jsonrpc: '2.0',
        method: 'initialized',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response).toBeNull(); // Notifications don't return responses
    });

    test('should list tools after initialization', async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
      expect(Array.isArray(response.result.tools)).toBe(true);
      expect(mockServerManager.getAllTools).toHaveBeenCalled();
    });

    test('should call tools with proper parameters', async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'test-server__search',
          arguments: { query: 'test query' }
        }
      };

      const response = await handler.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(mockServerManager.callTool).toHaveBeenCalledWith(
        'test-server__search',
        { query: 'test query' }
      );
    });

    test('should handle missing tool name in tools/call', async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          arguments: { query: 'test query' }
        }
      };

      const response = await handler.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32602);
      expect(response.error.message).toContain('name');
    });
  });

  describe('Error Handling Compliance', () => {
    test('should return proper error for unknown methods', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown/method',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toBe('Method not found');
    });

    test('should handle internal errors gracefully', async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      // Mock server manager to throw error
      mockServerManager.getAllTools.mockRejectedValueOnce(new Error('Internal server error'));

      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32603);
      expect(response.error.message).toBe('Internal error');
    });

    test('should handle malformed requests', async () => {
      const response = await handler.handleRequest(null as any);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32700);
      expect(response.error.message).toBe('Parse error');
    });

    test('should validate tool call arguments', async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      // Mock tool call to throw validation error
      mockServerManager.callTool.mockRejectedValueOnce(new Error('Invalid arguments'));

      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'test-server__search',
          arguments: { invalid: 'args' }
        }
      };

      const response = await handler.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32603);
    });
  });

  describe('Capabilities Declaration', () => {
    test('should declare proper server capabilities', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };

      const response = await handler.handleRequest(request);

      expect(response.result.capabilities).toBeDefined();
      expect(response.result.capabilities.tools).toBeDefined();
      expect(response.result.capabilities.tools.listChanged).toBe(true);
    });

    test('should include server info', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };

      const response = await handler.handleRequest(request);

      expect(response.result.serverInfo).toBeDefined();
      expect(response.result.serverInfo.name).toBe('omni-mcp-hub');
      expect(response.result.serverInfo.version).toBe('1.0.0');
    });
  });

  describe('Tool Schema Validation', () => {
    test('should return tools with proper schema', async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.result.tools).toBeDefined();
      expect(response.result.tools.length).toBeGreaterThan(0);
      
      const tool = response.result.tools[0];
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
    });

    test('should handle tools without schemas gracefully', async () => {
      // Mock tools without schemas
      mockServerManager.getAllTools.mockResolvedValueOnce([
        {
          name: 'test-server__minimal',
          _server: 'test-server',
          _originalName: 'minimal'
        }
      ]);

      // Initialize first
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      const response = await handler.handleRequest(request);

      expect(response.result.tools).toBeDefined();
      expect(response.result.tools.length).toBe(1);
      expect(response.result.tools[0].name).toBe('test-server__minimal');
    });
  });

  describe('State Management', () => {
    test('should track initialization state correctly', async () => {
      // Should not be initialized initially
      let request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      };

      let response = await handler.handleRequest(request);
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Server not initialized');

      // Initialize
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      // Should work after initialization
      request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {}
      };

      response = await handler.handleRequest(request);
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
    });

    test('should allow multiple initialization calls', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };

      // First initialization
      const response1 = await handler.handleRequest(initRequest);
      expect(response1.error).toBeUndefined();

      // Second initialization should also work
      const response2 = await handler.handleRequest({
        ...initRequest,
        id: 2
      });
      expect(response2.error).toBeUndefined();
    });
  });

  describe('Concurrency and Performance', () => {
    test('should handle multiple concurrent requests', async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      // Send multiple concurrent requests
      const requests = Array.from({ length: 10 }, (_, i) => ({
        jsonrpc: '2.0',
        id: i + 2,
        method: 'ping',
        params: {}
      }));

      const responses = await Promise.all(
        requests.map(req => handler.handleRequest(req))
      );

      expect(responses).toHaveLength(10);
      responses.forEach((response, index) => {
        expect(response.id).toBe(index + 2);
        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({});
      });
    });

    test('should handle rapid tool calls', async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      // Send rapid tool calls
      const toolCalls = Array.from({ length: 5 }, (_, i) => ({
        jsonrpc: '2.0',
        id: i + 2,
        method: 'tools/call',
        params: {
          name: 'test-server__search',
          arguments: { query: `query-${i}` }
        }
      }));

      const responses = await Promise.all(
        toolCalls.map(req => handler.handleRequest(req))
      );

      expect(responses).toHaveLength(5);
      expect(mockServerManager.callTool).toHaveBeenCalledTimes(5);
      responses.forEach(response => {
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();
      });
    });
  });
});