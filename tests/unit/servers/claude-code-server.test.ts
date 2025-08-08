/**
 * Claude Code Server Tests
 * 
 * Tests WebSocket-based MCP server for Claude Code integration
 */

import WebSocket from 'ws';
import { ClaudeCodeServer } from '../../../src/servers/claude-code-server';
import { MCPHandler } from '../../../src/handlers/mcp-handler';
import { OmniSourceManager } from '../../../src/sources/source-manager';
import { MCPServerManager } from '../../../src/mcp/mcp-server-manager';
import { SourceConfigManager } from '../../../src/config/source-config-manager';

// Mock dependencies
jest.mock('../../../src/handlers/mcp-handler');
jest.mock('../../../src/sources/source-manager');
jest.mock('../../../src/mcp/mcp-server-manager');
jest.mock('../../../src/config/source-config-manager');
jest.mock('ws');
jest.mock('cors', () => jest.fn(() => jest.fn()));
jest.mock('express', () => {
  const mockApp = {
    use: jest.fn(),
    get: jest.fn(),
    listen: jest.fn()
  };
  const mockExpress = jest.fn(() => mockApp) as any;
  mockExpress.json = jest.fn(() => jest.fn());
  return mockExpress;
});

const MockMCPHandler = MCPHandler as jest.MockedClass<typeof MCPHandler>;
const MockOmniSourceManager = OmniSourceManager as jest.MockedClass<typeof OmniSourceManager>;
const MockMCPServerManager = MCPServerManager as jest.MockedClass<typeof MCPServerManager>;
const MockSourceConfigManager = SourceConfigManager as jest.MockedClass<typeof SourceConfigManager>;

