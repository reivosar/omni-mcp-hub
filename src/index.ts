#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClaudeConfigManager, ClaudeConfig } from "./utils/claude-config.js";
import { ConfigLoader } from "./config/loader.js";
import { ToolHandlers } from "./tools/handlers.js";
import { ResourceHandlers } from "./resources/handlers.js";
import { BehaviorGenerator } from "./utils/behavior-generator.js";
import { YamlConfigManager } from "./config/yaml-config.js";

export class OmniMCPServer {
  private server: Server;
  private claudeConfigManager: ClaudeConfigManager;
  private activeProfiles: Map<string, ClaudeConfig> = new Map();
  private configLoader: ConfigLoader;
  private toolHandlers: ToolHandlers;
  private resourceHandlers: ResourceHandlers;

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
    // Determine correct path based on working directory
    const isInExamplesDir = process.cwd().endsWith('/examples');
    const yamlConfigPath = isInExamplesDir ? './omni-config.yaml' : './examples/omni-config.yaml';
    const yamlConfigManager = YamlConfigManager.createWithPath(yamlConfigPath);
    this.configLoader = new ConfigLoader(this.claudeConfigManager, yamlConfigManager);
    this.toolHandlers = new ToolHandlers(this.server, this.claudeConfigManager, this.activeProfiles);
    this.resourceHandlers = new ResourceHandlers(this.server, this.activeProfiles);

    this.initialize();
  }

  /**
   * Initialize the server with handlers and configuration
   */
  private async initialize(): Promise<void> {
    this.toolHandlers.setupHandlers();
    this.resourceHandlers.setupHandlers();
    await this.loadInitialConfiguration();
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
   * Start the MCP server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Omni MCP Hub server with CLAUDE.md support running on stdio");
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