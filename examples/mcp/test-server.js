#!/usr/bin/env node

// Simple test MCP server for testing proxy functionality
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';

class TestMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'test-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'test_echo',
            description: 'Echo back a message - test tool from external MCP',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Message to echo back',
                },
              },
              required: ['message'],
            },
          },
          {
            name: 'test_math',
            description: 'Simple math operation - test tool from external MCP',
            inputSchema: {
              type: 'object',
              properties: {
                operation: {
                  type: 'string',
                  enum: ['add', 'multiply'],
                  description: 'Math operation to perform',
                },
                a: {
                  type: 'number',
                  description: 'First number',
                },
                b: {
                  type: 'number', 
                  description: 'Second number',
                },
              },
              required: ['operation', 'a', 'b'],
            },
          },
        ],
      };
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'test_echo':
          return {
            content: [
              {
                type: 'text',
                text: `External MCP Echo: ${args.message}`,
              },
            ],
          };

        case 'test_math':
          const { operation, a, b } = args;
          let result;
          
          if (operation === 'add') {
            result = a + b;
          } else if (operation === 'multiply') {
            result = a * b;
          } else {
            throw new Error(`Unknown operation: ${operation}`);
          }
          
          return {
            content: [
              {
                type: 'text',
                text: `External MCP Math: ${a} ${operation} ${b} = ${result}`,
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'test://server-info',
            name: 'Test Server Info',
            description: 'Information about the test MCP server',
            mimeType: 'application/json',
          },
          {
            uri: 'test://capabilities',
            name: 'Test Server Capabilities',
            description: 'Capabilities of the test MCP server',
            mimeType: 'application/json',
          },
        ],
      };
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case 'test://server-info':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  name: 'Test MCP Server',
                  version: '1.0.0',
                  description: 'A simple test MCP server for proxy functionality testing',
                  tools: 2,
                  resources: 2,
                }, null, 2),
              },
            ],
          };

        case 'test://capabilities':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  tools: ['test_echo', 'test_math'],
                  resources: ['test://server-info', 'test://capabilities'],
                  features: ['proxy-testing', 'aggregation'],
                }, null, 2),
              },
            ],
          };

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Test MCP Server running on stdio');
  }
}

// Start the test server
const server = new TestMCPServer();
server.run().catch((error) => {
  console.error('Test server error:', error);
  process.exit(1);
});