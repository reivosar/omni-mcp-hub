import { MCPSSEServer } from './mcp-sse-server';
import { ConfigLoader } from './config-loader';

class OmniMCPServer {
  private mcpServer: MCPSSEServer;
  private configLoader: ConfigLoader;

  constructor() {
    this.configLoader = new ConfigLoader();
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