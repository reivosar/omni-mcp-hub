import { MCPHandler } from '../handlers/mcp-handler';
import { OmniSourceManager } from '../sources/source-manager';
import { MCPServerManager } from '../mcp/mcp-server-manager';
import { SourceConfigManager } from '../config/source-config-manager';
import * as readline from 'readline';

export class ClaudeCodeStdioServer {
  private configLoader: SourceConfigManager;
  private sourceManager: OmniSourceManager;
  private mcpServerManager: MCPServerManager;
  private mcpHandler: MCPHandler;
  private rl: readline.Interface;

  constructor() {
    this.configLoader = new SourceConfigManager();
    this.sourceManager = new OmniSourceManager();
    this.mcpServerManager = new MCPServerManager();
    this.mcpHandler = new MCPHandler(this.sourceManager, this.mcpServerManager);
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    this.initialize().catch(console.error);
  }

  private async initialize(): Promise<void> {
    try {
      await this.sourceManager.initializeSources();
      
      // Initialize MCP servers if configured
      const config = this.configLoader.getConfig();
      if (config.mcp_servers && config.mcp_servers.length > 0) {
        await this.mcpServerManager.initializeServers(config.mcp_servers);
      } else {
        console.error('No MCP servers configured');
      }
      
      this.startListening();
      console.error('Claude Code stdio server initialized');
    } catch (error) {
      console.error('Failed to initialize server:', error);
      process.exit(1);
    }
  }

  private startListening(): void {
    let buffer = '';

    this.rl.on('line', async (line: string) => {
      buffer += line;
      
      try {
        const message = JSON.parse(buffer);
        buffer = '';
        
        console.error('Received:', JSON.stringify(message, null, 2));
        const response = await this.mcpHandler.handleMessage(message);
        console.error('Sending:', JSON.stringify(response, null, 2));
        
        console.log(JSON.stringify(response));
      } catch (error) {
        if (error instanceof SyntaxError) {
          // Incomplete JSON, wait for more input
          buffer += '\n';
        } else {
          console.error('Message handling error:', error);
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal error'
            }
          }));
          buffer = '';
        }
      }
    });

    this.rl.on('close', async () => {
      console.error('Stdin closed, shutting down...');
      await this.shutdown();
      process.exit(0);
    });
  }

  async shutdown(): Promise<void> {
    console.error('Shutting down Claude Code stdio server...');
    await this.mcpServerManager.stopAllServers();
    this.rl.close();
    console.error('Server shutdown complete');
  }
}

// Start server
const server = new ClaudeCodeStdioServer();

process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  await server.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down gracefully...');
  await server.shutdown();
  process.exit(0);
});