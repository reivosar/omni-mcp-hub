import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import fetch from 'node-fetch';
import nock from 'nock';

describe('End-to-End Tests', () => {
  let serverProcess: any;
  const serverPort = 3010;

  beforeAll(async () => {
    // Allow real network connections to localhost for E2E tests
    nock.enableNetConnect('localhost');
    
    // Start the server process with test config
    serverProcess = spawn('npx', ['ts-node', 'src/servers/server.ts'], {
      env: { 
        ...process.env, 
        CONFIG_PATH: './tests/mcp-sources.test.yaml',
        GITHUB_TOKEN_TEST: 'test-token',
        GITHUB_WEBHOOK_SECRET_TEST: 'test-webhook-secret'
      },
      stdio: 'pipe'
    });

    // Capture server output for debugging if needed
    // serverProcess.stdout.on('data', (data: any) => {
    //   console.log('Server stdout:', data.toString());
    // });
    
    // serverProcess.stderr.on('data', (data: any) => {
    //   console.error('Server stderr:', data.toString());
    // });

    // Wait for server to start
    await setTimeout(3000);

    // Check if server is running
    let serverReady = false;
    for (let i = 0; i < 20; i++) {
      try {
        const response = await fetch(`http://localhost:${serverPort}/healthz`);
        if (response.status === 200) {
          serverReady = true;
          break;
        }
      } catch (e) {
        // Server not ready yet
      }
      await setTimeout(500);
    }

    if (!serverReady) {
      throw new Error('Server failed to start within timeout');
    }
  }, 30000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await setTimeout(1000);
      
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }
    
    // Restore nock settings
    nock.cleanAll();
    nock.disableNetConnect();
  });

  describe('Server Health', () => {
    test('should respond to health checks', async () => {
      const response = await fetch(`http://localhost:${serverPort}/healthz`);
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body).toEqual({ status: 'ok' });
    });
  });

  describe('MCP Protocol', () => {
    test('should handle GET requests with server info', async () => {
      const response = await fetch(`http://localhost:${serverPort}/sse`, {
        headers: {
          'Accept': 'text/event-stream'
        }
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const text = await response.text();
      expect(text).toContain('event: message');
      expect(text).toContain('"method":"server_info"');
    });

    test('should handle JSON-RPC documentation requests', async () => {
      const request_body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'fetch_nonexistent_repo_documentation',
        params: {
          owner: 'nonexistent',
          repo: 'repo',
          branch: 'main',
          include_externals: false
        }
      };

      const response = await fetch(`http://localhost:${serverPort}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(request_body)
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const text = await response.text();
      
      // Should contain SSE events
      expect(text).toContain('event: message');
      
      // Should contain either error or completion
      expect(text).toMatch(/"id":1/);
    }, 15000);

    test('should handle malformed JSON-RPC requests', async () => {
      const malformed_request = {
        jsonrpc: '1.0', // Wrong version
        id: 1,
        method: 'test'
      };

      const response = await fetch(`http://localhost:${serverPort}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(malformed_request)
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      
      expect(text).toContain('event: message');
      expect(text).toContain('"error"');
      expect(text).toContain('-32600'); // Invalid Request error code
    });
  });

  describe('CORS Support', () => {
    test('should handle CORS preflight requests', async () => {
      // Use an allowed origin from the default CORS configuration
      const response = await fetch(`http://localhost:${serverPort}/sse`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });

      expect(response.status).toBe(204);
      // CORS origin should now be the specific origin, not wildcard for security
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).toBe('http://localhost:3000'); // Should match the request origin
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    });

    test('should include CORS headers in actual requests', async () => {
      const response = await fetch(`http://localhost:${serverPort}/sse`, {
        headers: {
          'Origin': 'https://example.com'
        }
      });

      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for unknown endpoints', async () => {
      const response = await fetch(`http://localhost:${serverPort}/unknown`);
      expect(response.status).toBe(404);
    });

    test('should handle invalid JSON in POST body', async () => {
      const response = await fetch(`http://localhost:${serverPort}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json{'
      });

      expect(response.status).toBe(200); // SSE always returns 200
      const text = await response.text();
      expect(text).toContain('error');
    });
  });

  describe('Performance', () => {
    test('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => 
        fetch(`http://localhost:${serverPort}/healthz`)
      );

      const responses = await Promise.all(requests);
      
      expect(responses).toHaveLength(5);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should respond within reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await fetch(`http://localhost:${serverPort}/healthz`);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
      expect(response.status).toBe(200);
    });
  });
});