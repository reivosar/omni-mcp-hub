/**
 * Mock Server for E2E Testing of External MCP Agents
 * Simulates Claude, Cursor, and other external agents for contract testing
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport, StdioClientTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'events';
import * as net from 'net';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

export interface MockAgentConfig {
  name: string;
  version: string;
  capabilities: {
    resources?: Record<string, unknown>;
    tools?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
  };
  tools: MockTool[];
  resources: MockResource[];
  prompts: MockPrompt[];
  responses: Record<string, unknown>;
  latency?: number;
  errorRate?: number;
}

export interface MockTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface MockResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<{ contents: { type: string; data: unknown }[] }>;
}

export interface MockPrompt {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  handler: (args: Record<string, unknown>) => Promise<{ messages: Array<{ role: string; content: { type: string; text: string } }> }>;
}

export interface ContractTestScenario {
  name: string;
  description: string;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  steps: ContractTestStep[];
  expectedResults: Record<string, unknown>;
}

export interface ContractTestStep {
  action: 'call_tool' | 'get_resource' | 'get_prompt' | 'list_tools' | 'list_resources' | 'list_prompts';
  target?: string;
  params?: Record<string, unknown>;
  expectedResponse?: Record<string, unknown>;
  validator?: (response: unknown) => boolean;
}

export class MockMCPServer extends EventEmitter {
  private server: Server;
  private config: MockAgentConfig;
  private httpServer?: http.Server;
  private tcpServer?: net.Server;
  private activeConnections: Set<any> = new Set();
  private requestLog: Array<{ timestamp: Date; action: string; params?: unknown; response?: unknown }> = [];

  constructor(config: MockAgentConfig) {
    super();
    this.config = config;
    
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: config.tools.length > 0 ? {} : undefined,
          resources: config.resources.length > 0 ? {} : undefined,
          prompts: config.prompts.length > 0 ? {} : undefined,
          ...config.capabilities
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Setup tool handlers if tools are available
    if (this.config.tools.length > 0) {
      this.server.setRequestHandler(ListToolsRequestSchema, async () => {
        this.logRequest('tools/list');
        
        await this.simulateLatency();
        
        if (this.shouldSimulateError()) {
          throw new Error('Simulated tool list error');
        }

        const tools = this.config.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }));

        const response = { tools };
        this.logResponse('tools/list', response);
        return response;
      });

      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params as { name: string; arguments: Record<string, unknown> };
        
        this.logRequest('tools/call', { name, arguments: args });
        
        await this.simulateLatency();
        
        if (this.shouldSimulateError()) {
          throw new Error(`Simulated error calling tool ${name}`);
        }

        const tool = this.config.tools.find(t => t.name === name);
        if (!tool) {
          throw new Error(`Tool ${name} not found`);
        }

        try {
          const result = await tool.handler(args);
          const response = {
            content: [{ type: 'text', text: JSON.stringify(result) }]
          };
          
          this.logResponse('tools/call', response);
          return response;
        } catch (error) {
          const errorResponse = {
            isError: true,
            content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }]
          };
          
          this.logResponse('tools/call', errorResponse);
          throw error;
        }
      });
    }

    // Setup resource handlers if resources are available
    if (this.config.resources.length > 0) {
      this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
        this.logRequest('resources/list');
        
        await this.simulateLatency();
        
        if (this.shouldSimulateError()) {
          throw new Error('Simulated resource list error');
        }

        const resources = this.config.resources.map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType
        }));

        const response = { resources };
        this.logResponse('resources/list', response);
        return response;
      });

      this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params as { uri: string };
        
        this.logRequest('resources/read', { uri });
        
        await this.simulateLatency();
        
        if (this.shouldSimulateError()) {
          throw new Error(`Simulated error reading resource ${uri}`);
        }

        const resource = this.config.resources.find(r => r.uri === uri);
        if (!resource) {
          throw new Error(`Resource ${uri} not found`);
        }

        const contents = await resource.handler();
        this.logResponse('resources/read', contents);
        return contents;
      });
    }

    // Setup prompt handlers only if prompts are available
    if (this.config.prompts.length > 0) {
      this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
        this.logRequest('prompts/list');
        
        await this.simulateLatency();
        
        if (this.shouldSimulateError()) {
          throw new Error('Simulated prompt list error');
        }

        const prompts = this.config.prompts.map(prompt => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments
        }));

        const response = { prompts };
        this.logResponse('prompts/list', response);
        return response;
      });

      this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const { name, arguments: args } = request.params as { name: string; arguments?: Record<string, unknown> };
        
        this.logRequest('prompts/get', { name, arguments: args });
        
        await this.simulateLatency();
        
        if (this.shouldSimulateError()) {
          throw new Error(`Simulated error getting prompt ${name}`);
        }

        const prompt = this.config.prompts.find(p => p.name === name);
        if (!prompt) {
          throw new Error(`Prompt ${name} not found`);
        }

        const result = await prompt.handler(args || {});
        this.logResponse('prompts/get', result);
        return result;
      });
    }
  }

  private logRequest(action: string, params?: unknown): void {
    this.requestLog.push({
      timestamp: new Date(),
      action,
      params
    });
  }

  private logResponse(action: string, response: unknown): void {
    const lastEntry = this.requestLog[this.requestLog.length - 1];
    if (lastEntry && lastEntry.action === action) {
      lastEntry.response = response;
    }
  }

  private async simulateLatency(): Promise<void> {
    if (this.config.latency && this.config.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.latency));
    }
  }

  private shouldSimulateError(): boolean {
    return this.config.errorRate ? Math.random() < this.config.errorRate : false;
  }

  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.emit('started', { type: 'stdio' });
  }

  async startHttp(port: number = 3001): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(async (req, res) => {
        try {
          if (req.method === 'POST' && req.url === '/mcp') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });

            req.on('end', async () => {
              try {
                const request = JSON.parse(body);
                // Simulate MCP protocol over HTTP
                const response = await this.handleMCPRequest(request);
                
                res.writeHead(200, {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type'
                });
                res.end(JSON.stringify(response));
              } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ 
                  error: error instanceof Error ? error.message : 'Unknown error' 
                }));
              }
            });
          } else if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'healthy', agent: this.config.name }));
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      this.httpServer.listen(port, () => {
        this.emit('started', { type: 'http', port });
        resolve();
      });

      this.httpServer.on('error', reject);
    });
  }

  private async handleMCPRequest(request: any): Promise<any> {
    // This is a simplified MCP protocol implementation for HTTP testing
    const { method, params } = request;
    
    // Log the HTTP request
    this.logRequest(method, params);
    
    // Simulate latency for HTTP requests too
    await this.simulateLatency();
    
    // Simulate error if configured
    if (this.shouldSimulateError()) {
      throw new Error(`Simulated error for method ${method}`);
    }
    
    // Handle methods directly without MCP schema validation
    let response: any;
    switch (method) {
      case 'tools/list':
        response = {
          tools: this.config.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        };
        break;
      case 'tools/call':
        {
          const { name, arguments: args } = params as { name: string; arguments: Record<string, unknown> };
          const tool = this.config.tools.find(t => t.name === name);
          if (!tool) {
            throw new Error(`Tool ${name} not found`);
          }
          const result = await tool.handler(args);
          response = {
            content: [{ type: 'text', text: JSON.stringify(result) }]
          };
        }
        break;
      case 'resources/list':
        response = {
          resources: this.config.resources.map(resource => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType
          }))
        };
        break;
      case 'resources/read':
        {
          const { uri } = params as { uri: string };
          const resource = this.config.resources.find(r => r.uri === uri);
          if (!resource) {
            throw new Error(`Resource ${uri} not found`);
          }
          response = await resource.handler();
        }
        break;
      case 'prompts/list':
        response = {
          prompts: this.config.prompts.map(prompt => ({
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments
          }))
        };
        break;
      case 'prompts/get':
        {
          const { name, arguments: args } = params as { name: string; arguments?: Record<string, unknown> };
          const prompt = this.config.prompts.find(p => p.name === name);
          if (!prompt) {
            throw new Error(`Prompt ${name} not found`);
          }
          response = await prompt.handler(args || {});
        }
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    
    // Log the response
    this.logResponse(method, response);
    return response;
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }

    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => resolve());
      });
    }

    this.activeConnections.clear();
    this.emit('stopped');
  }

  getRequestLog(): Array<{ timestamp: Date; action: string; params?: unknown; response?: unknown }> {
    return [...this.requestLog];
  }

  clearRequestLog(): void {
    this.requestLog = [];
  }

  getMetrics(): {
    totalRequests: number;
    requestsByAction: Record<string, number>;
    errorCount: number;
    averageLatency: number;
  } {
    const requestsByAction: Record<string, number> = {};
    let errorCount = 0;
    let totalLatency = 0;

    for (const entry of this.requestLog) {
      requestsByAction[entry.action] = (requestsByAction[entry.action] || 0) + 1;
      if (entry.response && typeof entry.response === 'object' && 'isError' in entry.response) {
        errorCount++;
      }
    }

    return {
      totalRequests: this.requestLog.length,
      requestsByAction,
      errorCount,
      averageLatency: this.requestLog.length > 0 ? totalLatency / this.requestLog.length : 0
    };
  }
}

export class ContractTestRunner {
  private scenarios: ContractTestScenario[] = [];
  private mockServers: Map<string, MockMCPServer> = new Map();
  private results: Array<{
    scenario: string;
    success: boolean;
    error?: string;
    steps: Array<{ step: string; success: boolean; error?: string }>;
  }> = [];

  addScenario(scenario: ContractTestScenario): void {
    this.scenarios.push(scenario);
  }

  addMockServer(name: string, server: MockMCPServer): void {
    this.mockServers.set(name, server);
  }

  async runScenario(scenarioName: string): Promise<boolean> {
    const scenario = this.scenarios.find(s => s.name === scenarioName);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioName} not found`);
    }

    const result = {
      scenario: scenarioName,
      success: true,
      steps: [] as Array<{ step: string; success: boolean; error?: string }>
    };

    try {
      if (scenario.setup) {
        await scenario.setup();
      }

      for (const step of scenario.steps) {
        const stepResult = await this.runStep(step);
        result.steps.push(stepResult);
        if (!stepResult.success) {
          result.success = false;
        }
      }

      // Validate overall results
      if (scenario.expectedResults && result.success) {
        // Add custom validation logic here
      }

    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      if (scenario.teardown) {
        await scenario.teardown();
      }
    }

    this.results.push(result);
    return result.success;
  }

  private async runStep(step: ContractTestStep): Promise<{ step: string; success: boolean; error?: string }> {
    try {
      let response: unknown;

      switch (step.action) {
        case 'call_tool':
          response = await this.callTool(step.target!, step.params || {});
          break;
        case 'get_resource':
          response = await this.getResource(step.target!);
          break;
        case 'get_prompt':
          response = await this.getPrompt(step.target!, step.params || {});
          break;
        case 'list_tools':
          response = await this.listTools();
          break;
        case 'list_resources':
          response = await this.listResources();
          break;
        case 'list_prompts':
          response = await this.listPrompts();
          break;
      }

      // Validate response
      if (step.validator && !step.validator(response)) {
        return {
          step: `${step.action}${step.target ? ` ${step.target}` : ''}`,
          success: false,
          error: 'Response validation failed'
        };
      }

      if (step.expectedResponse) {
        const matches = JSON.stringify(response) === JSON.stringify(step.expectedResponse);
        if (!matches) {
          return {
            step: `${step.action}${step.target ? ` ${step.target}` : ''}`,
            success: false,
            error: 'Response does not match expected result'
          };
        }
      }

      return {
        step: `${step.action}${step.target ? ` ${step.target}` : ''}`,
        success: true
      };

    } catch (error) {
      return {
        step: `${step.action}${step.target ? ` ${step.target}` : ''}`,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    // Simulate calling a tool - in real implementation, this would use the MCP client
    const server = Array.from(this.mockServers.values())[0]; // Use first available server
    if (!server) {
      throw new Error('No mock servers available');
    }

    // Return realistic mock responses based on tool name
    switch (name) {
      case 'read_file':
        return {
          result: {
            content: `Mock file content for ${params.path}`,
            size: 1024
          }
        };
      case 'write_file':
        return {
          result: {
            success: true,
            path: params.path,
            bytesWritten: (params.content as string)?.length || 0
          }
        };
      case 'search_code':
        return {
          result: {
            matches: [`Mock search result for: ${params.query}`],
            count: 1
          }
        };
      case 'refactor_code':
        return {
          result: {
            originalCode: params.code,
            refactoredCode: `/* Refactored */ ${params.code}`,
            explanation: `Mock refactoring: ${params.instruction}`
          }
        };
      default:
        return {
          result: {
            message: `Mock result for tool ${name}`,
            tool: name,
            params
          }
        };
    }
  }

  private async getResource(uri: string): Promise<unknown> {
    // Simulate getting a resource
    const server = Array.from(this.mockServers.values())[0];
    if (!server) {
      throw new Error('No mock servers available');
    }

    return { 
      uri, 
      content: `Mock resource content for ${uri}`,
      mimeType: 'text/plain',
      size: 256
    };
  }

  private async getPrompt(name: string, params: Record<string, unknown>): Promise<unknown> {
    // Simulate getting a prompt
    const server = Array.from(this.mockServers.values())[0];
    if (!server) {
      throw new Error('No mock servers available');
    }

    return { 
      name, 
      params, 
      messages: [{ 
        role: 'user', 
        content: { 
          type: 'text', 
          text: `Please explain this code: ${params.code || 'sample code'}`
        } 
      }] 
    };
  }

  private async listTools(): Promise<unknown> {
    // Simulate aggregated tools from multiple agents (Claude + Cursor)
    return { 
      tools: [
        { name: 'read_file', description: 'Read a file from the filesystem', agent: 'claude' },
        { name: 'write_file', description: 'Write content to a file', agent: 'claude' },
        { name: 'search_code', description: 'Search for code patterns', agent: 'cursor' },
        { name: 'refactor_code', description: 'Refactor code using AI suggestions', agent: 'cursor' }
      ] 
    };
  }

  private async listResources(): Promise<unknown> {
    // Simulate aggregated resources from multiple agents
    return { 
      resources: [
        { uri: 'file:///workspace', name: 'workspace', agent: 'claude' },
        { uri: 'cursor://project', name: 'current-project', agent: 'cursor' }
      ] 
    };
  }

  private async listPrompts(): Promise<unknown> {
    // Simulate aggregated prompts from multiple agents  
    return { 
      prompts: [
        { name: 'explain_code', description: 'Explain what a piece of code does', agent: 'claude' },
        { name: 'optimize_code', description: 'Suggest code optimizations', agent: 'cursor' }
      ] 
    };
  }

  async runAllScenarios(): Promise<{ passed: number; failed: number; results: typeof this.results }> {
    this.results = [];

    for (const scenario of this.scenarios) {
      await this.runScenario(scenario.name);
    }

    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.length - passed;

    return {
      passed,
      failed,
      results: this.results
    };
  }

  getResults(): typeof this.results {
    return [...this.results];
  }

  generateReport(): string {
    let report = '# E2E Contract Test Report\n\n';
    report += `**Total Scenarios:** ${this.results.length}\n`;
    report += `**Passed:** ${this.results.filter(r => r.success).length}\n`;
    report += `**Failed:** ${this.results.filter(r => !r.success).length}\n\n`;

    for (const result of this.results) {
      report += `## ${result.scenario}\n`;
      report += `**Status:** ${result.success ? '✅ PASSED' : '❌ FAILED'}\n`;
      
      if (result.error) {
        report += `**Error:** ${result.error}\n`;
      }

      report += '**Steps:**\n';
      for (const step of result.steps) {
        report += `- ${step.success ? '✅' : '❌'} ${step.step}`;
        if (step.error) {
          report += ` (${step.error})`;
        }
        report += '\n';
      }
      report += '\n';
    }

    return report;
  }
}

