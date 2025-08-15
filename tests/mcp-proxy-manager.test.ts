import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPProxyManager } from '../src/mcp-proxy/manager.js';
import { MCPProxyClient } from '../src/mcp-proxy/client.js';
import { YamlConfigManager } from '../src/config/yaml-config.js';
import { SilentLogger } from '../src/utils/logger.js';

// Mock MCPProxyClient
vi.mock('../src/mcp-proxy/client.js', () => ({
  MCPProxyClient: vi.fn().mockImplementation((config, logger) => ({
    config,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(false),
    getTools: vi.fn().mockReturnValue([]),
    getResources: vi.fn().mockReturnValue([]),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'mock result' }] }),
    readResource: vi.fn().mockResolvedValue({ contents: [{ type: 'text', text: 'mock resource' }] }),
    getServerName: vi.fn().mockReturnValue(config.name)
  }))
}));

describe('MCPProxyManager', () => {
  let yamlConfigManager: YamlConfigManager;
  let mockClient: any;

  beforeEach(() => {
    // Create a mock YAML config manager
    yamlConfigManager = {
      getConfig: vi.fn().mockReturnValue({
        externalServers: {
          enabled: true,
          servers: [
            {
              name: 'test-server',
              command: 'node',
              args: ['test-server.js'],
              description: 'Test server'
            }
          ],
          autoConnect: true,
          retry: {
            maxAttempts: 3,
            delayMs: 1000
          }
        }
      })
    } as any;

    // Reset the mock client
    mockClient = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(false),
      getTools: vi.fn().mockReturnValue([]),
      callTool: vi.fn(),
      getResources: vi.fn().mockReturnValue([]),
      readResource: vi.fn(),
      getServerName: vi.fn().mockReturnValue('test-server'),
      config: {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      }
    };

    vi.mocked(MCPProxyClient).mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create MCPProxyManager with YAML config', () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      expect(manager).toBeInstanceOf(MCPProxyManager);
    });
  });

  describe('addServer', () => {
    it('should add server and create client', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      await manager.addServer(config);
      expect(MCPProxyClient).toHaveBeenCalledWith(config, expect.any(SilentLogger));
    });

    it('should not add duplicate servers', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      await manager.addServer(config);
      await manager.addServer(config); // Add same server again

      expect(MCPProxyClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('connectAll', () => {
    it('should connect to all servers', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      manager.addServer(config);
      mockClient.connect.mockResolvedValue(undefined);

      await manager.connectAll();
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('should handle connection failures', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      // Create a mock that always fails
      const connectMock = vi.fn().mockRejectedValue(new Error('Connection failed'));

      vi.mocked(MCPProxyClient).mockImplementation((config) => ({
        config,
        connect: connectMock,
        disconnect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(false),
        getTools: vi.fn().mockReturnValue([]),
        getResources: vi.fn().mockReturnValue([]),
        callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'mock result' }] }),
        readResource: vi.fn().mockResolvedValue({ contents: [{ type: 'text', text: 'mock resource' }] }),
        getServerName: vi.fn().mockReturnValue(config.name)
      }) as any);

      // Should throw error when connection fails
      await expect(manager.addServer(config)).rejects.toThrow('Connection failed');
      
      // connectAll should handle errors gracefully since server wasn't added
      await expect(manager.connectAll()).resolves.toBeUndefined();
    });

    it('should handle persistent connection failures', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      // Create a mock that always fails
      const connectMock = vi.fn().mockRejectedValue(new Error('Connection failed'));

      vi.mocked(MCPProxyClient).mockImplementation((config) => ({
        config,
        connect: connectMock,
        disconnect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(false),
        getTools: vi.fn().mockReturnValue([]),
        getResources: vi.fn().mockReturnValue([]),
        callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'mock result' }] }),
        readResource: vi.fn().mockResolvedValue({ contents: [{ type: 'text', text: 'mock resource' }] }),
        getServerName: vi.fn().mockReturnValue(config.name)
      }) as any);

      // Should throw error when connection fails (no retry logic currently)
      await expect(manager.addServer(config)).rejects.toThrow('Connection failed');
      expect(connectMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect from all servers', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      const disconnectMock = vi.fn().mockResolvedValue(undefined);
      
      // Update mock to track disconnect calls
      vi.mocked(MCPProxyClient).mockImplementation((config) => ({
        config,
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: disconnectMock,
        isConnected: vi.fn().mockReturnValue(false),
        getTools: vi.fn().mockReturnValue([]),
        getResources: vi.fn().mockReturnValue([]),
        callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'mock result' }] }),
        readResource: vi.fn().mockResolvedValue({ contents: [{ type: 'text', text: 'mock resource' }] }),
        getServerName: vi.fn().mockReturnValue(config.name)
      }) as any);

      await manager.addServer(config);

      await manager.disconnectAll();
      expect(disconnectMock).toHaveBeenCalled();
    });

    it('should handle disconnection errors gracefully', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      manager.addServer(config);
      mockClient.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      await expect(manager.disconnectAll()).resolves.toBeUndefined();
    });
  });

  describe('aggregateTools', () => {
    it('should aggregate tools from all servers', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      // Update the mock to return tools and be connected
      vi.mocked(MCPProxyClient).mockImplementation((config) => ({
        config,
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockReturnValue([
          { name: `${config.name}__test_tool`, description: 'Test tool' }
        ]),
        getResources: vi.fn().mockReturnValue([]),
        callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'mock result' }] }),
        readResource: vi.fn().mockResolvedValue({ contents: [{ type: 'text', text: 'mock resource' }] }),
        getServerName: vi.fn().mockReturnValue(config.name)
      }) as any);

      await manager.addServer(config);

      const tools = await manager.aggregateTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-server__test_tool');
    });

    it('should skip disconnected servers', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      manager.addServer(config);
      mockClient.isConnected.mockReturnValue(false);

      const tools = await manager.aggregateTools();
      expect(tools).toHaveLength(0);
      // getTools should not be called for disconnected servers
    });

    it('should handle tool listing errors', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      manager.addServer(config);
      mockClient.isConnected.mockReturnValue(true);
      mockClient.getTools.mockReturnValue([]);  // Should return empty on errors

      const tools = await manager.aggregateTools();
      expect(tools).toHaveLength(0);
    });
  });

  describe('aggregateResources', () => {
    it('should aggregate resources from all servers', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      // Update mock to return resources and be connected
      vi.mocked(MCPProxyClient).mockImplementation((config) => ({
        config,
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockReturnValue([]),
        getResources: vi.fn().mockReturnValue([
          { uri: `${config.name}://test://resource`, name: 'Test Resource' }
        ]),
        callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Result' }] }),
        readResource: vi.fn().mockResolvedValue({ contents: [{ type: 'text', text: 'mock resource' }] }),
        getServerName: vi.fn().mockReturnValue(config.name)
      }) as any);

      await manager.addServer(config);

      const resources = await manager.aggregateResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('test-server://test://resource');
    });

    it('should skip disconnected servers for resources', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      manager.addServer(config);
      mockClient.isConnected.mockReturnValue(false);

      const resources = await manager.aggregateResources();
      expect(resources).toHaveLength(0);
      // getResources should not be called for disconnected servers
    });

    it('should handle resource listing errors', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      manager.addServer(config);
      mockClient.isConnected.mockReturnValue(true);
      mockClient.getResources.mockReturnValue([]);  // Should return empty on errors

      const resources = await manager.aggregateResources();
      expect(resources).toHaveLength(0);
    });
  });

  describe('callTool', () => {
    it('should call tool on correct server', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      // Update mock to return tools and be connected
      vi.mocked(MCPProxyClient).mockImplementation((config) => ({
        config,
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockReturnValue([
          { name: `${config.name}__test_tool`, description: 'Test tool' }
        ]),
        getResources: vi.fn().mockReturnValue([]),
        callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Result' }] }),
        readResource: vi.fn().mockResolvedValue({ contents: [{ type: 'text', text: 'mock resource' }] }),
        getServerName: vi.fn().mockReturnValue(config.name)
      }) as any);

      await manager.addServer(config);

      const result = await manager.callTool('test-server__test_tool', { arg: 'value' });
      expect(result).toEqual({ content: [{ type: 'text', text: 'Result' }] });
    });

    it('should throw error for unknown tool', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      
      await expect(manager.callTool('unknown__tool', {}))
        .rejects.toThrow('Tool unknown__tool not found in any connected MCP server');
    });

    it('should throw error when server is disconnected', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      await manager.addServer(config);
      mockClient.isConnected.mockReturnValue(false);

      await expect(manager.callTool('test-server__test_tool', {}))
        .rejects.toThrow('Tool test-server__test_tool not found in any connected MCP server');
    });
  });

  describe('readResource', () => {
    it('should read resource from correct server', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      // Update mock to return resources and be connected
      vi.mocked(MCPProxyClient).mockImplementation((config) => ({
        config,
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockReturnValue([]),
        getResources: vi.fn().mockReturnValue([
          { uri: `${config.name}://test://resource`, name: 'Test Resource' }
        ]),
        callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Result' }] }),
        readResource: vi.fn().mockResolvedValue({ 
          contents: [{ uri: 'test://resource', mimeType: 'text/plain', text: 'Content' }] 
        }),
        getServerName: vi.fn().mockReturnValue(config.name)
      }) as any);

      await manager.addServer(config);

      const result = await manager.readResource('test-server://test://resource');
      expect(result.contents[0].text).toBe('Content');
    });

    it('should throw error for unknown server in resource URI', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      
      await expect(manager.readResource('unknown://test://resource'))
        .rejects.toThrow('Resource unknown://test://resource not found in any connected MCP server');
    });

    it('should throw error when server is disconnected for resource', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      };

      manager.addServer(config);
      mockClient.isConnected.mockReturnValue(false);

      await expect(manager.readResource('test-server://test://resource'))
        .rejects.toThrow('Resource test-server://test://resource not found in any connected MCP server');
    });
  });

  describe('initializeFromYamlConfig', () => {
    it('should initialize servers from YAML config', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      
      // Mock loadYamlConfig to return actual config
      yamlConfigManager.loadYamlConfig = vi.fn().mockResolvedValue({
        externalServers: {
          enabled: true,
          servers: [{
            name: 'test-server',
            command: 'node',
            args: ['test-server.js'],
            description: 'Test server'
          }],
          autoConnect: true,
          retry: { maxAttempts: 3, delayMs: 1000 }
        }
      });
      
      yamlConfigManager.getConfig = vi.fn().mockReturnValue({
        externalServers: {
          enabled: true,
          servers: [{
            name: 'test-server',
            command: 'node',
            args: ['test-server.js'],
            description: 'Test server'
          }],
          autoConnect: true,
          retry: { maxAttempts: 3, delayMs: 1000 }
        }
      });

      mockClient.connect.mockResolvedValue(undefined);

      await manager.initializeFromYamlConfig();
      expect(MCPProxyClient).toHaveBeenCalledWith({
        name: 'test-server',
        command: 'node',
        args: ['test-server.js'],
        description: 'Test server'
      }, expect.any(SilentLogger));
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('should skip initialization when external servers are disabled', async () => {
      yamlConfigManager.getConfig = vi.fn().mockReturnValue({
        externalServers: {
          enabled: false,
          servers: []
        }
      });

      const manager = new MCPProxyManager(yamlConfigManager);
      await manager.initializeFromYamlConfig();
      expect(MCPProxyClient).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      
      // Mock loadYamlConfig to return config with servers
      yamlConfigManager.loadYamlConfig = vi.fn().mockResolvedValue({
        externalServers: {
          enabled: true,
          servers: [{
            name: 'test-server',
            command: 'node',
            args: ['test-server.js'],
            description: 'Test server'
          }],
          autoConnect: true,
          retry: { maxAttempts: 3, delayMs: 1000 }
        }
      });
      
      yamlConfigManager.getConfig = vi.fn().mockReturnValue({
        externalServers: {
          enabled: true,
          servers: [{
            name: 'test-server',
            command: 'node',
            args: ['test-server.js'],
            description: 'Test server'
          }],
          autoConnect: true,
          retry: { maxAttempts: 3, delayMs: 1000 }
        }
      });
      
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(manager.initializeFromYamlConfig()).resolves.toBeUndefined();
      expect(mockClient.connect).toHaveBeenCalled();
    });
  });
});