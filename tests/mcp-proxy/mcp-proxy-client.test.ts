import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPProxyClient } from '../../src/mcp-proxy/client.js';

// Mock stdio transports
const mockTransport = {
  connect: vi.fn(),
  close: vi.fn(),
  send: vi.fn(),
  onmessage: null,
  onclose: null,
  onerror: null
};

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => mockTransport)
}));

// Mock MCP client
const mockClient = {
  connect: vi.fn(),
  close: vi.fn(),
  listTools: vi.fn(),
  listResources: vi.fn(),
  callTool: vi.fn(),
  readResource: vi.fn()
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => mockClient)
}));

describe('MCPProxyClient', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Set up mock responses
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.close.mockResolvedValue(undefined);
    mockClient.listTools.mockResolvedValue({ tools: [] });
    mockClient.listResources.mockResolvedValue({ resources: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create MCPProxyClient with correct configuration', () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      expect(client).toBeInstanceOf(MCPProxyClient);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      await expect(client.connect()).resolves.toBeUndefined();
      expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
      expect(client.isConnected()).toBe(true);
    });

    it('should handle connection errors', async () => {
      const config = {
        name: 'test-server',
        command: 'invalid-command',
        args: [],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      // Mock connection failure
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));
      
      await expect(client.connect()).rejects.toThrow('Connection failed');
      expect(client.isConnected()).toBe(false);
    });

    it('should not connect twice', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      await client.connect();
      await client.connect(); // Should not connect again
      
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(true);
    });

    it('should handle environment variables in config', () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server',
        env: {
          TEST_VAR: 'test-value'
        }
      };

      const client = new MCPProxyClient(config);
      expect(client).toBeInstanceOf(MCPProxyClient);
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      // Connect first
      await client.connect();

      // Now disconnect
      await client.disconnect();
      
      expect(mockClient.close).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      // Should not throw when disconnecting without connecting
      await expect(client.disconnect()).resolves.toBeUndefined();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle disconnect errors gracefully', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      // Connect first
      await client.connect();

      // Mock disconnect failure
      mockClient.close.mockRejectedValue(new Error('Disconnect failed'));
      
      // Should still resolve, not throw
      await expect(client.disconnect()).resolves.toBeUndefined();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getTools', () => {
    it('should return tools from connected server', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      // Mock listTools response  
      const mockTools = [
        { name: 'test_tool', description: 'Test tool' }
      ];
      mockClient.listTools.mockResolvedValue({ tools: mockTools });
      
      // Connect and fetch capabilities
      await client.connect();
      
      const tools = client.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-server__test_tool'); // Should be prefixed
    });

    it('should return empty array when not connected', () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      const tools = client.getTools();
      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should call tool on server', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      // Mock callTool response
      const mockResult = { content: [{ type: 'text', text: 'Tool result' }] };
      mockClient.callTool.mockResolvedValue(mockResult);
      
      await client.connect();

      const result = await client.callTool('test-server__test_tool', { arg: 'value' });
      
      expect(mockClient.callTool).toHaveBeenCalledWith({ 
        name: 'test_tool', 
        arguments: { arg: 'value' }
      });
      expect(result).toEqual(mockResult);
    });

    it('should throw error when not connected', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      await expect(client.callTool('test_tool', {}))
        .rejects.toThrow('Not connected to test-server');
    });
  });

  describe('getResources', () => {
    it('should return resources from connected server', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      // Mock listResources response
      const mockResources = [
        { uri: 'test://resource', name: 'Test Resource' }
      ];
      mockClient.listResources.mockResolvedValue({ resources: mockResources });
      
      await client.connect();
      
      const resources = client.getResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('test-server://test://resource'); // Should be prefixed
    });

    it('should return empty array when not connected', () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      const resources = client.getResources();
      expect(resources).toEqual([]);
    });
  });

  describe('readResource', () => {
    it('should read resource from server', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      // Mock readResource response
      const mockResult = { 
        contents: [{ uri: 'test://resource', mimeType: 'text/plain', text: 'Resource content' }] 
      };
      mockClient.readResource.mockResolvedValue(mockResult);
      
      await client.connect();

      const result = await client.readResource('test-server://test://resource');
      
      expect(mockClient.readResource).toHaveBeenCalledWith({ uri: 'test://resource' });
      expect(result).toEqual(mockResult);
    });

    it('should throw error when not connected', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      await expect(client.readResource('test://resource'))
        .rejects.toThrow('Not connected to test-server');
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      expect(client.isConnected()).toBe(false);
    });

    it('should return true when connected', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      await client.connect();
      
      expect(client.isConnected()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      
      await client.connect();
      expect(client.isConnected()).toBe(true);
      
      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getServerName', () => {
    it('should return server name', () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const client = new MCPProxyClient(config);
      expect(client.getServerName()).toBe('test-server');
    });
  });
});