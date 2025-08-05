import { MCPSSEServer } from './mcp-sse-server';
import { SourceConfigManager } from '../config/source-config-manager';

// Dynamic import for stdio server
import { SimpleStdioServer } from './simple-stdio-server';

export class OmniMCPServer {
  private mcpServer: MCPSSEServer;
  private stdioBridge: any;
  private configLoader: SourceConfigManager;
  private mode: string;

  constructor() {
    this.configLoader = new SourceConfigManager();
    const config = this.configLoader.getConfig();
    this.mode = process.env.MCP_MODE || 'unified';
    
    // 既存のSSEサーバー（後方互換性維持）
    this.mcpServer = new MCPSSEServer(config.server.port);
    
    // 新しいstdioブリッジ（Claude Code対応）
    this.stdioBridge = new SimpleStdioServer();
  }

  private log(message: string) {
    // In stdio mode, suppress console output to avoid interfering with JSON-RPC protocol
    if (this.mode !== 'stdio') {
      console.error(message);
    }
  }

  async initialize() {
    this.log(`🚀 Starting Omni MCP Hub in ${this.mode} mode`);
    
    switch (this.mode) {
      case 'stdio':
        // Claude Code用（標準MCPプロトコル）
        if (this.stdioBridge) {
          this.log('📋 Starting stdio MCP bridge for Claude Code compatibility');
          await this.stdioBridge.start();
        } else {
          this.log('❌ MCP SDK not available. Falling back to SSE mode.');
          this.mcpServer.start();
        }
        break;
        
      case 'sse':
        // 既存のSSEサーバー（git-mcp互換）
        this.log('🌐 Starting SSE server for git-mcp compatibility');
        this.mcpServer.start();
        break;
        
      case 'unified':
        // 両方のプロトコルを同時にサポート
        this.log('🔄 Starting unified mode - both stdio and SSE');
        if (this.stdioBridge) {
          await Promise.all([
            this.stdioBridge.start(),
            new Promise(resolve => {
              this.mcpServer.start();
              resolve(undefined);
            })
          ]);
        } else {
          this.log('❌ MCP SDK not available. Running SSE mode only.');
          this.mcpServer.start();
        }
        break;
        
      default:
        this.log('❌ Invalid MCP_MODE. Use: stdio, sse, or unified');
        process.exit(1);
    }
    
    this.log('✅ Omni MCP Hub initialized successfully');
    this.log('💡 All existing functionality preserved and enhanced');
  }
}

// Start server
const server = new OmniMCPServer();
server.initialize().catch(console.error);

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully');
  process.exit(0);
});