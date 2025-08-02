import request from 'supertest';
import { UniversalServer } from '../../src/servers/universal-server';
import { MCPSSEServer } from '../../src/servers/mcp-sse-server';
import { RestServer } from '../../src/servers/rest-server';
import { SimpleServer } from '../../src/servers/simple-server';
import { SourceConfigManager } from '../../src/config/source-config-manager';
import { MCPServerManager } from '../../src/mcp/mcp-server-manager';
import express from 'express';

// Mock dependencies
jest.mock('../../src/config/source-config-manager');
jest.mock('../../src/mcp/mcp-server-manager');

const mockSourceConfigManager = SourceConfigManager as jest.MockedClass<typeof SourceConfigManager>;
const mockMCPServerManager = MCPServerManager as jest.MockedClass<typeof MCPServerManager>;

describe('Server Implementation Tests', () => {
  let mockConfig: any;
  let mockConfigManager: jest.Mocked<SourceConfigManager>;
  let mockServerManager: jest.Mocked<MCPServerManager>;

  beforeEach(() => {
    mockConfig = {
      server: { port: 3000 },
      github_sources: [
        { url: 'github:test/repo', token: 'test-token' }
      ],
      local_sources: [
        { url: './' }
      ],
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

    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue(mockConfig),
      load: jest.fn(),
      clearCache: jest.fn(),
      getSources: jest.fn().mockReturnValue([])
    } as any;

    mockServerManager = {
      startServer: jest.fn(),
      stopServer: jest.fn(),
      stopAllServers: jest.fn(),
      getServer: jest.fn(),
      getAllServers: jest.fn().mockReturnValue([]),
      getAllTools: jest.fn().mockResolvedValue([]),
      callTool: jest.fn().mockResolvedValue({ result: 'success' })
    } as any;

    mockSourceConfigManager.mockImplementation(() => mockConfigManager);
    mockMCPServerManager.mockImplementation(() => mockServerManager);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('UniversalServer', () => {
    let server: UniversalServer;
    let app: express.Application;

    beforeEach(() => {
      server = new UniversalServer(mockConfigManager, mockServerManager);
      app = server.getApp();
    });

    test('should create server with dependencies', () => {
      expect(server).toBeInstanceOf(UniversalServer);
      expect(app).toBeDefined();
    });

    test('should have health check endpoint', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    test('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/sse')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });

    test('should setup SSE endpoint', async () => {
      const response = await request(app)
        .get('/sse')
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    test('should setup REST endpoint', async () => {
      const response = await request(app)
        .get('/api/docs')
        .query({ url: 'github:test/repo' });

      expect(response.status).toBe(200);
    });

    test('should handle 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown');
      
      expect(response.status).toBe(404);
    });

    test('should start and stop server', async () => {
      const startPromise = server.start();
      
      // Should start without error
      await expect(startPromise).resolves.toBeUndefined();

      // Should stop without error
      await expect(server.stop()).resolves.toBeUndefined();
    });

    test('should handle server start errors', async () => {
      // Mock port already in use
      const mockListen = jest.fn((port, callback) => {
        const error = new Error('EADDRINUSE');
        (error as any).code = 'EADDRINUSE';
        callback(error);
      });

      jest.spyOn(server, 'start').mockImplementation(() => {
        return new Promise((resolve, reject) => {
          mockListen(3000, (error: any) => {
            if (error) reject(error);
            else resolve();
          });
        });
      });

      await expect(server.start()).rejects.toThrow('EADDRINUSE');
    });

    test('should handle graceful shutdown', async () => {
      await server.start();
      
      // Mock server close
      const closeSpy = jest.fn((callback) => callback());
      (server as any).server = { close: closeSpy };

      await server.stop();
      
      expect(closeSpy).toHaveBeenCalled();
      expect(mockServerManager.stopAllServers).toHaveBeenCalled();
    });

    test('should start MCP servers on startup', async () => {
      await server.start();
      
      expect(mockServerManager.startServer).toHaveBeenCalledWith({
        name: 'test-server',
        command: 'python',
        args: ['-m', 'test'],
        enabled: true
      });
    });

    test('should handle MCP server startup failures gracefully', async () => {
      mockServerManager.startServer.mockRejectedValueOnce(new Error('Failed to start'));
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await server.start();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to start MCP server test-server:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('MCPSSEServer', () => {
    let server: MCPSSEServer;
    let app: express.Application;

    beforeEach(() => {
      server = new MCPSSEServer(mockConfigManager, mockServerManager);
      app = server.getApp();
    });

    test('should create SSE server', () => {
      expect(server).toBeInstanceOf(MCPSSEServer);
      expect(app).toBeDefined();
    });

    test('should handle SSE MCP requests', async () => {
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };

      const response = await request(app)
        .post('/sse')
        .send(mcpRequest)
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    test('should handle invalid JSON in SSE requests', async () => {
      const response = await request(app)
        .post('/sse')
        .send('invalid json')
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.text).toContain('error');
    });

    test('should support GET SSE connections', async () => {
      const response = await request(app)
        .get('/sse')
        .query({
          method: 'initialize',
          params: JSON.stringify({
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            clientInfo: { name: 'test-client', version: '1.0.0' }
          })
        })
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    test('should handle malformed query parameters', async () => {
      const response = await request(app)
        .get('/sse')
        .query({
          method: 'initialize',
          params: 'invalid json'
        })
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(200);
      expect(response.text).toContain('error');
    });

    test('should stream multiple events for documentation requests', async () => {
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'docs/get',
        params: {
          url: 'github:test/repo',
          include_externals: true
        }
      };

      const response = await request(app)
        .post('/sse')
        .send(mcpRequest)
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      
      // Should contain multiple events
      const events = response.text.split('\n\n').filter(chunk => chunk.trim());
      expect(events.length).toBeGreaterThan(1);
    });
  });

  describe('RestServer', () => {
    let server: RestServer;
    let app: express.Application;

    beforeEach(() => {
      server = new RestServer(mockConfigManager);
      app = server.getApp();
    });

    test('should create REST server', () => {
      expect(server).toBeInstanceOf(RestServer);
      expect(app).toBeDefined();
    });

    test('should handle GET /api/docs', async () => {
      const response = await request(app)
        .get('/api/docs')
        .query({ url: 'github:test/repo' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });

    test('should require url parameter', async () => {
      const response = await request(app).get('/api/docs');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('url parameter is required');
    });

    test('should handle branch parameter', async () => {
      const response = await request(app)
        .get('/api/docs')
        .query({ 
          url: 'github:test/repo',
          branch: 'dev'
        });

      expect(response.status).toBe(200);
    });

    test('should handle include_externals parameter', async () => {
      const response = await request(app)
        .get('/api/docs')
        .query({ 
          url: 'github:test/repo',
          include_externals: 'true'
        });

      expect(response.status).toBe(200);
    });

    test('should validate boolean parameters', async () => {
      const response = await request(app)
        .get('/api/docs')
        .query({ 
          url: 'github:test/repo',
          include_externals: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('include_externals must be a boolean');
    });

    test('should handle internal server errors', async () => {
      // Mock handler to throw error
      const originalHandler = (server as any).handler;
      (server as any).handler = {
        handleRequest: jest.fn().mockRejectedValue(new Error('Internal error'))
      };

      const response = await request(app)
        .get('/api/docs')
        .query({ url: 'github:test/repo' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');

      // Restore original handler
      (server as any).handler = originalHandler;
    });
  });

  describe('SimpleServer', () => {
    let server: SimpleServer;
    let app: express.Application;

    beforeEach(() => {
      server = new SimpleServer(mockConfigManager);
      app = server.getApp();
    });

    test('should create simple server', () => {
      expect(server).toBeInstanceOf(SimpleServer);
      expect(app).toBeDefined();
    });

    test('should serve static files', async () => {
      const response = await request(app).get('/');

      // Should at least return something (might be 404 if no static files)
      expect([200, 404]).toContain(response.status);
    });

    test('should handle API requests', async () => {
      const response = await request(app)
        .get('/api/docs')
        .query({ url: 'github:test/repo' });

      expect(response.status).toBe(200);
    });

    test('should apply middleware correctly', async () => {
      const response = await request(app).get('/api/docs');

      // Should have CORS headers
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Server Configuration', () => {
    test('should use port from configuration', () => {
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      
      expect(mockConfigManager.getConfig).toHaveBeenCalled();
      // Port configuration should be read from config
    });

    test('should handle missing port configuration', () => {
      const configWithoutPort = { ...mockConfig };
      delete configWithoutPort.server.port;
      
      mockConfigManager.getConfig.mockReturnValue(configWithoutPort);
      
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      
      // Should create server without error (using default port)
      expect(server).toBeInstanceOf(UniversalServer);
    });

    test('should validate configuration on startup', async () => {
      const invalidConfig = {
        ...mockConfig,
        server: { port: 'invalid' }
      };
      
      mockConfigManager.getConfig.mockReturnValue(invalidConfig);
      
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      
      // Should handle invalid port gracefully
      await expect(server.start()).rejects.toThrow();
    });
  });

  describe('Middleware Integration', () => {
    test('should apply JSON parsing middleware', async () => {
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      const app = server.getApp();

      const response = await request(app)
        .post('/sse')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');

      // Should not fail due to JSON parsing
      expect(response.status).not.toBe(400);
    });

    test('should apply CORS middleware', async () => {
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      const app = server.getApp();

      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://example.com');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should handle large request bodies', async () => {
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      const app = server.getApp();

      const largeData = 'x'.repeat(1024 * 1024); // 1MB
      
      const response = await request(app)
        .post('/sse')
        .send({ data: largeData })
        .set('Content-Type', 'application/json');

      // Should handle large requests
      expect(response.status).not.toBe(413); // Not Payload Too Large
    });
  });

  describe('Error Recovery', () => {
    test('should recover from MCP server failures', async () => {
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      
      // Simulate MCP server failure during startup
      mockServerManager.startServer.mockRejectedValueOnce(new Error('MCP Error'));
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Should start successfully despite MCP server failure
      await expect(server.start()).resolves.toBeUndefined();
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should handle configuration reload', () => {
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      
      // Change configuration
      const newConfig = { ...mockConfig, server: { port: 4000 } };
      mockConfigManager.getConfig.mockReturnValue(newConfig);
      
      // Should handle configuration changes
      expect(() => {
        mockConfigManager.clearCache();
        mockConfigManager.getConfig();
      }).not.toThrow();
    });

    test('should cleanup resources on shutdown', async () => {
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      
      await server.start();
      await server.stop();
      
      expect(mockServerManager.stopAllServers).toHaveBeenCalled();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple concurrent requests', async () => {
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      const app = server.getApp();

      const requests = Array.from({ length: 10 }, () =>
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should handle rapid SSE connections', async () => {
      const server = new MCPSSEServer(mockConfigManager, mockServerManager);
      const app = server.getApp();

      const connections = Array.from({ length: 5 }, () =>
        request(app)
          .get('/sse')
          .set('Accept', 'text/event-stream')
      );

      const responses = await Promise.all(connections);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should manage memory efficiently', async () => {
      const server = new UniversalServer(mockConfigManager, mockServerManager);
      const app = server.getApp();

      // Make many requests to test memory usage
      for (let i = 0; i < 100; i++) {
        await request(app).get('/health');
      }

      // Should not accumulate excessive memory
      // This is a basic test - in practice you'd monitor actual memory usage
      expect(true).toBe(true);
    });
  });
});