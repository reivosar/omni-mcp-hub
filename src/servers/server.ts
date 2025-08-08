import { MCPSSEServer } from './mcp-sse-server';
import { SourceConfigManager } from '../config/source-config-manager';

// Dynamic import for stdio server
import { SimpleStdioServer } from './simple-stdio-server';

export class OmniMCPServer {
  private mcpServer?: MCPSSEServer;
  private stdioBridge?: any;
  private mode: string;

  constructor() {
    this.mode = process.env.MCP_MODE || 'sse';
    
    if (this.mode === 'stdio') {
      this.stdioBridge = new SimpleStdioServer();
    } else {
      const configLoader = new SourceConfigManager();
      const config = configLoader.getConfig();
      const port = config.server?.port || parseInt(process.env.PORT || '3000', 10);
      this.mcpServer = new MCPSSEServer(port);
    }
  }

  async initialize() {
    if (this.mode === 'stdio') {
      await this.stdioBridge?.start();
    } else {
      this.mcpServer?.start();
    }
  }

  async close() {
    if (this.mode === 'stdio') {
      // Stdio server doesn't need explicit close
    } else {
      this.mcpServer?.close();
    }
  }
}

// Start server only when directly executed (not imported in unit tests)
if (require.main === module) {
  const server = new OmniMCPServer();
  server.initialize().catch(console.error);

  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully');
    await server.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully');
    await server.close();
    process.exit(0);
  });
}