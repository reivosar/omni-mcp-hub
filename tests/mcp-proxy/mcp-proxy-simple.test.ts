import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPProxyClient } from '../../src/mcp-proxy/client.js';
import { MCPProxyManager } from '../../src/mcp-proxy/manager.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    stdout: { on: vi.fn(), pipe: vi.fn() },
    stderr: { on: vi.fn(), pipe: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    pid: 12345
  }),
  exec: vi.fn().mockImplementation((command, callback) => {
    // Mock successful execution
    if (callback) {
      callback(null, 'mocked output', '');
    }
  })
}));

// Mock SDK modules
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    close: vi.fn(),
    send: vi.fn()
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    request: vi.fn()
  }))
}));

describe('MCP Proxy Simple Tests', () => {
  describe('MCPProxyClient', () => {
    it('should create instance', () => {
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test.js']
      };
      
      const client = new MCPProxyClient(config);
      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('MCPProxyManager', () => {
    it('should create instance', () => {
      const yamlConfig = {
        getConfig: vi.fn().mockReturnValue({
          externalServers: {
            enabled: true,
            servers: [],
            autoConnect: true,
            retry: { maxAttempts: 3, delayMs: 1000 }
          }
        })
      } as any;
      
      const manager = new MCPProxyManager(yamlConfig);
      expect(manager).toBeDefined();
    });

    it('should handle server addition', () => {
      const yamlConfig = {
        getConfig: vi.fn().mockReturnValue({
          externalServers: {
            enabled: true,
            servers: [],
            autoConnect: true,
            retry: { maxAttempts: 3, delayMs: 1000 }
          }
        })
      } as any;
      
      const manager = new MCPProxyManager(yamlConfig);
      const config = {
        name: 'test-server',
        command: 'node',
        args: ['test.js']
      };
      
      manager.addServer(config);
      expect(manager).toBeDefined();
    });
  });
});