describe('ClaudeCodeServer', () => {
  let server: ClaudeCodeServer;
  let mockMCPHandler: jest.Mocked<MCPHandler>;
  let mockSourceManager: jest.Mocked<OmniSourceManager>;
  let mockMCPServerManager: jest.Mocked<MCPServerManager>;
  let mockConfigManager: jest.Mocked<SourceConfigManager>;
  let mockWsServer: jest.Mocked<WebSocket.Server>;
  let mockWsClient: jest.Mocked<WebSocket>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock config manager
    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        mcp_servers: []
      })
    } as any;

    // Mock source manager
    mockSourceManager = {
      initializeSources: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Mock MCP server manager
    mockMCPServerManager = {
      initializeServers: jest.fn().mockResolvedValue(undefined),
      stopAllServers: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Mock MCP handler
    mockMCPHandler = {
      getSupportedMethods: jest.fn().mockReturnValue(['initialize', 'tools/list', 'tools/call']),
      handleMessage: jest.fn().mockResolvedValue({ jsonrpc: '2.0', result: 'test' })
    } as any;

    // Mock WebSocket client with writable readyState
    mockWsClient = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn()
    } as any;
    
    // Add writable readyState property
    Object.defineProperty(mockWsClient, 'readyState', {
      value: WebSocket.OPEN,
      writable: true,
      configurable: true
    });

    // Mock WebSocket server
    mockWsServer = {
      on: jest.fn(),
      clients: new Set([mockWsClient])
    } as any;

    // Mock constructors
    MockSourceConfigManager.mockImplementation(() => mockConfigManager);
    MockOmniSourceManager.mockImplementation(() => mockSourceManager);
    MockMCPServerManager.mockImplementation(() => mockMCPServerManager);
    MockMCPHandler.mockImplementation(() => mockMCPHandler);
    
    // Mock WebSocket.Server constructor
    (WebSocket.Server as jest.MockedClass<typeof WebSocket.Server>).mockImplementation(() => mockWsServer);

    // Configure express mock
    const express = jest.requireMock('express');
    const mockApp = {
      use: jest.fn(),
      get: jest.fn(),
      listen: jest.fn((port: number, callback?: () => void) => {
        // Call the callback to simulate server start
        if (callback) setTimeout(callback, 0);
        return { on: jest.fn() }; // Mock HTTP server
      })
    };
    express.mockReturnValue(mockApp);
  });

  describe('constructor', () => {
    it('should initialize server with default port', () => {
      server = new ClaudeCodeServer();
      
      expect(MockSourceConfigManager).toHaveBeenCalled();
      expect(MockOmniSourceManager).toHaveBeenCalled();
      expect(MockMCPServerManager).toHaveBeenCalled();
      expect(MockMCPHandler).toHaveBeenCalled();
    });

    it('should initialize server with custom port', () => {
      const customPort = 4000;
      server = new ClaudeCodeServer(customPort);
      
      expect(MockSourceConfigManager).toHaveBeenCalled();
    });
  });

  describe('WebSocket handling', () => {
    beforeEach(() => {
      server = new ClaudeCodeServer();
    });

    it('should handle WebSocket connection', () => {
      expect(mockWsServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
      
      // Simulate connection
      const connectionHandler = mockWsServer.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      if (connectionHandler) {
        connectionHandler.call(mockWsServer, mockWsClient);
      }

      expect(mockWsClient.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWsClient.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWsClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle WebSocket messages', async () => {
      const connectionHandler = mockWsServer.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      if (connectionHandler) {
        connectionHandler.call(mockWsServer, mockWsClient);
      }

      const messageHandler = mockWsClient.on.mock.calls.find(call => call[0] === 'message')?.[1];
      if (messageHandler) {
        const testMessage = { jsonrpc: '2.0', method: 'test' };
        await messageHandler.call(mockWsClient, Buffer.from(JSON.stringify(testMessage)));
        
        expect(mockMCPHandler.handleMessage).toHaveBeenCalledWith(testMessage);
        expect(mockWsClient.send).toHaveBeenCalled();
      }
    });

    it('should handle message parsing errors', async () => {
      const connectionHandler = mockWsServer.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      if (connectionHandler) {
        connectionHandler.call(mockWsServer, mockWsClient);
      }

      const messageHandler = mockWsClient.on.mock.calls.find(call => call[0] === 'message')?.[1];
      if (messageHandler) {
        await messageHandler.call(mockWsClient, Buffer.from('invalid json'));
        
        expect(mockWsClient.send).toHaveBeenCalledWith(
          expect.stringContaining('"error"')
        );
      }
    });

    it('should handle WebSocket close', () => {
      const connectionHandler = mockWsServer.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      if (connectionHandler) {
        connectionHandler.call(mockWsServer, mockWsClient);
      }

      const closeHandler = mockWsClient.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) {
        closeHandler.call(mockWsClient);
        // Should log disconnection (covered by console.log)
      }
    });

    it('should handle WebSocket errors', () => {
      const connectionHandler = mockWsServer.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      if (connectionHandler) {
        connectionHandler.call(mockWsServer, mockWsClient);
      }

      const errorHandler = mockWsClient.on.mock.calls.find(call => call[0] === 'error')?.[1];
      if (errorHandler) {
        const testError = new Error('Test error');
        errorHandler.call(mockWsClient, testError);
        // Should log error (covered by console.error)
      }
    });
  });

  describe('initialization', () => {
    it('should initialize with MCP servers configured', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        mcp_servers: [
          { name: 'test-server', command: 'test', args: [] }
        ]
      } as any);

      server = new ClaudeCodeServer();
      
      // Wait for async initialization with longer timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSourceManager.initializeSources).toHaveBeenCalled();
      expect(mockMCPServerManager.initializeServers).toHaveBeenCalled();
    });

    it('should initialize without MCP servers', async () => {
      mockConfigManager.getConfig.mockReturnValue({
        mcp_servers: []
      } as any);

      server = new ClaudeCodeServer();
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSourceManager.initializeSources).toHaveBeenCalled();
      expect(mockMCPServerManager.initializeServers).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSourceManager.initializeSources.mockRejectedValue(new Error('Init failed'));

      server = new ClaudeCodeServer();
      
      // Wait for async initialization with longer timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    beforeEach(() => {
      server = new ClaudeCodeServer();
    });

    it('should shutdown gracefully', async () => {
      await server.shutdown();

      expect(mockWsClient.close).toHaveBeenCalled();
      expect(mockMCPServerManager.stopAllServers).toHaveBeenCalled();
    });

    it('should close only open WebSocket connections', async () => {
      // Update the readyState property
      Object.defineProperty(mockWsClient, 'readyState', {
        value: WebSocket.CLOSED,
        writable: true,
        configurable: true
      });
      
      await server.shutdown();

      expect(mockWsClient.close).not.toHaveBeenCalled();
      expect(mockMCPServerManager.stopAllServers).toHaveBeenCalled();
    });
  });
});