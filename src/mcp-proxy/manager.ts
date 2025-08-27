import { MCPProxyClient, ExternalServerConfig } from "./client.js";
import {
  Tool,
  Resource,
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { YamlConfigManager } from "../config/yaml-config.js";
import { ILogger, SilentLogger } from "../utils/logger.js";
import { ErrorHandler } from "../utils/error-handler.js";
import { EventEmitter } from "events";
import { exec } from "child_process";
import { promisify } from "util";

export class MCPProxyManager extends EventEmitter {
  private clients: Map<string, MCPProxyClient> = new Map();
  private aggregatedTools: Map<string, { client: MCPProxyClient; tool: Tool }> =
    new Map();
  private aggregatedResources: Map<
    string,
    { client: MCPProxyClient; resource: Resource }
  > = new Map();
  private yamlConfigManager?: YamlConfigManager;
  private logger: ILogger;
  private errorHandler: ErrorHandler;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(yamlConfigManager?: YamlConfigManager, logger?: ILogger) {
    super();
    this.yamlConfigManager = yamlConfigManager;
    this.logger = logger || new SilentLogger();
    this.errorHandler = ErrorHandler.getInstance(this.logger);
  }

  async addServer(config: ExternalServerConfig): Promise<void> {
    this.logger.info(`[PROXY-MGR] Adding server: ${config.name}`);

    if (this.clients.has(config.name)) {
      this.logger.info(`[PROXY-MGR] Server ${config.name} already exists`);
      return;
    }

    await this.ensureServerDependencies(config);

    this.logger.info(`[PROXY-MGR] Creating MCPProxyClient for ${config.name}`);
    const client = new MCPProxyClient(config, this.logger);

    try {
      this.logger.info(`[PROXY-MGR] Connecting client for ${config.name}...`);
      await client.connect();
      this.logger.info(`[PROXY-MGR] Client connected for ${config.name}`);

      this.clients.set(config.name, client);
      this.logger.info(`[PROXY-MGR] Client stored for ${config.name}`);

      this.logger.info(`[PROXY-MGR] Updating aggregated capabilities...`);
      this.updateAggregatedCapabilities();
      this.logger.info(`[PROXY-MGR] Aggregated capabilities updated`);

      this.logger.info(
        `[PROXY-MGR] Successfully added MCP server: ${config.name}`,
      );
    } catch (error) {
      this.logger.info(
        `[PROXY-MGR] Failed to add MCP server ${config.name}:`,
        error,
      );
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

    this.updateAggregatedCapabilities();

    this.logger.debug(`Removed MCP server: ${name}`);
  }

  private async ensureServerDependencies(
    config: ExternalServerConfig,
  ): Promise<void> {
    const execAsync = promisify(exec);

    if (
      config.command === "uvx" &&
      config.args?.includes("git+https://github.com/oraios/serena")
    ) {
      this.logger.info(`[PROXY-MGR] Detected Serena server: ${config.name}`);

      try {
        await execAsync("uv --version");
        this.logger.info(`[PROXY-MGR] uv is already installed`);
      } catch (_error) {
        this.logger.info(
          `[PROXY-MGR] uv not found, installing automatically...`,
        );

        try {
          await execAsync("curl -LsSf https://astral.sh/uv/install.sh | sh");
          this.logger.info(`[PROXY-MGR] uv installed successfully`);

          process.env.PATH = `${process.env.HOME}/.cargo/bin:${process.env.PATH}`;

          await execAsync("uv --version");
          this.logger.info(`[PROXY-MGR] uv verification successful`);
        } catch (installError) {
          this.logger.error(`[PROXY-MGR] Failed to install uv:`, installError);
          throw new Error(
            `Failed to install uv dependency for ${config.name}. Please install manually: curl -LsSf https://astral.sh/uv/install.sh | sh`,
          );
        }
      }

      try {
        this.logger.info(`[PROXY-MGR] Pre-downloading Serena...`);
        await execAsync(
          "uvx --from git+https://github.com/oraios/serena serena --version",
          { timeout: 30000 },
        );
        this.logger.info(`[PROXY-MGR] Serena pre-download completed`);
      } catch (error) {
        this.logger.warn(
          `[PROXY-MGR] Serena pre-download failed (will be downloaded on first use):`,
          error,
        );
      }
    }
  }

  private updateAggregatedCapabilities(): void {
    this.logger.info(`[PROXY-MGR] Starting capability aggregation...`);

    this.aggregatedTools.clear();
    this.aggregatedResources.clear();
    this.logger.info(`[PROXY-MGR] Cleared existing aggregations`);

    this.logger.info(`[PROXY-MGR] Processing ${this.clients.size} clients`);

    for (const [serverName, client] of this.clients) {
      this.logger.info(`[PROXY-MGR] Processing server: ${serverName}`);
      this.logger.info(
        `[PROXY-MGR] Server ${serverName} connected: ${client.isConnected()}`,
      );

      if (!client.isConnected()) {
        this.logger.info(
          `[PROXY-MGR] Skipping disconnected server: ${serverName}`,
        );
        continue;
      }

      const tools = client.getTools();
      this.logger.info(
        `[PROXY-MGR] Server ${serverName} has ${tools.length} tools`,
      );

      for (const tool of tools) {
        this.logger.info(
          `[PROXY-MGR] Adding tool: ${tool.name} from ${serverName}`,
        );
        this.aggregatedTools.set(tool.name, { client, tool });
      }

      const resources = client.getResources();
      this.logger.info(
        `[PROXY-MGR] Server ${serverName} has ${resources.length} resources`,
      );

      for (const resource of resources) {
        this.logger.info(
          `[PROXY-MGR] Adding resource: ${resource.uri} from ${serverName}`,
        );
        this.aggregatedResources.set(resource.uri, { client, resource });
      }
    }

    this.logger.info(
      `[PROXY-MGR] Aggregated ${this.aggregatedTools.size} tools and ${this.aggregatedResources.size} resources from ${this.clients.size} servers`,
    );

    this.logger.info(`[PROXY-MGR] Final aggregated tools:`);
    for (const [name, entry] of this.aggregatedTools) {
      this.logger.info(`[PROXY-MGR] - ${name}: ${entry.tool.description}`);
    }

    this.emit("toolsChanged");
    this.logger.info(`[PROXY-MGR] Emitted toolsChanged event`);
  }

  getAggregatedTools(): Tool[] {
    return Array.from(this.aggregatedTools.values()).map((entry) => entry.tool);
  }

  getAggregatedResources(): Resource[] {
    return Array.from(this.aggregatedResources.values()).map(
      (entry) => entry.resource,
    );
  }

  async callTool(name: string, args: unknown): Promise<CallToolResult> {
    const entry = this.aggregatedTools.get(name);
    if (!entry) {
      throw new Error(`Tool ${name} not found in any connected MCP server`);
    }

    return this.errorHandler.withErrorHandling(
      () => entry.client.callTool(name, args),
      {
        operation: "external_tool_call",
        toolName: name,
        serverName: entry.client.getServerName(),
        args,
      },
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
        operation: "external_resource_read",
        resourceUri: uri,
        serverName: entry.client.getServerName(),
      },
    );
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys()).filter((name) => {
      const client = this.clients.get(name);
      return client && client.isConnected();
    });
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.values()).map((client) =>
      client.disconnect(),
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
    const connectPromises = Array.from(this.clients.values()).map((client) =>
      client.connect().catch((error) => {
        this.logger.debug(
          `Failed to connect client ${client.getServerName()}:`,
          error,
        );
        throw error;
      }),
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
      this.logger.info("[PROXY-MGR] No YAML config manager available");
      return;
    }

    try {
      this.logger.info("[PROXY-MGR] Loading YAML configuration...");

      await this.yamlConfigManager.loadYamlConfig();
      const config = this.yamlConfigManager.getConfig();
      this.logger.info(
        "[PROXY-MGR] Raw config object:",
        JSON.stringify(config, null, 2),
      );

      const externalServers = config?.externalServers;
      this.logger.info(
        "[PROXY-MGR] External servers section:",
        JSON.stringify(externalServers, null, 2),
      );

      if (!externalServers) {
        this.logger.error(
          "[PROXY-MGR] No externalServers section found in config",
        );
        return;
      }

      if (!externalServers.enabled) {
        this.logger.info(
          "[PROXY-MGR] External MCP servers are disabled in configuration",
        );
        return;
      }

      if (!externalServers.servers) {
        this.logger.error(
          "[PROXY-MGR] No servers array found in externalServers",
        );
        return;
      }

      if (externalServers.servers.length === 0) {
        this.logger.info("[PROXY-MGR] Empty servers array in configuration");
        return;
      }

      this.logger.info(
        `[PROXY-MGR] Found ${externalServers.servers.length} external servers in config`,
      );

      for (const serverConfig of externalServers.servers) {
        try {
          this.logger.info(
            `[PROXY-MGR] Processing server config:`,
            JSON.stringify(serverConfig, null, 2),
          );
          await this.addServer(serverConfig);
          this.logger.info(
            `[PROXY-MGR] Successfully added server: ${serverConfig.name}`,
          );
        } catch (error) {
          this.logger.error(
            `[PROXY-MGR] Failed to add external MCP server ${serverConfig.name}:`,
            error,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        "[PROXY-MGR] Failed to initialize from YAML config:",
        error,
      );
    }
  }

  startHealthChecks(intervalMs: number = 30000): void {
    this.logger.info(
      `[PROXY-MGR] Starting health checks (interval: ${intervalMs}ms)`,
    );

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, intervalMs);
  }

  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.info("[PROXY-MGR] Health checks stopped");
    }
  }

  async performHealthCheck(): Promise<Map<string, boolean>> {
    const healthStatus = new Map<string, boolean>();

    for (const [serverName, client] of this.clients) {
      try {
        const isHealthy = client.isConnected();
        healthStatus.set(serverName, isHealthy);

        if (!isHealthy) {
          this.logger.warn(
            `[HEALTH-CHECK] Server ${serverName} is not connected`,
          );

          try {
            await client.connect();
            this.logger.info(
              `[HEALTH-CHECK] Successfully reconnected to ${serverName}`,
            );
            healthStatus.set(serverName, true);
            this.updateAggregatedCapabilities();
          } catch (reconnectError) {
            this.logger.error(
              `[HEALTH-CHECK] Failed to reconnect to ${serverName}:`,
              reconnectError,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `[HEALTH-CHECK] Error checking ${serverName}:`,
          error,
        );
        healthStatus.set(serverName, false);
      }
    }

    const healthMetrics = {
      type: "mcp_health_check",
      timestamp: new Date().toISOString(),
      total_servers: this.clients.size,
      healthy_servers: Array.from(healthStatus.values()).filter(Boolean).length,
      unhealthy_servers: Array.from(healthStatus.values()).filter((h) => !h)
        .length,
      server_status: Object.fromEntries(healthStatus),
    };

    this.logger.info("[HEALTH-METRICS]", JSON.stringify(healthMetrics));

    return healthStatus;
  }

  getHealthStatus(): Record<
    string,
    { connected: boolean; tools: number; resources: number }
  > {
    const status: Record<
      string,
      { connected: boolean; tools: number; resources: number }
    > = {};

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