// Predefined mock agent configurations
export const MockAgents = {
  Claude: (): MockAgentConfig => ({
    name: 'claude-desktop',
    version: '1.0.0',
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    },
    tools: [
      {
        name: 'read_file',
        description: 'Read a file from the filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file to read' }
          },
          required: ['path']
        },
        handler: async (args: Record<string, unknown>) => {
          const filePath = args.path as string;
          return { content: `Mock file content for ${filePath}`, size: 1024 };
        }
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' }
          },
          required: ['path', 'content']
        },
        handler: async (args: Record<string, unknown>) => {
          return { success: true, path: args.path, bytesWritten: (args.content as string).length };
        }
      }
    ],
    resources: [
      {
        uri: 'file:///workspace',
        name: 'workspace',
        description: 'Current workspace directory',
        handler: async () => ({
          contents: [{ type: 'text', data: 'Mock workspace listing' }]
        })
      }
    ],
    prompts: [
      {
        name: 'explain_code',
        description: 'Explain what a piece of code does',
        arguments: [{ name: 'code', description: 'Code to explain', required: true }],
        handler: async (args: Record<string, unknown>) => ({
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Please explain this code: ${args.code}`
            }
          }]
        })
      }
    ],
    responses: {},
    latency: 100,
    errorRate: 0.05
  }),

  Cursor: (): MockAgentConfig => ({
    name: 'cursor',
    version: '0.42.0',
    capabilities: {
      tools: {},
      resources: {}
    },
    tools: [
      {
        name: 'search_code',
        description: 'Search for code patterns',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            directory: { type: 'string' }
          },
          required: ['query']
        },
        handler: async (args: Record<string, unknown>) => {
          return { matches: [`Mock search result for: ${args.query}`], count: 1 };
        }
      },
      {
        name: 'refactor_code',
        description: 'Refactor code using AI suggestions',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            instruction: { type: 'string' }
          },
          required: ['code', 'instruction']
        },
        handler: async (args: Record<string, unknown>) => {
          return { 
            originalCode: args.code, 
            refactoredCode: `/* Refactored */ ${args.code}`,
            explanation: `Mock refactoring: ${args.instruction}`
          };
        }
      }
    ],
    resources: [
      {
        uri: 'cursor://project',
        name: 'current-project',
        description: 'Current Cursor project',
        handler: async () => ({
          contents: [{ type: 'text', data: 'Mock project structure' }]
        })
      }
    ],
    prompts: [],
    responses: {},
    latency: 200,
    errorRate: 0.02
  })
};