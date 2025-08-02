import WebSocket from 'ws';
import simpleGit from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';

interface SourceData {
  name: string;
  files: Map<string, string>;
}

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
  error?: { code: number; message: string };
}

class SimpleMCPServer {
  private wss: WebSocket.Server;
  private sources: SourceData[] = [];
  private port: number;

  constructor() {
    this.port = parseInt(process.env.MCP_PORT || '38574');
    this.wss = new WebSocket.Server({ 
      port: this.port,
      path: '/sse'
    });

    console.log(`Simple MCP Hub started on port ${this.port}`);
  }

  async initialize() {
    console.log('Loading all sources...');
    
    // Load GitHub source
    try {
      const githubSource = await this.loadGitHubSource('anthropics/claude-code');
      this.sources.push(githubSource);
      console.log(`Loaded GitHub source: ${githubSource.files.size} files`);
    } catch (error) {
      console.error('Failed to load GitHub source:', error);
    }

    // Load local sources
    try {
      const lumSource = await this.loadLocalSource('/app/test-data/lum', 'lum');
      this.sources.push(lumSource);
      console.log(`Loaded Lum source: ${lumSource.files.size} files`);
    } catch (error) {
      console.error('Failed to load Lum source:', error);
    }

    try {
      const rerereSource = await this.loadLocalSource('/app/test-data/rerere-ojisan', 'rerere');
      this.sources.push(rerereSource);
      console.log(`Loaded Rerere source: ${rerereSource.files.size} files`);
    } catch (error) {
      console.error('Failed to load Rerere source:', error);
    }

    this.setupWebSocketHandlers();
  }

  private async loadGitHubSource(repo: string): Promise<SourceData> {
    const repoDir = `/app/repos/github-${repo.replace('/', '-')}`;
    const gitUrl = `https://github.com/${repo}.git`;

    // Clone if not exists
    if (!fs.existsSync(repoDir)) {
      const git = simpleGit();
      await git.clone(gitUrl, repoDir, ['--depth', '1']);
    }

    return {
      name: `github:${repo}`,
      files: this.loadFilesFromDirectory(repoDir)
    };
  }

  private async loadLocalSource(dirPath: string, sourceName: string): Promise<SourceData> {
    return {
      name: `local:${sourceName}`,
      files: this.loadFilesFromDirectory(dirPath)
    };
  }

  private loadFilesFromDirectory(dirPath: string): Map<string, string> {
    const files = new Map<string, string>();
    
    if (!fs.existsSync(dirPath)) {
      return files;
    }

    const loadRecursively = (currentDir: string, relativePath = '') => {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
        
        if (fs.statSync(fullPath).isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          loadRecursively(fullPath, relativeItemPath);
        } else if (item.endsWith('.md') || item.endsWith('.txt') || item.endsWith('.json') || item.endsWith('.yaml') || item.endsWith('.yml')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            files.set(relativeItemPath, content);
            console.log(`Loaded: ${relativeItemPath} (${content.length} chars)`);
          } catch (error) {
            console.error(`Failed to read ${fullPath}:`, error);
          }
        }
      }
    };

    loadRecursively(dirPath);
    return files;
  }

  private setupWebSocketHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Client connected');

      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as MCPMessage;
          console.log('Received:', JSON.stringify(message, null, 2));
          
          const response = await this.handleMessage(message);
          console.log('Sending response for:', message.method);
          
          ws.send(JSON.stringify(response));
        } catch (error) {
          console.error('Message handling error:', error);
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' }
          }));
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
      });
    });
  }

  private async handleMessage(message: MCPMessage): Promise<MCPResponse> {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id: message.id
    };

    try {
      switch (message.method) {
        case 'initialize':
          response.result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'simple-mcp-hub', version: '1.0.0' }
          };
          break;

        case 'tools/list':
          response.result = { tools: this.getAvailableTools() };
          break;

        case 'tools/call':
          response.result = await this.handleToolCall(message.params);
          break;

        default:
          response.error = { code: -32601, message: `Method not found: ${message.method}` };
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
    return [
      {
        name: 'list_sources',
        description: 'List all available sources',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'get_file_variants',
        description: 'Get all variants of a file from all sources',
        inputSchema: {
          type: 'object',
          properties: {
            fileName: { type: 'string', description: 'File name to search for' }
          },
          required: ['fileName']
        }
      },
      {
        name: 'get_source_file',
        description: 'Get a specific file from a specific source',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Source name' },
            file: { type: 'string', description: 'File name' }
          },
          required: ['source', 'file']
        }
      }
    ];
  }

  private async handleToolCall(params: any) {
    const { name, arguments: args } = params;
    console.log(`Tool call: ${name}`, args);

    switch (name) {
      case 'list_sources':
        return this.listSources();
      case 'get_file_variants':
        return this.getFileVariants(args.fileName);
      case 'get_source_file':
        return this.getSourceFile(args.source, args.file);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private listSources() {
    const sourceNames = this.sources.map(s => s.name);
    return {
      content: [{
        type: 'text',
        text: `Available sources:\n${sourceNames.map(s => `- ${s}`).join('\n')}`
      }]
    };
  }

  private getFileVariants(fileName: string) {
    console.log(`Getting variants for: ${fileName}`);
    
    const variants: Array<{source: string, content: string}> = [];
    
    for (const source of this.sources) {
      const content = source.files.get(fileName);
      if (content) {
        variants.push({ source: source.name, content });
        console.log(`Found ${fileName} in ${source.name}: ${content.length} chars`);
      }
    }

    if (variants.length === 0) {
      throw new Error(`File ${fileName} not found in any source`);
    }

    let responseText = `File variants for ${fileName}:\n\n`;
    
    variants.forEach((variant, index) => {
      responseText += `## Variant ${index + 1}: ${variant.source}\n`;
      responseText += `${variant.content}\n\n---\n\n`;
    });

    responseText += `## Summary\n`;
    responseText += `Found ${variants.length} variants from sources: ${variants.map(v => v.source).join(', ')}\n`;
    responseText += `Claude Code can choose the most appropriate version based on context.`;

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
  }

  private getSourceFile(sourceName: string, fileName: string) {
    console.log(`Getting ${fileName} from ${sourceName}`);
    
    const source = this.sources.find(s => s.name === sourceName);
    if (!source) {
      throw new Error(`Source not found: ${sourceName}`);
    }

    const content = source.files.get(fileName);
    if (!content) {
      throw new Error(`File not found: ${fileName} in ${sourceName}`);
    }

    return {
      content: [{
        type: 'text',
        text: `${fileName} from ${sourceName}:\n\n${content}`
      }]
    };
  }
}

// Start server
const server = new SimpleMCPServer();
server.initialize().catch(console.error);

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully');
  process.exit(0);
});