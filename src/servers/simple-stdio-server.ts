/**
 * Simple stdio MCP server for Claude Code compatibility
 * Uses basic stdio communication without MCP SDK dependency
 */

import { SourceConfigManager } from '../config/source-config-manager';
import { MCPSSEServer } from './mcp-sse-server';
import { MCPServerManager } from '../mcp/mcp-server-manager';
import { LocalDirectoryHandler } from '../local/local-directory-handler';
import { ClaudeBehaviorManager } from './claude-behavior-manager';
import * as path from 'path';
import * as fs from 'fs';

export class SimpleStdioServer {
  private configManager: SourceConfigManager;
  private httpMcpTools: Map<string, any> = new Map();
  private mcpServerManager: MCPServerManager;
  private behaviorManager: ClaudeBehaviorManager;

  constructor() {
    this.configManager = new SourceConfigManager();
    this.mcpServerManager = new MCPServerManager();
    this.behaviorManager = new ClaudeBehaviorManager();
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
    // Initialize MCP servers
    const config = this.configManager.getConfig();
    if (config.mcp_servers) {
      try {
        await this.mcpServerManager.initializeServers(config.mcp_servers);
      } catch (error) {
        // Continue even if MCP server initialization fails
      }
    }

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
            
            // Get behavior instructions for automatic injection
            let systemPrompts = [];
            if (hasLocalSources) {
              try {
                const behaviorInstructions = await this.behaviorManager.detectBehaviorInstructions();
                if (behaviorInstructions && behaviorInstructions.behaviors.length > 0) {
                  let combinedPrompt = '';
                  for (const behavior of behaviorInstructions.behaviors) {
                    const formattedPrompt = this.behaviorManager.formatBehaviorPrompt(
                      behavior.instructions,
                      behavior.source
                    );
                    combinedPrompt += formattedPrompt + '\n\n';
                  }
                  systemPrompts.push({
                    role: 'system',
                    content: combinedPrompt.trim()
                  });
                }
              } catch (error) {
                console.warn('Failed to load behavior instructions during initialize:', error);
              }
            }
            
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
                  prompts: hasLocalSources ? {
                    listChanged: true
                  } : {},
                  // Add experimental system prompt capability
                  experimental: {
                    systemPrompts: hasLocalSources && systemPrompts.length > 0
                  }
                },
                serverInfo: {
                  name: 'omni-mcp-hub',
                  version: '1.0.0',
                  // Indicate this server provides automatic system prompts
                  features: ['auto-system-prompts'],
                  behaviorInstructions: systemPrompts.length > 0 ? {
                    enabled: true,
                    source: 'CLAUDE.md',
                    autoApply: true
                  } : undefined
                },
                // Inject system prompts for automatic application
                ...(systemPrompts.length > 0 && {
                  systemPrompts: systemPrompts,
                  autoApplySystemPrompts: true
                })
              }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
          } else if (request.method === 'notifications/initialized') {
            // Send system prompts immediately after initialization is complete
            const config = this.configManager.getConfig();
            if (config.local_sources && config.local_sources.length > 0) {
              try {
                const behaviorInstructions = await this.behaviorManager.detectBehaviorInstructions();
                if (behaviorInstructions && behaviorInstructions.behaviors.length > 0) {
                  for (const behavior of behaviorInstructions.behaviors) {
                    const formattedPrompt = this.behaviorManager.formatBehaviorPrompt(
                      behavior.instructions,
                      behavior.source
                    );
                    
                    // Send as system message notification
                    const systemNotification = {
                      jsonrpc: '2.0',
                      method: 'notifications/system_prompt',
                      params: {
                        role: 'system',
                        content: formattedPrompt,
                        source: behavior.source,
                        auto_apply: true
                      }
                    };
                    process.stdout.write(JSON.stringify(systemNotification) + '\n');
                  }
                }
              } catch (error) {
                console.warn('Failed to send system prompts after initialization:', error);
              }
            }
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
              const filePath = uri.replace('file://', '');
              
              try {
                // Check if this path matches any configured local source
                const config = this.configManager.getConfig();
                let matchedSource = null;
                
                if (config.local_sources) {
                  for (const source of config.local_sources) {
                    const sourcePath = source.url.replace('file://', '');
                    if (filePath.startsWith(sourcePath)) {
                      matchedSource = source;
                      break;
                    }
                  }
                }
                
                if (matchedSource && fs.existsSync(filePath)) {
                  const content = fs.readFileSync(filePath, 'utf-8');
                  const response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {
                      contents: [{
                        uri: uri,
                        mimeType: 'text/plain',
                        text: content
                      }]
                    }
                  };
                  process.stdout.write(JSON.stringify(response) + '\n');
                } else {
                  // File not found or not in configured sources
                  const errorResponse = {
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                      code: -32602,
                      message: matchedSource ? 'File not found' : 'File path not accessible - not in configured local sources'
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
                    message: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
                  }
                };
                process.stdout.write(JSON.stringify(errorResponse) + '\n');
              }
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
            const mcpTools = await this.mcpServerManager.getAllTools();
            const allTools = [...httpTools, ...mcpTools];
            
            const response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                tools: allTools
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
            
            // Try HTTP MCP tools first
            const httpToolInfo = this.httpMcpTools.get(toolName);
            if (httpToolInfo) {
              try {
                const response = await fetch(`${httpToolInfo.url}/tools/call`, {
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
                    message: `HTTP tool call failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                  }
                };
                process.stdout.write(JSON.stringify(errorResponse) + '\n');
              }
            } else {
              // Try MCP Server Manager tools
              try {
                const result = await this.mcpServerManager.callTool(toolName, toolArgs);
                const toolResponse = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: result
                };
                process.stdout.write(JSON.stringify(toolResponse) + '\n');
              } catch (error) {
                const errorResponse = {
                  jsonrpc: '2.0',
                  id: request.id,
                  error: {
                    code: -32601,
                    message: `Tool ${toolName} not found or failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                  }
                };
                process.stdout.write(JSON.stringify(errorResponse) + '\n');
              }
            }
          } else if (request.method === 'prompts/list') {
            const prompts = [];
            
            // Check if we have local sources with CLAUDE.md
            const config = this.configManager.getConfig();
            if (config.local_sources && config.local_sources.length > 0) {
              prompts.push({
                name: 'claude_behavior',
                description: 'Apply Claude behavior instructions from CLAUDE.md files',
                arguments: []
              });
            }
            
            const response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                prompts
              }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
          } else if (request.method === 'prompts/get') {
            const promptName = request.params?.name;
            
            if (promptName === 'claude_behavior') {
              try {
                // Get behavior instructions from CLAUDE.md files
                const behaviorInstructions = await this.behaviorManager.detectBehaviorInstructions();
                
                if (behaviorInstructions && behaviorInstructions.behaviors.length > 0) {
                  // Format all behavior instructions as a single system prompt
                  let systemPrompt = '';
                  for (const behavior of behaviorInstructions.behaviors) {
                    const formattedPrompt = this.behaviorManager.formatBehaviorPrompt(
                      behavior.instructions,
                      behavior.source
                    );
                    systemPrompt += formattedPrompt + '\n\n';
                  }
                  
                  const response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {
                      description: 'Claude behavior instructions from CLAUDE.md files',
                      messages: [
                        {
                          role: 'system',
                          content: {
                            type: 'text',
                            text: systemPrompt.trim()
                          }
                        }
                      ]
                    }
                  };
                  process.stdout.write(JSON.stringify(response) + '\n');
                } else {
                  const errorResponse = {
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                      code: -32602,
                      message: 'No behavior instructions found'
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
                    message: `Failed to get behavior prompt: ${error instanceof Error ? error.message : 'Unknown error'}`
                  }
                };
                process.stdout.write(JSON.stringify(errorResponse) + '\n');
              }
            } else {
              const errorResponse = {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32602,
                  message: `Prompt '${promptName}' not found`
                }
              };
              process.stdout.write(JSON.stringify(errorResponse) + '\n');
            }
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

  private async sendBehaviorInstructions() {
    try {
      const behaviorInstructions = await this.behaviorManager.detectBehaviorInstructions();
      if (behaviorInstructions && behaviorInstructions.behaviors.length > 0) {
        // Send each CLAUDE.md behavior instruction as a system message
        for (const behavior of behaviorInstructions.behaviors) {
          const systemPrompt = this.behaviorManager.formatBehaviorPrompt(
            behavior.instructions,
            behavior.source
          );
          
          // Send behavior instruction as a system message to Claude Code
          const behaviorMessage = {
            jsonrpc: '2.0',
            method: 'system/behavior',
            params: {
              source: behavior.source,
              instructions: systemPrompt,
              type: 'claude_behavior'
            }
          };
          
          // Write to stdout for Claude Code to consume
          process.stdout.write(JSON.stringify(behaviorMessage) + '\n');
        }
      }
    } catch (error) {
      // Silently handle errors to avoid breaking MCP communication
      console.error('Failed to send behavior instructions:', error);
    }
  }
}