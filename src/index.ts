#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClaudeConfigManager, ClaudeConfig } from "./utils/claude-config.js";
import { ConfigLoader } from "./config/loader.js";
import { ToolHandlers } from "./tools/handlers.js";
import { ResourceHandlers } from "./resources/handlers.js";
import { BehaviorGenerator } from "./utils/behavior-generator.js";
import { YamlConfigManager } from "./config/yaml-config.js";
import { MCPProxyManager } from "./mcp-proxy/manager.js";
import { PathResolver } from "./utils/path-resolver.js";

export class OmniMCPServer {
  private server: Server;
  private claudeConfigManager: ClaudeConfigManager;
  private activeProfiles: Map<string, ClaudeConfig> = new Map();
  private configLoader: ConfigLoader;
  private toolHandlers: ToolHandlers;
  private resourceHandlers: ResourceHandlers;
  private proxyManager: MCPProxyManager;
  private yamlConfigManager: YamlConfigManager;

  constructor() {
    this.server = new Server(
      {
        name: "omni-mcp-hub",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.claudeConfigManager = new ClaudeConfigManager();
    const pathResolver = PathResolver.getInstance();
    const yamlConfigPath = pathResolver.getAbsoluteYamlConfigPath();
    console.error(`Resolved YAML config path: ${yamlConfigPath}`);

    this.yamlConfigManager = YamlConfigManager.createWithPath(yamlConfigPath);
    this.configLoader = new ConfigLoader(
      this.claudeConfigManager,
      this.yamlConfigManager
    );
    this.proxyManager = new MCPProxyManager(this.yamlConfigManager);
    this.toolHandlers = new ToolHandlers(
      this.server,
      this.claudeConfigManager,
      this.activeProfiles,
      this.proxyManager
    );
    this.resourceHandlers = new ResourceHandlers(
      this.server,
      this.activeProfiles,
      this.proxyManager
    );

    // Don't call initialize here - call it in run() to ensure proper async handling
  }

  /**
   * Initialize the server with handlers and configuration
   */
  private async initialize(): Promise<void> {
    console.error("[INIT] Starting server initialization...");

    // Load YAML configuration first
    console.error("[INIT] Loading YAML configuration...");
    await this.yamlConfigManager.loadYamlConfig();
    console.error("[INIT] YAML configuration loaded");

    console.error("[INIT] Loading initial configuration...");
    await this.loadInitialConfiguration();
    console.error("[INIT] Initial configuration loaded");

    console.error("[INIT] Initializing external servers...");
    await this.initializeExternalServers();
    console.error("[INIT] External servers initialized");

    // Setup handlers AFTER external servers are connected
    console.error("[INIT] Setting up tool handlers...");
    this.toolHandlers.setupHandlers();
    console.error("[INIT] Tool handlers set up");

    console.error("[INIT] Setting up resource handlers...");
    this.resourceHandlers.setupHandlers();
    console.error("[INIT] Resource handlers set up");

    console.error("[INIT] Server initialization complete");
  }

  /**
   * Load initial configuration from .mcp-config.json
   */
  private async loadInitialConfiguration(): Promise<void> {
    try {
      const initialProfiles = await this.configLoader.loadInitialConfig();
      for (const [name, config] of initialProfiles) {
        this.activeProfiles.set(name, config);
      }
    } catch (error) {
      console.error("Failed to load initial configuration:", error);
    }
  }

  /**
   * Initialize external MCP servers from configuration
   */
  private async initializeExternalServers(): Promise<void> {
    try {
      console.error("[EXT-INIT] Delegating external server initialization to MCPProxyManager...");
      await this.proxyManager.initializeFromYamlConfig();

      const connectedServers = this.proxyManager.getConnectedServers();
      console.error(
        `[EXT-INIT] Successfully connected to ${connectedServers.length} external MCP servers`
      );
      console.error(`[EXT-INIT] Connected servers:`, connectedServers);

      // Log aggregated tools
      const aggregatedTools = this.proxyManager.getAggregatedTools();
      console.error(
        `[EXT-INIT] Aggregated tools count: ${aggregatedTools.length}`
      );
      aggregatedTools.forEach((tool, i) => {
        console.error(
          `[EXT-INIT] Tool ${i + 1}: ${tool.name} - ${tool.description}`
        );
      });
    } catch (error) {
      console.error(
        "[EXT-INIT] Failed to initialize external MCP servers:",
        error
      );
    }
  }

  /**
   * Start the MCP server
   */
  async run(): Promise<void> {
    // Initialize everything before starting the server
    await this.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(
      "Omni MCP Hub server with CLAUDE.md support running on stdio"
    );
  }

  // Public methods for testing
  getActiveProfiles(): Map<string, ClaudeConfig> {
    return this.activeProfiles;
  }

  getServer(): Server {
    return this.server;
  }

  generateBehaviorInstructions(config: ClaudeConfig): string {
    return BehaviorGenerator.generateInstructions(config);
  }
}

// Start the server
const server = new OmniMCPServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
