/**
 * Simple stdio MCP server for Claude Code compatibility
 * Uses basic stdio communication without MCP SDK dependency
 */

import { SourceConfigManager } from '../config/source-config-manager';
import { MCPSSEServer } from './mcp-sse-server';

export class SimpleStdioServer {
  private configManager: SourceConfigManager;
  private httpMcpTools: Map<string, any> = new Map();

  constructor() {
    this.configManager = new SourceConfigManager();
  }

  private async fetchHttpMcpTools() {
    const config = this.configManager.getConfig();
    const tools: any[] = [];
    
    if ((config as any).mcp_servers) {
      for (const server of (config as any).mcp_servers) {
        if (server.type === 'http' && server.enabled && server.url) {
          try {
            const response = await fetch(`${server.url}/tools/list`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
              })
            });
            
            if (response.ok) {
              const data = await response.json() as any;
              if (data.result?.tools) {
                for (const tool of data.result.tools) {
                  tools.push({
                    ...tool,
                    _server: server.name,
                    _url: server.url
                  });
                  this.httpMcpTools.set(tool.name, { server: server.name, url: server.url });
                }
              }
            }
          } catch (error) {
            // Silently ignore HTTP MCP server fetch errors in stdio mode to avoid interfering with JSON-RPC
            // console.error(`Failed to fetch tools from ${server.name}:`, error);
          }
        }
      }
    }
    
    return tools;
  }

  async start() {
    let buffer = '';
    
    // Handle line-delimited JSON messages
    process.stdin.on('data', async (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const request = JSON.parse(line);
          
          if (request.method === 'initialize') {
            const config = this.configManager.getConfig();
            const hasGithubSources = config.github_sources && config.github_sources.length > 0;
            const hasLocalSources = config.local_sources && config.local_sources.length > 0;
            const hasMcpServers = config.mcp_servers && config.mcp_servers.length > 0;
            
            const response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  resources: hasGithubSources || hasLocalSources ? {
                    subscribe: true,
                    listChanged: true
                  } : {},
                  tools: hasMcpServers ? {
                    listChanged: true
                  } : {},
                  prompts: {}
                },
                serverInfo: {
                  name: 'omni-mcp-hub',
                  version: '1.0.0'
                }
              }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
          } else if (request.method === 'notifications/initialized') {
            // No response needed for notifications
          } else if (request.method === 'resources/list') {
            const config = this.configManager.getConfig();
            const resources: any[] = [];
            
            // Add GitHub sources as resources
            if ((config as any).github_sources) {
              for (const source of (config as any).github_sources) {
                const repos = source.repos || [source]; // Handle both single repo and multiple repos
                for (const repo of repos) {
                  const repoName = repo.name || repo.repo || 'unknown';
                  resources.push({
                    uri: `github://${source.owner}/${repoName}`,
                    name: `${source.owner}/${repoName}`,
                    description: `GitHub repository: ${source.owner}/${repoName}`,
                    mimeType: 'application/json'
                  });
                }
              }
            }
            
            // Add local sources as resources
            if (config.local_sources) {
              for (const source of config.local_sources) {
                resources.push({
                  uri: `file://${source.url}`,
                  name: `Local: ${source.url}`,
                  description: `Local filesystem: ${source.url}`,
                  mimeType: 'text/plain'
                });
              }
            }
            
            const response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                resources
              }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
          } else if (request.method === 'resources/read') {
            const uri = request.params?.uri;
            if (!uri) {
              const errorResponse = {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32602,
                  message: 'Missing uri parameter'
                }
              };
              process.stdout.write(JSON.stringify(errorResponse) + '\n');
              return;
            }

            // Handle GitHub URIs
            if (uri.startsWith('github://')) {
              const match = uri.match(/^github:\/\/([^\/]+)\/([^\/]+)$/);
              if (match) {
                const [, owner, repo] = match;
                const response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: {
                    contents: [{
                      uri: uri,
                      mimeType: 'text/markdown',
                      text: `# ${owner}/${repo}\n\nThis is a GitHub repository resource.\nTo get actual content, the GitHub API integration needs to be implemented.\n\nRepository: https://github.com/${owner}/${repo}`
                    }]
                  }
                };
                process.stdout.write(JSON.stringify(response) + '\n');
              } else {
                const errorResponse = {
                  jsonrpc: '2.0',
                  id: request.id,
                  error: {
                    code: -32602,
                    message: 'Invalid GitHub URI format'
                  }
                };
                process.stdout.write(JSON.stringify(errorResponse) + '\n');
              }
            } else if (uri.startsWith('file://')) {
              // Handle file URIs
              const response = {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  contents: [{
                    uri: uri,
                    mimeType: 'text/plain',
                    text: `Local file: ${uri.replace('file://', '')}\n\nFile system access needs to be implemented.`
                  }]
                }
              };
              process.stdout.write(JSON.stringify(response) + '\n');
            } else {
              const errorResponse = {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32602,
                  message: 'Unsupported URI scheme'
                }
              };
              process.stdout.write(JSON.stringify(errorResponse) + '\n');
            }
          } else if (request.method === 'tools/list') {
            const httpTools = await this.fetchHttpMcpTools();
            const response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                tools: httpTools
              }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
          } else if (request.method === 'tools/call') {
            const toolName = request.params?.name;
            const toolArgs = request.params?.arguments || {};
            
            if (!toolName) {
              const errorResponse = {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32602,
                  message: 'Missing tool name'
                }
              };
              process.stdout.write(JSON.stringify(errorResponse) + '\n');
              return;
            }
            
            const toolInfo = this.httpMcpTools.get(toolName);
            if (!toolInfo) {
              const errorResponse = {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32601,
                  message: `Tool ${toolName} not found`
                }
              };
              process.stdout.write(JSON.stringify(errorResponse) + '\n');
              return;
            }
            
            try {
              const response = await fetch(`${toolInfo.url}/tools/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'tools/call',
                  params: {
                    name: toolName,
                    arguments: toolArgs
                  }
                })
              });
              
              if (response.ok) {
                const data = await response.json() as any;
                const toolResponse = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: data.result
                };
                process.stdout.write(JSON.stringify(toolResponse) + '\n');
              } else {
                const errorResponse = {
                  jsonrpc: '2.0',
                  id: request.id,
                  error: {
                    code: -32603,
                    message: `HTTP error ${response.status}`
                  }
                };
                process.stdout.write(JSON.stringify(errorResponse) + '\n');
              }
            } catch (error) {
              const errorResponse = {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32603,
                  message: `Tool call failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                }
              };
              process.stdout.write(JSON.stringify(errorResponse) + '\n');
            }
          } else if (request.method === 'prompts/list') {
            const response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                prompts: []
              }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
          } else if (request.id !== undefined) {
            // Only respond to requests with id (not notifications)
            const errorResponse = {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: 'Method not found: ' + request.method
              }
            };
            process.stdout.write(JSON.stringify(errorResponse) + '\n');
          }
        } catch (error) {
          // Silently ignore parse errors
        }
      }
    });

    // Handle stdin close
    process.stdin.on('end', () => {
      process.exit(0);
    });

    // Keep process alive
    process.stdin.resume();
  }
}