import { OmniSourceManager } from './source-manager';

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

export class MCPHandler {
  private sourceManager: OmniSourceManager;

  constructor(sourceManager: OmniSourceManager) {
    this.sourceManager = sourceManager;
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
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'omni-mcp-hub',
              version: '1.0.0'
            }
          };
          break;

        case 'tools/list':
          response.result = {
            tools: this.getAvailableTools()
          };
          break;

        case 'tools/call':
          response.result = await this.handleToolCall(message.params);
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

  private getAvailableTools() {
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

    return tools;
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
        throw new Error(`Unknown tool: ${name}`);
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
    
    for (const [fileName, content] of files.entries()) {
      console.log(`Adding to bundle: ${fileName} (${content.length} chars)`);
      bundleContent += `${fileName}:\n${content}\n\n---\n\n`;
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

    // Format response with all variants
    let responseText = `File variants for ${fileName}:\n\n`;
    
    foundVariants.forEach((variant, index) => {
      responseText += `## Variant ${index + 1}: ${variant.source}\n`;
      responseText += `${variant.content}\n\n---\n\n`;
    });

    // Also include summary for Claude Code to understand
    responseText += `## Summary\n`;
    responseText += `Found ${foundVariants.length} variants from sources: ${foundVariants.map(v => v.source).join(', ')}\n`;
    responseText += `Claude Code can choose the most appropriate version based on context.`;

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