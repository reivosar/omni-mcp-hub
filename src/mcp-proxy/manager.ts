import { MCPProxyClient, ExternalServerConfig } from "./client.js";
import { Tool, Resource, CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { YamlConfigManager } from "../config/yaml-config.js";
import { ILogger, SilentLogger } from "../utils/logger.js";
import { ErrorHandler } from "../utils/error-handler.js";

export class MCPProxyManager {
  private clients: Map<string, MCPProxyClient> = new Map();
  private aggregatedTools: Map<string, { client: MCPProxyClient; tool: Tool }> = new Map();
  private aggregatedResources: Map<string, { client: MCPProxyClient; resource: Resource }> = new Map();
  private yamlConfigManager?: YamlConfigManager;
  private logger: ILogger;
  private errorHandler: ErrorHandler;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(yamlConfigManager?: YamlConfigManager, logger?: ILogger) {
    this.yamlConfigManager = yamlConfigManager;
    this.logger = logger || new SilentLogger();
    this.errorHandler = ErrorHandler.getInstance(this.logger);
  }

  async addServer(config: ExternalServerConfig): Promise<void> {
    this.logger.debug(`[PROXY-MGR] Adding server: ${config.name}`);
    
    if (this.clients.has(config.name)) {
      this.logger.debug(`[PROXY-MGR] Server ${config.name} already exists`);
      return;
    }

    this.logger.debug(`[PROXY-MGR] Creating MCPProxyClient for ${config.name}`);
    const client = new MCPProxyClient(config, this.logger);
    
    try {
      this.logger.debug(`[PROXY-MGR] Connecting client for ${config.name}...`);
      await client.connect();
      this.logger.debug(`[PROXY-MGR] Client connected for ${config.name}`);
      
      this.clients.set(config.name, client);
      this.logger.debug(`[PROXY-MGR] Client stored for ${config.name}`);
      
      // Update aggregated tools and resources
      this.logger.debug(`[PROXY-MGR] Updating aggregated capabilities...`);
      this.updateAggregatedCapabilities();
      this.logger.debug(`[PROXY-MGR] Aggregated capabilities updated`);
      
      this.logger.debug(`[PROXY-MGR] Successfully added MCP server: ${config.name}`);
    } catch (error) {
      this.logger.debug(`[PROXY-MGR] Failed to add MCP server ${config.name}:`, error);
      throw error;
    }
  }

  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) {
      this.logger.debug(`Server ${name} not found`);
      return;
    }

    await client.disconnect();
    this.clients.delete(name);
    
    // Update aggregated capabilities
    this.updateAggregatedCapabilities();
    
    this.logger.debug(`Removed MCP server: ${name}`);
  }

  private updateAggregatedCapabilities(): void {
    this.logger.debug(`[PROXY-MGR] Starting capability aggregation...`);
    
    // Clear existing aggregations
    this.aggregatedTools.clear();
    this.aggregatedResources.clear();
    this.logger.debug(`[PROXY-MGR] Cleared existing aggregations`);

    this.logger.debug(`[PROXY-MGR] Processing ${this.clients.size} clients`);

    // Aggregate tools and resources from all connected clients
    for (const [serverName, client] of this.clients) {
      this.logger.debug(`[PROXY-MGR] Processing server: ${serverName}`);
      this.logger.debug(`[PROXY-MGR] Server ${serverName} connected: ${client.isConnected()}`);
      
      if (!client.isConnected()) {
        this.logger.debug(`[PROXY-MGR] Skipping disconnected server: ${serverName}`);
        continue;
      }

      // Aggregate tools
      const tools = client.getTools();
      this.logger.debug(`[PROXY-MGR] Server ${serverName} has ${tools.length} tools`);
      
      for (const tool of tools) {
        this.logger.debug(`[PROXY-MGR] Adding tool: ${tool.name} from ${serverName}`);
        this.aggregatedTools.set(tool.name, { client, tool });
      }

      // Aggregate resources
      const resources = client.getResources();
      this.logger.debug(`[PROXY-MGR] Server ${serverName} has ${resources.length} resources`);
      
      for (const resource of resources) {
        this.logger.debug(`[PROXY-MGR] Adding resource: ${resource.uri} from ${serverName}`);
        this.aggregatedResources.set(resource.uri, { client, resource });
      }
    }

    this.logger.debug(`[PROXY-MGR] Aggregated ${this.aggregatedTools.size} tools and ${this.aggregatedResources.size} resources from ${this.clients.size} servers`);
    
    // Log all aggregated tools
    this.logger.debug(`[PROXY-MGR] Final aggregated tools:`);
    for (const [name, entry] of this.aggregatedTools) {
      this.logger.debug(`[PROXY-MGR] - ${name}: ${entry.tool.description}`);
    }
  }

  getAggregatedTools(): Tool[] {
    return Array.from(this.aggregatedTools.values()).map(entry => entry.tool);
  }

  getAggregatedResources(): Resource[] {
    return Array.from(this.aggregatedResources.values()).map(entry => entry.resource);
  }

  async callTool(name: string, args: unknown): Promise<CallToolResult> {
    const entry = this.aggregatedTools.get(name);
    if (!entry) {
      throw new Error(`Tool ${name} not found in any connected MCP server`);
    }

    return this.errorHandler.withErrorHandling(
      () => entry.client.callTool(name, args),
      {
        operation: 'external_tool_call',
        toolName: name,
        serverName: entry.client.getServerName(),
        args,
      }
    );
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    const entry = this.aggregatedResources.get(uri);
    if (!entry) {
      throw new Error(`Resource ${uri} not found in any connected MCP server`);
    }

    return this.errorHandler.withErrorHandling(
      () => entry.client.readResource(uri),
      {
        operation: 'external_resource_read',
        resourceUri: uri,
        serverName: entry.client.getServerName(),
      }
    );
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys()).filter(name => {
      const client = this.clients.get(name);
      return client && client.isConnected();
    });
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.values()).map(client => 
      client.disconnect()
    );
    
    await Promise.all(disconnectPromises);
    this.clients.clear();
    this.aggregatedTools.clear();
    this.aggregatedResources.clear();
    
    this.logger.debug("Disconnected from all MCP servers");
  }

  getServerStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [name, client] of this.clients) {
      status[name] = client.isConnected();
    }
    return status;
  }

  async connectAll(): Promise<void> {
    const connectPromises = Array.from(this.clients.values()).map(client => 
      client.connect().catch(error => {
        this.logger.debug(`Failed to connect client ${client.getServerName()}:`, error);
        throw error;
      })
    );
    
    await Promise.all(connectPromises);
    this.updateAggregatedCapabilities();
  }

  async aggregateTools(): Promise<Tool[]> {
    return this.getAggregatedTools();
  }

  async aggregateResources(): Promise<Resource[]> {
    return this.getAggregatedResources();
  }

  async initializeFromYamlConfig(): Promise<void> {
    if (!this.yamlConfigManager) {
      this.logger.debug("[PROXY-MGR] No YAML config manager available");
      return;
    }

    try {
      const config = this.yamlConfigManager.getConfig();
      const externalServers = config?.externalServers;

      if (!externalServers?.enabled) {
        this.logger.debug("[PROXY-MGR] External MCP servers are disabled in configuration");
        return;
      }

      if (!externalServers.servers || externalServers.servers.length === 0) {
        this.logger.debug("[PROXY-MGR] No external MCP servers configured");
        return;
      }

      this.logger.debug(`[PROXY-MGR] Initializing ${externalServers.servers.length} external MCP servers...`);

      for (const serverConfig of externalServers.servers) {
        try {
          this.logger.debug(`[PROXY-MGR] Adding external MCP server: ${serverConfig.name}`);
          await this.addServer(serverConfig);
        } catch (error) {
          this.logger.debug(`[PROXY-MGR] Failed to add external MCP server ${serverConfig.name}:`, error);
          if (!externalServers.autoConnect) {
            // Continue with other servers instead of throwing
            continue;
          }
        }
      }

      this.logger.debug("[PROXY-MGR] External MCP servers initialization complete");
    } catch (error) {
      this.logger.debug("[PROXY-MGR] Error during external servers initialization:", error);
    }
  }

  startHealthChecks(intervalMs: number = 30000): void {
    this.logger.info(`[PROXY-MGR] Starting health checks (interval: ${intervalMs}ms)`);
    
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, intervalMs);
  }

  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.info('[PROXY-MGR] Health checks stopped');
    }
  }

  async performHealthCheck(): Promise<Map<string, boolean>> {
    const healthStatus = new Map<string, boolean>();
    
    for (const [serverName, client] of this.clients) {
      try {
        const isHealthy = client.isConnected();
        healthStatus.set(serverName, isHealthy);
        
        if (!isHealthy) {
          this.logger.warn(`[HEALTH-CHECK] Server ${serverName} is not connected`);
          
          // Attempt to reconnect
          try {
            await client.connect();
            this.logger.info(`[HEALTH-CHECK] Successfully reconnected to ${serverName}`);
            healthStatus.set(serverName, true);
            this.updateAggregatedCapabilities();
          } catch (reconnectError) {
            this.logger.error(`[HEALTH-CHECK] Failed to reconnect to ${serverName}:`, reconnectError);
          }
        }
      } catch (error) {
        this.logger.error(`[HEALTH-CHECK] Error checking ${serverName}:`, error);
        healthStatus.set(serverName, false);
      }
    }

    // Log health metrics
    const healthMetrics = {
      type: 'mcp_health_check',
      timestamp: new Date().toISOString(),
      total_servers: this.clients.size,
      healthy_servers: Array.from(healthStatus.values()).filter(Boolean).length,
      unhealthy_servers: Array.from(healthStatus.values()).filter(h => !h).length,
      server_status: Object.fromEntries(healthStatus),
    };

    this.logger.info('[HEALTH-METRICS]', JSON.stringify(healthMetrics));
    
    return healthStatus;
  }

  getHealthStatus(): Record<string, { connected: boolean; tools: number; resources: number }> {
    const status: Record<string, { connected: boolean; tools: number; resources: number }> = {};
    
    for (const [serverName, client] of this.clients) {
      status[serverName] = {
        connected: client.isConnected(),
        tools: client.getTools().length,
        resources: client.getResources().length,
      };
    }
    
    return status;
  }

  async getDetailedServerHealth(): Promise<Record<string, unknown>> {
    const healthDetails: Record<string, unknown> = {};
    
    for (const [serverName, client] of this.clients) {
      try {
        const startTime = Date.now();
        const isConnected = client.isConnected();
        const responseTime = Date.now() - startTime;
        
        healthDetails[serverName] = {
          connected: isConnected,
          response_time_ms: responseTime,
          tools_count: client.getTools().length,
          resources_count: client.getResources().length,
          last_check: new Date().toISOString(),
        };
      } catch (error) {
        healthDetails[serverName] = {
          connected: false,
          error: error instanceof Error ? error.message : String(error),
          last_check: new Date().toISOString(),
        };
      }
    }
    
    return healthDetails;
  }
}