import { Request, Response } from 'express';
import { BaseClientHandler } from './base-handler';
import { ClientType, ProtocolType } from '../types/client-types';
import { OmniSourceManager } from '../sources/source-manager';
import { ContentValidator } from '../utils/content-validator';
import { MCPServerManager } from '../mcp/mcp-server-manager';

interface MCPMessage {
  jsonrpc: string;
  id?: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: string;
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

export class MCPHandler extends BaseClientHandler {
  private sourceManager: OmniSourceManager;
  private mcpServerManager: MCPServerManager;

  constructor(sourceManager: OmniSourceManager, mcpServerManager: MCPServerManager) {
    super(ClientType.CLAUDE, ProtocolType.MCP);
    this.sourceManager = sourceManager;
    this.mcpServerManager = mcpServerManager;
  }

  async process(req: Request, res: Response): Promise<void> {
    try {
      const message: MCPMessage = req.body;
      const response = await this.handleMessage(message);
      res.json(response);
    } catch (error) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  async handleMessage(message: MCPMessage): Promise<MCPResponse> {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id: message.id
    };

    try {
      switch (message.method) {
        case 'initialize':
          response.result = {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {
                listChanged: true
              }
            },
            serverInfo: {
              name: 'omni-mcp-hub',
              version: '1.0.0'
            }
          };
          break;

        case 'initialized':
        case 'notifications/initialized':
          // Notification - no response needed
          console.error('Client initialized successfully');
          return { jsonrpc: '2.0' } as MCPResponse;

        case 'ping':
          response.result = {};
          break;

        case 'tools/list':
          response.result = {
            tools: await this.getAvailableTools()
          };
          break;

        case 'tools/call':
          // Add content safety check before processing
          response.result = await this.handleToolCallSafely(message.params);
          break;

        default:
          response.error = {
            code: -32601,
            message: `Method not found: ${message.method}`
          };
      }
    } catch (error) {
      response.error = {
        code: -32603,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    return response;
  }

  getSupportedMethods(): string[] {
    return [
      'initialize',
      'initialized',
      'notifications/initialized',
      'ping',
      'tools/list',
      'tools/call'
    ];
  }

  private async getAvailableTools() {
    const tools = [
      {
        name: 'list_sources',
        description: 'List all configured sources',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'list_source_files',
        description: 'List all markdown files in a source',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source name (e.g., github:user/repo, local:/path)'
            }
          },
          required: ['source']
        }
      },
      {
        name: 'get_source_file',
        description: 'Get content of a specific file from source',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source name (e.g., github:user/repo, local:/path)'
            },
            file: {
              type: 'string',
              description: 'File path relative to source root'
            }
          },
          required: ['source', 'file']
        }
      },
      {
        name: 'get_file_variants',
        description: 'Get all available versions of a file from all sources',
        inputSchema: {
          type: 'object',
          properties: {
            fileName: {
              type: 'string',
              description: 'File name to search for across all sources (e.g., README.md, CLAUDE.md)'
            }
          },
          required: ['fileName']
        }
      }
    ];

    // Add bundle tool if enabled
    if (this.sourceManager.getBundleMode()) {
      tools.push({
        name: 'get_source_bundle',
        description: 'Get all configured files from source as a bundle',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source name (e.g., github:user/repo, local:/path)'
            }
          },
          required: ['source']
        }
      });
    }

    // Get tools from MCP servers
    try {
      const mcpTools = await this.mcpServerManager.getAllTools();
      tools.push(...mcpTools);
    } catch (error) {
      console.error('Failed to get MCP server tools:', error);
    }

    return tools;
  }

  private async handleToolCallSafely(params: any) {
    try {
      return await this.handleToolCall(params);
    } catch (error) {
      // Check if error is due to content validation
      if (error instanceof Error && error.message.includes('Rejected')) {
        return {
          content: [
            {
              type: 'text',
              text: '⚠️ Content Safety Notice: The requested content has been filtered due to potentially harmful patterns. This is to ensure safe and responsible AI interaction.'
            }
          ]
        };
      }
      throw error;
    }
  }

  private async handleToolCall(params: any) {
    const { name, arguments: args } = params;
    
    console.log(`Tool call: ${name}`, args ? JSON.stringify(args, null, 2) : 'no args');

    let result;
    switch (name) {
      case 'list_sources':
        result = this.listSources();
        break;

      case 'list_source_files':
        result = await this.listSourceFiles(args.source);
        break;

      case 'get_source_file':
        result = await this.getSourceFile(args.source, args.file);
        break;

      case 'get_source_bundle':
        result = await this.getSourceBundle(args.source);
        break;

      case 'get_file_variants':
        result = await this.getFileVariants(args.fileName);
        break;

      default:
        // Check if it's an MCP server tool (supports both formats: server__tool and server/tool)
        if (name.includes('__') || name.includes('/')) {
          result = await this.mcpServerManager.callTool(name, args);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
        break;
    }

    console.log(`Tool result for ${name}:`, JSON.stringify(result, null, 2));
    return result;
  }

  private listSources() {
    const sources = this.sourceManager.getSourceNames();
    console.log(`Found ${sources.length} sources:`, sources);
    
    return {
      content: [
        {
          type: 'text',
          text: `Available sources:\n${sources.map(s => `- ${s}`).join('\n')}`
        }
      ]
    };
  }

  private async listSourceFiles(source: string) {
    console.log(`Listing files for source: ${source}`);
    const files = await this.sourceManager.listSourceFiles(source);
    console.log(`Found ${files.length} files in ${source}:`, files.slice(0, 10));
    
    return {
      content: [
        {
          type: 'text',
          text: `Files in ${source}:\n${files.map(f => `- ${f}`).join('\n')}`
        }
      ]
    };
  }

  private async getSourceFile(source: string, fileName: string) {
    console.log(`Getting file: ${fileName} from ${source}`);
    const content = await this.sourceManager.getSourceFile(source, fileName);
    
    if (!content) {
      console.log(`File not found: ${fileName} in ${source}`);
      throw new Error(`File not found: ${fileName} in ${source}`);
    }

    console.log(`Retrieved ${fileName}: ${content.length} characters`);
    
    // Check if content was rejected by validation (content would be null)
    // If we got here, content passed validation, but we still check risk level
    const riskLevel = ContentValidator.shouldAddSafetyNotice(content);
    
    if (riskLevel) {
      // Don't return the actual dangerous content - return a safety message instead
      console.warn(`High-risk content detected in ${fileName}, returning safety notice instead`);
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Content Safety Block\n\nThe requested file "${fileName}" from "${source}" contains patterns that may pose security risks and has been blocked from display. This is a protective measure to ensure safe AI interaction.\n\nIf you believe this is an error, please contact the system administrator.`
          }
        ]
      };
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `${fileName} from ${source}:\n\n${content}`
        }
      ]
    };
  }

  private async getSourceBundle(source: string) {
    console.log(`Creating bundle for source: ${source}`);
    const files = await this.sourceManager.getSourceFiles(source);
    
    if (files.size === 0) {
      const patterns = this.sourceManager.getFilePatterns();
      console.log(`No files found matching patterns: ${patterns.join(', ')} in ${source}`);
      throw new Error(`No files found matching patterns: ${patterns.join(', ')} in ${source}`);
    }

    console.log(`Bundle contains ${files.size} files:`, Array.from(files.keys()));

    let bundleContent = `Source Bundle: ${source}\n\n`;
    let blockedFiles: string[] = [];
    
    for (const [fileName, content] of files.entries()) {
      // Check each file for safety before including in bundle
      const riskLevel = ContentValidator.shouldAddSafetyNotice(content);
      
      if (riskLevel) {
        console.warn(`Excluding high-risk file from bundle: ${fileName}`);
        blockedFiles.push(fileName);
        bundleContent += `${fileName}: [BLOCKED - Content contains potentially harmful patterns]\n\n---\n\n`;
      } else {
        console.log(`Adding to bundle: ${fileName} (${content.length} chars)`);
        bundleContent += `${fileName}:\n${content}\n\n---\n\n`;
      }
    }

    // Add summary of blocked files if any
    if (blockedFiles.length > 0) {
      bundleContent += `\n⚠️ Security Notice: ${blockedFiles.length} file(s) were blocked due to security concerns: ${blockedFiles.join(', ')}\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: bundleContent
        }
      ]
    };
  }

  private async getFileVariants(fileName: string) {
    console.log(`Getting variants for file: ${fileName}`);
    const sourceNames = this.sourceManager.getSourceNames();
    const variants: Array<{source: string, content: string | null, error?: string}> = [];

    for (const sourceName of sourceNames) {
      try {
        console.log(`Checking ${fileName} in ${sourceName}`);
        const content = await this.sourceManager.getSourceFile(sourceName, fileName);
        
        if (content) {
          variants.push({
            source: sourceName,
            content: content
          });
          console.log(`Found ${fileName} in ${sourceName}: ${content.length} characters`);
        } else {
          variants.push({
            source: sourceName,
            content: null,
            error: 'File not found'
          });
          console.log(`Not found ${fileName} in ${sourceName}`);
        }
      } catch (error) {
        variants.push({
          source: sourceName,
          content: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.log(`Error getting ${fileName} from ${sourceName}:`, error);
      }
    }

    const foundVariants = variants.filter(v => v.content !== null);
    console.log(`Found ${foundVariants.length} variants of ${fileName}`);

    if (foundVariants.length === 0) {
      throw new Error(`File ${fileName} not found in any source`);
    }

    // Format response with safety checking for each variant
    let responseText = `File variants for ${fileName}:\n\n`;
    let safeVariants = 0;
    let blockedVariants: string[] = [];
    
    foundVariants.forEach((variant, index) => {
      const riskLevel = ContentValidator.shouldAddSafetyNotice(variant.content!);
      
      if (riskLevel) {
        console.warn(`Blocking variant ${index + 1} from ${variant.source} due to security concerns`);
        blockedVariants.push(variant.source);
        responseText += `## Variant ${index + 1}: ${variant.source}\n`;
        responseText += `[BLOCKED - Content contains potentially harmful patterns]\n\n---\n\n`;
      } else {
        safeVariants++;
        responseText += `## Variant ${index + 1}: ${variant.source}\n`;
        responseText += `${variant.content}\n\n---\n\n`;
      }
    });

    // Add security summary
    responseText += `## Summary\n`;
    responseText += `Found ${foundVariants.length} variants from sources: ${foundVariants.map(v => v.source).join(', ')}\n`;
    
    if (blockedVariants.length > 0) {
      responseText += `\n⚠️ Security Notice: ${blockedVariants.length} variant(s) were blocked due to security concerns from: ${blockedVariants.join(', ')}\n`;
    }
    
    if (safeVariants > 0) {
      responseText += `${safeVariants} safe variant(s) available for use.`;
    } else {
      responseText += `⚠️ All variants contain potentially harmful content and have been blocked.`;
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText
        }
      ]
    };
  }

}