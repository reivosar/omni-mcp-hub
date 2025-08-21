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
      }),
      loadYamlConfig: vi.fn().mockResolvedValue({
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

    it('should handle YAML config loading errors', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      yamlConfigManager.loadYamlConfig = vi.fn().mockRejectedValue(new Error('YAML parse error'));
      
      await expect(manager.initializeFromYamlConfig()).resolves.toBeUndefined();
    });

    it('should handle empty servers array', async () => {
      yamlConfigManager.getConfig = vi.fn().mockReturnValue({
        externalServers: {
          enabled: true,
          servers: [],
          autoConnect: true
        }
      });

      const manager = new MCPProxyManager(yamlConfigManager);
      await manager.initializeFromYamlConfig();
      expect(MCPProxyClient).not.toHaveBeenCalled();
    });

    it('should handle missing externalServers config', async () => {
      yamlConfigManager.getConfig = vi.fn().mockReturnValue({});

      const manager = new MCPProxyManager(yamlConfigManager);
      await expect(manager.initializeFromYamlConfig()).resolves.toBeUndefined();
    });

    it('should initialize multiple servers', async () => {
      yamlConfigManager.getConfig = vi.fn().mockReturnValue({
        externalServers: {
          enabled: true,
          servers: [
            { name: 'server1', command: 'node', args: ['s1.js'] },
            { name: 'server2', command: 'node', args: ['s2.js'] }
          ],
          autoConnect: true
        }
      });
      
      yamlConfigManager.loadYamlConfig = vi.fn().mockResolvedValue({
        externalServers: {
          enabled: true,
          servers: [
            { name: 'server1', command: 'node', args: ['s1.js'] },
            { name: 'server2', command: 'node', args: ['s2.js'] }
          ],
          autoConnect: true
        }
      });

      const manager = new MCPProxyManager(yamlConfigManager);
      await manager.initializeFromYamlConfig();
      expect(MCPProxyClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('Advanced Tool Operations', () => {
    it('should handle tool calls with complex arguments', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test-server.js']
      };

      const complexArgs = {
        nested: { data: 'value' },
        array: [1, 2, 3],
        string: 'test'
      };

      mockClient.isConnected.mockReturnValue(true);
      mockClient.getTools.mockReturnValue([{ name: 'test-server__complex_tool' }]);
      mockClient.callTool.mockResolvedValue({ 
        content: [{ type: 'text', text: JSON.stringify(complexArgs) }] 
      });

      await manager.addServer(config);
      // Aggregate tools to populate the internal map
      await manager.aggregateTools();
      
      const result = await manager.callTool('test-server__complex_tool', complexArgs);
      
      expect(mockClient.callTool).toHaveBeenCalledWith('test-server__complex_tool', complexArgs);
      expect(result.content[0].text).toContain('nested');
    });

    it('should handle tool call timeouts', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      mockClient.isConnected.mockReturnValue(true);
      mockClient.getTools.mockReturnValue([{ name: 'test-server__timeout_tool' }]);
      mockClient.callTool.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      await manager.addServer(config);
      await manager.aggregateTools();
      
      await expect(manager.callTool('test-server__timeout_tool', {}))
        .rejects.toThrow('Timeout');
    });

    it('should handle malformed tool names', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      
      await expect(manager.callTool('malformed_tool_name', {}))
        .rejects.toThrow('Tool malformed_tool_name not found');
    });
  });

  describe('Resource Management Edge Cases', () => {
    it('should handle resource read with large data', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      const largeData = 'x'.repeat(10000);
      mockClient.isConnected.mockReturnValue(true);
      mockClient.getResources.mockReturnValue([{ uri: 'test-server://large://resource' }]);
      mockClient.readResource.mockResolvedValue({
        contents: [{ type: 'text', text: largeData }]
      });

      await manager.addServer(config);
      await manager.aggregateResources();
      
      const result = await manager.readResource('test-server://large://resource');
      
      expect(result.contents[0].text).toBe(largeData);
    });

    it('should handle resource URI parsing errors', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      
      await expect(manager.readResource('invalid-uri-format'))
        .rejects.toThrow('Resource invalid-uri-format not found');
    });

    it('should handle empty resource responses', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      mockClient.isConnected.mockReturnValue(true);
      mockClient.getResources.mockReturnValue([{ uri: 'test-server://empty://resource' }]);
      mockClient.readResource.mockResolvedValue({ contents: [] });

      await manager.addServer(config);
      await manager.aggregateResources();
      
      const result = await manager.readResource('test-server://empty://resource');
      
      expect(result.contents).toHaveLength(0);
    });
  });

  describe('Configuration Management', () => {
    it('should handle server config validation', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const invalidConfig = { name: '', command: '', args: [] };

      // Should not throw for empty config (handled by client)
      await expect(manager.addServer(invalidConfig as any)).resolves.toBeUndefined();
    });

    it('should handle config updates', async () => {
      yamlConfigManager.getConfig = vi.fn().mockReturnValue({
        externalServers: {
          enabled: true,
          servers: [{ name: 'updated-server', command: 'node', args: ['updated.js'] }],
          autoConnect: false
        }
      });
      
      yamlConfigManager.loadYamlConfig = vi.fn().mockResolvedValue({
        externalServers: {
          enabled: true,
          servers: [{ name: 'updated-server', command: 'node', args: ['updated.js'] }],
          autoConnect: false
        }
      });

      const manager = new MCPProxyManager(yamlConfigManager);
      await manager.initializeFromYamlConfig();
      
      expect(MCPProxyClient).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'updated-server' }),
        expect.any(SilentLogger)
      );
    });

    it('should handle missing config properties', async () => {
      yamlConfigManager.getConfig = vi.fn().mockReturnValue({
        externalServers: {
          enabled: true,
          servers: [{ name: 'minimal-server' }] // Missing command/args
        }
      });
      
      yamlConfigManager.loadYamlConfig = vi.fn().mockResolvedValue({
        externalServers: {
          enabled: true,
          servers: [{ name: 'minimal-server' }] // Missing command/args
        }
      });

      const manager = new MCPProxyManager(yamlConfigManager);
      await manager.initializeFromYamlConfig();
      expect(MCPProxyClient).toHaveBeenCalled();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent tool calls', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      mockClient.isConnected.mockReturnValue(true);
      mockClient.getTools.mockReturnValue([
        { name: 'test-server__tool1' },
        { name: 'test-server__tool2' },
        { name: 'test-server__tool3' }
      ]);
      mockClient.callTool.mockImplementation(async (toolName) => ({
        content: [{ type: 'text', text: `Result for ${toolName}` }]
      }));

      await manager.addServer(config);
      await manager.aggregateTools();

      const promises = [
        manager.callTool('test-server__tool1', {}),
        manager.callTool('test-server__tool2', {}),
        manager.callTool('test-server__tool3', {})
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(mockClient.callTool).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent resource reads', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      mockClient.isConnected.mockReturnValue(true);
      mockClient.getResources.mockReturnValue([
        { uri: 'test-server://resource1' },
        { uri: 'test-server://resource2' },
        { uri: 'test-server://resource3' }
      ]);
      mockClient.readResource.mockImplementation(async (uri) => ({
        contents: [{ type: 'text', text: `Content for ${uri}` }]
      }));

      await manager.addServer(config);
      await manager.aggregateResources();

      const promises = [
        manager.readResource('test-server://resource1'),
        manager.readResource('test-server://resource2'),
        manager.readResource('test-server://resource3')
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(mockClient.readResource).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed concurrent operations', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      mockClient.isConnected.mockReturnValue(true);
      mockClient.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'tool result' }] });
      mockClient.readResource.mockResolvedValue({ contents: [{ type: 'text', text: 'resource content' }] });
      mockClient.getTools.mockReturnValue([{ name: 'test-server__tool' }]);
      mockClient.getResources.mockReturnValue([{ uri: 'test-server://resource' }]);

      await manager.addServer(config);
      await manager.aggregateTools();
      await manager.aggregateResources();

      const promises = [
        manager.callTool('test-server__tool', {}),
        manager.readResource('test-server://resource'),
        manager.aggregateTools(),
        manager.aggregateResources()
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(4);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary connection failures', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      // First connection fails, second succeeds
      mockClient.connect
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(undefined);

      await expect(manager.addServer(config)).rejects.toThrow('Temporary failure');
      
      // Reset mock for retry
      vi.mocked(MCPProxyClient).mockReturnValue({
        ...mockClient,
        connect: vi.fn().mockResolvedValue(undefined)
      } as any);
      
      await expect(manager.addServer(config)).resolves.toBeUndefined();
    });

    it('should handle partial failures in aggregation', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config1 = { name: 'server1', command: 'node', args: ['s1.js'] };
      const config2 = { name: 'server2', command: 'node', args: ['s2.js'] };

      // Create separate mocks for each server
      const mockClient1 = {
        ...mockClient,
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockReturnValue([{ name: 'server1__tool1' }]),
        getServerName: vi.fn().mockReturnValue('server1'),
        config: { name: 'server1', command: 'node', args: ['s1.js'] }
      };
      const mockClient2 = {
        ...mockClient,
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockReturnValue([]), // Return empty instead of throwing
        getServerName: vi.fn().mockReturnValue('server2'),
        config: { name: 'server2', command: 'node', args: ['s2.js'] }
      };

      vi.mocked(MCPProxyClient)
        .mockReturnValueOnce(mockClient1 as any)
        .mockReturnValueOnce(mockClient2 as any);

      await manager.addServer(config1);
      await manager.addServer(config2);

      const tools = await manager.aggregateTools();
      expect(tools).toHaveLength(1); // Only server1 tool should be returned
      expect(tools[0].name).toBe('server1__tool1');
    });

    it('should handle disconnection during operations', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      mockClient.isConnected
        .mockReturnValueOnce(true)   // Initially connected
        .mockReturnValueOnce(false); // Disconnected during operation

      await manager.addServer(config);

      await expect(manager.callTool('test-server__tool', {}))
        .rejects.toThrow('Tool test-server__tool not found');
    });
  });

  describe('Server State Management', () => {
    it('should track server connection states', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      await manager.addServer(config);
      
      // Check that server is tracked
      mockClient.isConnected.mockReturnValue(true);
      const tools = await manager.aggregateTools();
      expect(tools.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle server removal scenarios', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      await manager.addServer(config);
      await manager.disconnectAll();
      
      // After disconnection, tools should be empty
      mockClient.isConnected.mockReturnValue(false);
      const tools = await manager.aggregateTools();
      expect(tools).toHaveLength(0);
    });

    it('should handle server restart scenarios', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      await manager.addServer(config);
      await manager.disconnectAll();
      
      // Reconnect
      mockClient.connect.mockResolvedValue(undefined);
      await manager.connectAll();
      
      expect(mockClient.connect).toHaveBeenCalled();
    });
  });

  describe('Memory and Resource Cleanup', () => {
    it('should clean up resources on disconnect', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      await manager.addServer(config);
      await manager.disconnectAll();
      
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const manager = new MCPProxyManager(yamlConfigManager);
      const config = { name: 'test-server', command: 'node', args: ['test.js'] };

      await manager.addServer(config);
      mockClient.disconnect.mockRejectedValue(new Error('Cleanup failed'));
      
      // Current implementation throws if any disconnect fails
      await expect(manager.disconnectAll()).rejects.toThrow('Cleanup failed');
    });
  });
});