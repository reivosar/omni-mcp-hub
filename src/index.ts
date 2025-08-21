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
import { Logger, ILogger } from "./utils/logger.js";
import { ProcessErrorHandler } from "./utils/process-error-handler.js";

export class OmniMCPServer {
  private server: Server;
  private claudeConfigManager: ClaudeConfigManager;
  private activeProfiles: Map<string, ClaudeConfig> = new Map();
  private configLoader: ConfigLoader;
  private toolHandlers: ToolHandlers;
  private resourceHandlers: ResourceHandlers;
  private proxyManager: MCPProxyManager;
  private yamlConfigManager: YamlConfigManager;
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger || Logger.getInstance();
    
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
    this.logger.debug(`Resolved YAML config path: ${yamlConfigPath}`);

    this.yamlConfigManager = YamlConfigManager.createWithPath(yamlConfigPath, this.logger);
    this.configLoader = new ConfigLoader(
      this.claudeConfigManager,
      this.yamlConfigManager,
      this.logger
    );
    this.proxyManager = new MCPProxyManager(this.yamlConfigManager, this.logger);
    this.toolHandlers = new ToolHandlers(
      this.server,
      this.claudeConfigManager,
      this.activeProfiles,
      this.proxyManager,
      this.logger
    );
    this.resourceHandlers = new ResourceHandlers(
      this.server,
      this.activeProfiles,
      this.proxyManager,
      this.logger
    );

    // Don't call initialize here - call it in run() to ensure proper async handling
  }

  /**
   * Initialize the server with handlers and configuration
   */
  private async initialize(): Promise<void> {
    this.logger.info("[INIT] Starting server initialization...");

    // Note: YAML config is loaded by configLoader.loadInitialConfig()
    // No need to load it separately here
    
    this.logger.info("[INIT] Loading initial configuration and autoLoad profiles...");
    await this.loadInitialConfiguration();
    this.logger.info("[INIT] Initial configuration loaded");

    this.logger.debug("[INIT] Initializing external servers...");
    await this.initializeExternalServers();
    this.logger.debug("[INIT] External servers initialized");

    this.logger.debug("[INIT] Starting health checks...");
    this.proxyManager.startHealthChecks(30000);
    this.logger.debug("[INIT] Health checks started");

    // Setup tools changed notification
    this.logger.debug("[INIT] Setting up tools changed notification...");
    this.proxyManager.on('toolsChanged', () => {
      this.logger.info("[NOTIFY] Tools changed - would send notifications/tools/list_changed");
      // TODO: Implement proper MCP notification when transport is available
    });
    this.logger.debug("[INIT] Tools changed notification set up");

    // Setup handlers AFTER external servers are connected
    this.logger.debug("[INIT] Setting up tool handlers...");
    this.toolHandlers.setupHandlers();
    this.logger.debug("[INIT] Tool handlers set up");

    this.logger.debug("[INIT] Setting up resource handlers...");
    this.resourceHandlers.setupHandlers();
    this.logger.debug("[INIT] Resource handlers set up");

    this.logger.info("[INIT] Server initialization complete");
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
      this.logger.error("Failed to load initial configuration:", error);
    }
  }

  /**
   * Initialize external MCP servers from configuration
   */
  private async initializeExternalServers(): Promise<void> {
    try {
      this.logger.debug("[EXT-INIT] Delegating external server initialization to MCPProxyManager...");
      await this.proxyManager.initializeFromYamlConfig();

      const connectedServers = this.proxyManager.getConnectedServers();
      this.logger.info(
        `[EXT-INIT] Successfully connected to ${connectedServers.length} external MCP servers`
      );
      this.logger.debug(`[EXT-INIT] Connected servers:`, connectedServers);

      // Log aggregated tools
      const aggregatedTools = this.proxyManager.getAggregatedTools();
      this.logger.info(
        `[EXT-INIT] Aggregated tools count: ${aggregatedTools.length}`
      );
      aggregatedTools.forEach((tool, i) => {
        this.logger.debug(
          `[EXT-INIT] Tool ${i + 1}: ${tool.name} - ${tool.description}`
        );
      });
    } catch (error) {
      this.logger.error(
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
    this.logger.info(
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

  cleanup(): void {
    this.logger.info('[CLEANUP] Starting server cleanup...');
    
    try {
      this.proxyManager.stopHealthChecks();
      this.proxyManager.disconnectAll();
      this.logger.info('[CLEANUP] Server cleanup completed');
    } catch (error) {
      this.logger.error('[CLEANUP] Error during cleanup:', error);
    }
  }
}

// Setup process-level error handling first
const logger = Logger.getInstance();

// Start the server
const server = new OmniMCPServer();

// Only set up process error handler in production
if (process.env.NODE_ENV !== 'test') {
  const processErrorHandler = new ProcessErrorHandler(logger, process);
  processErrorHandler.setupGlobalErrorHandlers();
  
  // Start metrics collection
  const _metricsInterval = processErrorHandler.startMetricsCollection(60000);
  
  // Clean up on shutdown
  process.on('beforeExit', () => {
    processErrorHandler.stopMetricsCollection();
    server.cleanup();
  });
}

server.run().catch((error) => {
  logger.error("Server startup error:", error);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
});
