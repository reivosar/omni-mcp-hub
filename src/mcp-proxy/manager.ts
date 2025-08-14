import { MCPProxyClient, ExternalServerConfig } from "./client.js";
import { Tool, Resource, CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { YamlConfigManager } from "../config/yaml-config.js";

export class MCPProxyManager {
  private clients: Map<string, MCPProxyClient> = new Map();
  private aggregatedTools: Map<string, { client: MCPProxyClient; tool: Tool }> = new Map();
  private aggregatedResources: Map<string, { client: MCPProxyClient; resource: Resource }> = new Map();
  private yamlConfigManager?: YamlConfigManager;

  constructor(yamlConfigManager?: YamlConfigManager) {
    this.yamlConfigManager = yamlConfigManager;
  }

  async addServer(config: ExternalServerConfig): Promise<void> {
    console.error(`[PROXY-MGR] Adding server: ${config.name}`);
    
    if (this.clients.has(config.name)) {
      console.error(`[PROXY-MGR] Server ${config.name} already exists`);
      return;
    }

    console.error(`[PROXY-MGR] Creating MCPProxyClient for ${config.name}`);
    const client = new MCPProxyClient(config);
    
    try {
      console.error(`[PROXY-MGR] Connecting client for ${config.name}...`);
      await client.connect();
      console.error(`[PROXY-MGR] Client connected for ${config.name}`);
      
      this.clients.set(config.name, client);
      console.error(`[PROXY-MGR] Client stored for ${config.name}`);
      
      // Update aggregated tools and resources
      console.error(`[PROXY-MGR] Updating aggregated capabilities...`);
      this.updateAggregatedCapabilities();
      console.error(`[PROXY-MGR] Aggregated capabilities updated`);
      
      console.error(`[PROXY-MGR] Successfully added MCP server: ${config.name}`);
    } catch (error) {
      console.error(`[PROXY-MGR] Failed to add MCP server ${config.name}:`, error);
      throw error;
    }
  }

  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) {
      console.error(`Server ${name} not found`);
      return;
    }

    await client.disconnect();
    this.clients.delete(name);
    
    // Update aggregated capabilities
    this.updateAggregatedCapabilities();
    
    console.error(`Removed MCP server: ${name}`);
  }

  private updateAggregatedCapabilities(): void {
    console.error(`[PROXY-MGR] Starting capability aggregation...`);
    
    // Clear existing aggregations
    this.aggregatedTools.clear();
    this.aggregatedResources.clear();
    console.error(`[PROXY-MGR] Cleared existing aggregations`);

    console.error(`[PROXY-MGR] Processing ${this.clients.size} clients`);

    // Aggregate tools and resources from all connected clients
    for (const [serverName, client] of this.clients) {
      console.error(`[PROXY-MGR] Processing server: ${serverName}`);
      console.error(`[PROXY-MGR] Server ${serverName} connected: ${client.isConnected()}`);
      
      if (!client.isConnected()) {
        console.error(`[PROXY-MGR] Skipping disconnected server: ${serverName}`);
        continue;
      }

      // Aggregate tools
      const tools = client.getTools();
      console.error(`[PROXY-MGR] Server ${serverName} has ${tools.length} tools`);
      
      for (const tool of tools) {
        console.error(`[PROXY-MGR] Adding tool: ${tool.name} from ${serverName}`);
        this.aggregatedTools.set(tool.name, { client, tool });
      }

      // Aggregate resources
      const resources = client.getResources();
      console.error(`[PROXY-MGR] Server ${serverName} has ${resources.length} resources`);
      
      for (const resource of resources) {
        console.error(`[PROXY-MGR] Adding resource: ${resource.uri} from ${serverName}`);
        this.aggregatedResources.set(resource.uri, { client, resource });
      }
    }

    console.error(`[PROXY-MGR] Aggregated ${this.aggregatedTools.size} tools and ${this.aggregatedResources.size} resources from ${this.clients.size} servers`);
    
    // Log all aggregated tools
    console.error(`[PROXY-MGR] Final aggregated tools:`);
    for (const [name, entry] of this.aggregatedTools) {
      console.error(`[PROXY-MGR] - ${name}: ${entry.tool.description}`);
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

    return entry.client.callTool(name, args);
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    const entry = this.aggregatedResources.get(uri);
    if (!entry) {
      throw new Error(`Resource ${uri} not found in any connected MCP server`);
    }

    return entry.client.readResource(uri);
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
    
    console.error("Disconnected from all MCP servers");
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
        console.error(`Failed to connect client ${client.getServerName()}:`, error);
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
      console.error("[PROXY-MGR] No YAML config manager available");
      return;
    }

    try {
      const config = this.yamlConfigManager.getConfig();
      const externalServers = config?.externalServers;

      if (!externalServers?.enabled) {
        console.error("[PROXY-MGR] External MCP servers are disabled in configuration");
        return;
      }

      if (!externalServers.servers || externalServers.servers.length === 0) {
        console.error("[PROXY-MGR] No external MCP servers configured");
        return;
      }

      console.error(`[PROXY-MGR] Initializing ${externalServers.servers.length} external MCP servers...`);

      for (const serverConfig of externalServers.servers) {
        try {
          console.error(`[PROXY-MGR] Adding external MCP server: ${serverConfig.name}`);
          await this.addServer(serverConfig);
        } catch (error) {
          console.error(`[PROXY-MGR] Failed to add external MCP server ${serverConfig.name}:`, error);
          if (!externalServers.autoConnect) {
            // Continue with other servers instead of throwing
            continue;
          }
        }
      }

      console.error("[PROXY-MGR] External MCP servers initialization complete");
    } catch (error) {
      console.error("[PROXY-MGR] Error during external servers initialization:", error);
    }
  }
}