import { MCPSSEServer } from './mcp-sse-server';
import { SourceConfigManager } from './source-config-manager';

class OmniMCPServer {
  private mcpServer: MCPSSEServer;
  private configLoader: SourceConfigManager;

  constructor() {
    this.configLoader = new SourceConfigManager();
    const config = this.configLoader.getConfig();
    this.mcpServer = new MCPSSEServer(config.server.port);
  }

  async initialize() {
    // Start MCP SSE server
    this.mcpServer.start();
  }
}

// Start server
const server = new OmniMCPServer();
server.initialize().catch(console.error);

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully');
  process.exit(0);
});