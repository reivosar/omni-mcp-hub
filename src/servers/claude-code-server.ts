import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import { MCPHandler } from '../handlers/mcp-handler';
import { OmniSourceManager } from '../sources/source-manager';
import { MCPServerManager } from '../mcp/mcp-server-manager';
import { SourceConfigManager } from '../config/source-config-manager';

export class ClaudeCodeServer {
  private app: express.Application;
  private port: number;
  private configLoader: SourceConfigManager;
  private sourceManager: OmniSourceManager;
  private mcpServerManager: MCPServerManager;
  private mcpHandler: MCPHandler;
  private wss: WebSocket.Server;

  constructor(port: number = 3001) {
    this.app = express();
    this.port = port;
    this.configLoader = new SourceConfigManager();
    this.sourceManager = new OmniSourceManager();
    this.mcpServerManager = new MCPServerManager();
    this.mcpHandler = new MCPHandler(this.sourceManager, this.mcpServerManager);
    
    this.setupMiddleware();
    
    this.wss = new WebSocket.Server({
      server: this.app.listen(this.port, () => {
        console.log(`Claude Code MCP Server started on ws://localhost:${this.port}`);
        console.log(`Protocol: Standard MCP (2025-06-18)`);
        console.log(`Transport: WebSocket`);
        console.log(`Methods: initialize, tools/list, tools/call`);
      })
    });

    this.setupWebSocketHandlers();
    this.initialize().catch(console.error);
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        server: 'claude-code-mcp',
        protocol: 'MCP 2025-06-18',
        transport: 'WebSocket'
      });
    });

    this.app.get('/info', (req, res) => {
      res.json({
        name: 'omni-mcp-hub',
        version: '1.0.0',
        protocol: {
          version: '2025-06-18',
          transport: 'websocket',
          methods: this.mcpHandler.getSupportedMethods()
        }
      });
    });
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Claude Code client connected');

      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Received:', JSON.stringify(message, null, 2));
          
          const response = await this.mcpHandler.handleMessage(message);
          console.log('Sending:', JSON.stringify(response, null, 2));
          
          ws.send(JSON.stringify(response));
        } catch (error) {
          console.error('Message handling error:', error);
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal error'
            }
          }));
        }
      });

      ws.on('close', () => {
        console.log('Claude Code client disconnected');
      });

      ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  private async initialize(): Promise<void> {
    try {
      console.log('Initializing source manager...');
      await this.sourceManager.initializeSources();
      
      console.log('Initializing MCP servers...');
      // Initialize MCP servers if configured
      const config = this.configLoader.getConfig();
      if (config.mcp_servers && config.mcp_servers.length > 0) {
        await this.mcpServerManager.initializeServers(config.mcp_servers);
      } else {
        console.log('No MCP servers configured');
      }
      
      console.log('Server initialization complete');
    } catch (error) {
      console.error('Failed to initialize server:', error);
    }
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down Claude Code server...');
    
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });

    await this.mcpServerManager.stopAllServers();
    console.log('Server shutdown complete');
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const port = parseInt(process.env.CLAUDE_CODE_PORT || '3001');
  const server = new ClaudeCodeServer(port);

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await server.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await server.shutdown();
    process.exit(0);
  });
}

export default ClaudeCodeServer;