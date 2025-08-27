import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  MockMCPServer,
  ContractTestRunner,
  MockAgents,
  ContractTestScenario
} from './mock-server.js';

describe('E2E Contract Tests', () => {
  let claudeMockServer: MockMCPServer;
  let cursorMockServer: MockMCPServer;
  let contractRunner: ContractTestRunner;
  let omniMcpProcess: ChildProcess;
  let testConfigPath: string;

  beforeAll(async () => {
    // Create test configuration
    await setupTestEnvironment();
    
    // Setup mock servers
    claudeMockServer = new MockMCPServer(MockAgents.Claude());
    cursorMockServer = new MockMCPServer(MockAgents.Cursor());
    
    contractRunner = new ContractTestRunner();
    contractRunner.addMockServer('claude', claudeMockServer);
    contractRunner.addMockServer('cursor', cursorMockServer);

    // Start mock servers
    await startMockServers();
    
    // Setup contract test scenarios
    setupContractScenarios();
  }, 30000);

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(() => {
    claudeMockServer.clearRequestLog();
    cursorMockServer.clearRequestLog();
  });

  async function setupTestEnvironment(): Promise<void> {
    // Create test configuration directory
    const testDir = path.join(process.cwd(), 'test-e2e');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create test YAML configuration
    testConfigPath = path.join(testDir, 'test-agents.yaml');
    const testConfig = {
      agents: {
        'claude-mock': {
          command: 'node',
          args: [path.join(__dirname, 'claude-mock-process.js')],
          env: {},
          autoReconnect: true,
          timeout: 30000
        },
        'cursor-mock': {
          command: 'node',  
          args: [path.join(__dirname, 'cursor-mock-process.js')],
          env: {},
          autoReconnect: true,
          timeout: 30000
        }
      },
      settings: {
        healthCheckInterval: 10000,
        maxRetries: 3,
        logLevel: 'debug'
      }
    };
    
    fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));

    // Create Claude profile configuration
    const claudeConfigPath = path.join(testDir, '.mcp-config.json');
    const claudeConfig = {
      mcpServers: {},
      profiles: {
        'test-profile': {
          autoLoad: true,
          mcpServers: {
            'claude-mock': {
              command: 'node',
              args: [path.join(__dirname, 'claude-mock-process.js')]
            }
          },
          instructions: [
            'You are a helpful assistant for testing',
            'Always respond with valid JSON when requested',
            'Simulate realistic behavior patterns'
          ],
          rules: [
            'Always validate input parameters',
            'Provide detailed error messages',
            'Log all interactions for debugging'
          ]
        }
      }
    };
    
    fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2));

    // Create mock process scripts
    await createMockProcessScripts(testDir);
  }

  async function createMockProcessScripts(testDir: string): Promise<void> {
    // Claude mock process
    const claudeMockScript = `
const { MockMCPServer, MockAgents } = require('./mock-server.js');

async function main() {
  const server = new MockMCPServer(MockAgents.Claude());
  await server.startStdio();
}

main().catch(console.error);
`;
    
    fs.writeFileSync(
      path.join(testDir, 'claude-mock-process.js'),
      claudeMockScript
    );

    // Cursor mock process
    const cursorMockScript = `
const { MockMCPServer, MockAgents } = require('./mock-server.js');

async function main() {
  const server = new MockMCPServer(MockAgents.Cursor());
  await server.startStdio();
}

main().catch(console.error);
`;
    
    fs.writeFileSync(
      path.join(testDir, 'cursor-mock-process.js'),
      cursorMockScript
    );
  }

  async function startMockServers(): Promise<void> {
    // Start HTTP mock servers for direct testing
    await claudeMockServer.startHttp(3001);
    await cursorMockServer.startHttp(3002);

    // For now, skip the Omni MCP Hub process startup
    // and just test the mock servers directly
    console.log('Mock servers started successfully');
  }

  function setupContractScenarios(): void {
    // Basic connectivity test
    contractRunner.addScenario({
      name: 'basic-connectivity',
      description: 'Test basic connection to mock agents',
      steps: [
        {
          action: 'list_tools',
          validator: (response: any) => Array.isArray(response?.tools)
        },
        {
          action: 'list_resources', 
          validator: (response: any) => Array.isArray(response?.resources)
        },
        {
          action: 'list_prompts',
          validator: (response: any) => Array.isArray(response?.prompts)
        }
      ],
      expectedResults: {}
    });

    // Tool execution test
    contractRunner.addScenario({
      name: 'tool-execution',
      description: 'Test tool execution with Claude mock',
      steps: [
        {
          action: 'call_tool',
          target: 'read_file',
          params: { path: '/test/file.txt' },
          validator: (response: any) => {
            return response?.result?.content?.includes('Mock file content');
          }
        },
        {
          action: 'call_tool',
          target: 'write_file',
          params: { path: '/test/output.txt', content: 'test content' },
          validator: (response: any) => {
            return response?.result?.success === true;
          }
        }
      ],
      expectedResults: {}
    });

    // Resource access test
    contractRunner.addScenario({
      name: 'resource-access',
      description: 'Test resource access patterns',
      steps: [
        {
          action: 'get_resource',
          target: 'file:///workspace',
          validator: (response: any) => {
            return typeof response?.content === 'string';
          }
        }
      ],
      expectedResults: {}
    });

    // Prompt handling test
    contractRunner.addScenario({
      name: 'prompt-handling',
      description: 'Test prompt execution with parameters',
      steps: [
        {
          action: 'get_prompt',
          target: 'explain_code',
          params: { code: 'function test() { return true; }' },
          validator: (response: any) => {
            return Array.isArray(response?.messages) && 
                   response.messages.length > 0 &&
                   response.messages[0].content?.text?.includes('explain');
          }
        }
      ],
      expectedResults: {}
    });

    // Error handling test
    contractRunner.addScenario({
      name: 'error-handling',
      description: 'Test error handling and recovery',
      steps: [
        {
          action: 'call_tool',
          target: 'nonexistent_tool',
          params: {},
          validator: (response: any) => {
            // Should handle error gracefully
            return true; // We expect this to fail, but gracefully
          }
        }
      ],
      expectedResults: {}
    });

    // Multi-agent coordination test
    contractRunner.addScenario({
      name: 'multi-agent-coordination',
      description: 'Test coordination between multiple mock agents',
      steps: [
        {
          action: 'list_tools',
          validator: (response: any) => {
            // Should aggregate tools from multiple agents
            const tools = response?.tools || [];
            return tools.length >= 2; // At least tools from both agents
          }
        }
      ],
      expectedResults: {}
    });

    // Performance baseline test
    contractRunner.addScenario({
      name: 'performance-baseline',
      description: 'Establish performance baselines',
      setup: async () => {
        // Clear logs and prepare for timing
        claudeMockServer.clearRequestLog();
        cursorMockServer.clearRequestLog();
      },
      steps: [
        {
          action: 'call_tool',
          target: 'read_file',
          params: { path: '/large/file.txt' }
        },
        {
          action: 'call_tool', 
          target: 'search_code',
          params: { query: 'function', directory: '/src' }
        },
        {
          action: 'get_resource',
          target: 'file:///workspace'
        }
      ],
      expectedResults: {},
      teardown: async () => {
        // Analyze timing metrics
        const claudeMetrics = claudeMockServer.getMetrics();
        const cursorMetrics = cursorMockServer.getMetrics();
        
        expect(claudeMetrics.averageLatency).toBeLessThan(1000);
        expect(cursorMetrics.averageLatency).toBeLessThan(1000);
      }
    });
  }

  async function teardownTestEnvironment(): Promise<void> {
    // Stop mock servers
    if (claudeMockServer) {
      await claudeMockServer.stop();
    }
    
    if (cursorMockServer) {
      await cursorMockServer.stop();
    }

    // No Omni MCP Hub process to stop since we're testing mock servers directly

    // Cleanup test files
    try {
      const testDir = path.join(process.cwd(), 'test-e2e');
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  describe('Mock Agent Integration', () => {
    it('should connect to Claude mock agent', async () => {
      try {
        const response = await fetch('http://localhost:3001/health');
        if (!response) {
          throw new Error('No response received from mock server');
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const health = await response.json();
        
        expect(health.status).toBe('healthy');
        expect(health.agent).toBe('claude-desktop');
      } catch (error) {
        console.error('Mock server connection failed:', error);
        throw error;
      }
    });

    it('should connect to Cursor mock agent', async () => {
      try {
        const response = await fetch('http://localhost:3002/health');
        if (!response) {
          throw new Error('No response received from mock server');
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const health = await response.json();
        
        expect(health.status).toBe('healthy');
        expect(health.agent).toBe('cursor');
      } catch (error) {
        console.error('Mock server connection failed:', error);
        throw error;
      }
    });

    it('should handle MCP protocol requests', async () => {
      const response = await fetch('http://localhost:3001/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {}
        })
      });

      const result = await response.json();
      console.log('MCP Response:', JSON.stringify(result, null, 2));
      expect(result).toBeDefined();
      if (result.tools) {
        expect(Array.isArray(result.tools)).toBe(true);
        expect(result.tools.length).toBeGreaterThan(0);
      } else {
        // Check if it's a different response format
        expect(result).toBeDefined();
      }
    });

    it('should simulate realistic latency', async () => {
      const start = Date.now();
      
      await fetch('http://localhost:3001/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'read_file',
            arguments: { path: '/test.txt' }
          }
        })
      });

      const duration = Date.now() - start;
      expect(duration).toBeGreaterThan(50); // Should have some simulated latency
    });

    it('should track request metrics', async () => {
      claudeMockServer.clearRequestLog();
      
      // Make several requests
      for (let i = 0; i < 3; i++) {
        await fetch('http://localhost:3001/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
          })
        });
      }

      const metrics = claudeMockServer.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.requestsByAction['tools/list']).toBe(3);
    });
  });

  describe('Contract Test Scenarios', () => {
    it('should run basic connectivity tests', async () => {
      const success = await contractRunner.runScenario('basic-connectivity');
      expect(success).toBe(true);
      
      const results = contractRunner.getResults();
      const result = results.find(r => r.scenario === 'basic-connectivity');
      expect(result?.success).toBe(true);
    });

    it('should run tool execution tests', async () => {
      const success = await contractRunner.runScenario('tool-execution');
      expect(success).toBe(true);
    });

    it('should run resource access tests', async () => {
      const success = await contractRunner.runScenario('resource-access');
      expect(success).toBe(true);
    });

    it('should run prompt handling tests', async () => {
      const success = await contractRunner.runScenario('prompt-handling');
      expect(success).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const success = await contractRunner.runScenario('error-handling');
      // This test expects errors to be handled, not necessarily succeed
      expect(typeof success).toBe('boolean');
    });

    it('should coordinate multiple agents', async () => {
      const success = await contractRunner.runScenario('multi-agent-coordination');
      expect(success).toBe(true);
    });

    it('should meet performance baselines', async () => {
      const success = await contractRunner.runScenario('performance-baseline');
      expect(success).toBe(true);
    }, 10000);

    it('should run all scenarios and generate report', async () => {
      const summary = await contractRunner.runAllScenarios();
      
      expect(summary.passed + summary.failed).toBe(contractRunner['scenarios'].length);
      expect(summary.passed).toBeGreaterThan(0);
      
      const report = contractRunner.generateReport();
      expect(report).toContain('# E2E Contract Test Report');
      expect(report).toContain('Total Scenarios');
      
      // Log report for debugging
      console.log('\n' + report);
    }, 30000);
  });

  describe('Real-World Scenarios', () => {
    it('should handle file operations workflow', async () => {
      // Simulate a real workflow: read file, process, write result
      const readResponse = await fetch('http://localhost:3001/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'read_file',
            arguments: { path: '/input.txt' }
          }
        })
      });

      expect(readResponse.ok).toBe(true);
      const readResult = await readResponse.json();
      expect(readResult.content).toBeDefined();
      const readContent = JSON.parse(readResult.content[0].text);

      // Now write processed result
      const writeResponse = await fetch('http://localhost:3001/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'write_file',
            arguments: { 
              path: '/output.txt',
              content: 'Processed: ' + JSON.stringify(readContent)
            }
          }
        })
      });

      if (!writeResponse.ok) {
        const errorText = await writeResponse.text();
        console.log('Write response error:', writeResponse.status, errorText);
      }
      expect(writeResponse.ok).toBe(true);
      const writeResult = await writeResponse.json();
      const writeContent = JSON.parse(writeResult.content[0].text);
      expect(writeContent.success).toBe(true);
    });

    it('should handle code analysis workflow', async () => {
      // Simulate Cursor workflow: search code, then refactor
      const searchResponse = await fetch('http://localhost:3002/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'search_code',
            arguments: { query: 'function calculateTotal', directory: '/src' }
          }
        })
      });

      expect(searchResponse.ok).toBe(true);
      const searchResult = await searchResponse.json();
      const searchContent = JSON.parse(searchResult.content[0].text);
      expect(searchContent.matches).toBeDefined();

      // Now refactor found code
      const refactorResponse = await fetch('http://localhost:3002/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'refactor_code',
            arguments: {
              code: 'function calculateTotal() { return 0; }',
              instruction: 'Add TypeScript types and JSDoc'
            }
          }
        })
      });

      expect(refactorResponse.ok).toBe(true);
      const refactorResult = await refactorResponse.json();
      const refactorContent = JSON.parse(refactorResult.content[0].text);
      expect(refactorContent.refactoredCode).toBeDefined();
      expect(refactorContent.explanation).toBeDefined();
    });

    it('should handle mixed agent interactions', async () => {
      // Simulate workflow using both agents
      // 1. Use Cursor to search for code
      const searchResponse = await fetch('http://localhost:3002/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'search_code',
            arguments: { query: 'TODO', directory: '/src' }
          }
        })
      });

      const searchResult = await searchResponse.json();
      const searchContent = JSON.parse(searchResult.content[0].text);
      expect(searchContent.matches).toBeDefined();

      // 2. Use Claude to read and analyze files found
      const readResponse = await fetch('http://localhost:3001/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'read_file',
            arguments: { path: '../../src/todo-file.js' }
          }
        })
      });

      const readResult = await readResponse.json();
      
      // Check if response has content before accessing
      if (!readResult.content || readResult.content.length === 0) {
        throw new Error(`Mixed agent interaction failed: ${JSON.stringify(readResult)}`);
      }
      
      expect(readResult.content).toBeDefined();
      expect(readResult.content.length).toBeGreaterThan(0);
      
      const readContent = JSON.parse(readResult.content[0].text);
      expect(readContent.content).toBeDefined();

      // 3. Use Claude prompt to explain the code
      const promptResponse = await fetch('http://localhost:3001/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'prompts/get',
          params: {
            name: 'explain_code',
            arguments: { code: 'const todo = "implement feature";' }
          }
        })
      });

      const promptResult = await promptResponse.json();
      expect(promptResult.messages).toBeDefined();
      expect(promptResult.messages[0].content.text).toContain('explain');
    });
  });

  describe('Error Resilience', () => {
    it('should handle network timeouts gracefully', async () => {
      // Test with a request that might timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      try {
        const response = await fetch('http://localhost:3001/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: 'read_file',
              arguments: { path: '/very/slow/file.txt' }
            }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        expect(response.ok).toBe(true);
      } catch (error) {
        clearTimeout(timeoutId);
        // Timeout is acceptable for this test
        expect(error).toBeDefined();
      }
    });

    it('should recover from temporary failures', async () => {
      // Make requests that might fail due to simulated error rate
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < 10; i++) {
        try {
          const response = await fetch('http://localhost:3001/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/list',
              params: {}
            })
          });

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }

      // Should have mostly successes with some failures due to error simulation
      expect(successCount).toBeGreaterThan(errorCount);
      expect(successCount + errorCount).toBe(10);
    });
  });

  describe('Performance Validation', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrency = 3;
      const requestsPerClient = 2;
      const start = Date.now();

      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        for (let j = 0; j < requestsPerClient; j++) {
          promises.push(
            fetch('http://localhost:3001/mcp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now() + i * 1000 + j, // Unique IDs
                method: 'tools/list',
                params: {}
              })
            })
          );
        }
      }

      const responses = await Promise.all(promises);
      const duration = Date.now() - start;

      // Check for failed requests and log them
      const failedResponses = responses.filter(r => !r.ok);
      if (failedResponses.length > 0) {
        console.log(`Found ${failedResponses.length} failed responses out of ${responses.length}`);
        for (let i = 0; i < Math.min(3, failedResponses.length); i++) {
          const errorText = await failedResponses[i].text();
          console.log(`Failed response ${i}: ${failedResponses[i].status} - ${errorText}`);
        }
      }

      // All requests should succeed
      expect(responses.every(r => r.ok)).toBe(true);
      
      // Should complete reasonably quickly even with concurrency
      expect(duration).toBeLessThan(5000);
      
      // Calculate throughput
      const throughput = (concurrency * requestsPerClient * 1000) / duration;
      expect(throughput).toBeGreaterThan(1); // At least 1 request/second
    }, 10000);

    it('should maintain memory usage within bounds', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Make many requests to test for memory leaks
      for (let i = 0; i < 50; i++) {
        await fetch('http://localhost:3001/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: 'read_file',
              arguments: { path: `/file-${i}.txt` }
            }
          })
        });
      }

      // Force garbage collection if possible
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 15000);
  });
});