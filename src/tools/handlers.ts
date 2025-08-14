import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as path from 'path';
import { ClaudeConfigManager, ClaudeConfig } from "../utils/claude-config.js";
import { BehaviorGenerator } from "../utils/behavior-generator.js";
import { FileScanner } from "../utils/file-scanner.js";
import { YamlConfigManager } from "../config/yaml-config.js";
import { PathResolver } from "../utils/path-resolver.js";
import { MCPProxyManager } from "../mcp-proxy/manager.js";
import { ILogger, SilentLogger } from "../utils/logger.js";

export class ToolHandlers {
  private server: Server;
  private claudeConfigManager: ClaudeConfigManager;
  private activeProfiles: Map<string, ClaudeConfig>;
  private fileScanner: FileScanner;
  private lastAppliedProfile: string | null = null;
  private lastAppliedTime: string | null = null;
  private proxyManager?: MCPProxyManager;
  private logger: ILogger;

  constructor(
    server: Server,
    claudeConfigManager: ClaudeConfigManager,
    activeProfiles: Map<string, ClaudeConfig>,
    proxyManagerOrFileScanner?: MCPProxyManager | FileScanner,
    logger?: ILogger
  ) {
    this.server = server;
    this.claudeConfigManager = claudeConfigManager;
    this.activeProfiles = activeProfiles;
    this.logger = logger || new SilentLogger();
    
    const pathResolver = PathResolver.getInstance();
    const yamlConfigPath = pathResolver.getYamlConfigPath();
    
    // Handle both old and new constructor signatures
    if (proxyManagerOrFileScanner && 'addServer' in proxyManagerOrFileScanner) {
      // New signature with MCPProxyManager
      this.proxyManager = proxyManagerOrFileScanner;
      this.fileScanner = new FileScanner(YamlConfigManager.createWithPath(yamlConfigPath, this.logger), this.logger);
    } else {
      // Old signature with FileScanner
      this.fileScanner = proxyManagerOrFileScanner || new FileScanner(YamlConfigManager.createWithPath(yamlConfigPath, this.logger), this.logger);
    }
  }


  /**
   * Setup all tool handlers
   */
  setupHandlers(): void {
    this.setupListToolsHandler();
    this.setupCallToolHandler();
  }

  /**
   * Setup the list tools handler
   */
  private setupListToolsHandler(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug("[TOOL-HANDLER] Processing tools/list request");
      
      // Get base tools
      const baseTools = [
        // CLAUDE.md management tools
          {
            name: "apply_claude_config",
            description: "Load and activate a CLAUDE.md configuration file",
            inputSchema: {
              type: "object",
              properties: {
                filePath: { 
                  type: "string", 
                  description: "Path to the CLAUDE.md file to load" 
                },
                profileName: { 
                  type: "string", 
                  description: "Optional profile name for this configuration" 
                },
                autoApply: {
                  type: "boolean",
                  description: "Automatically apply the configuration after loading (default: true)"
                },
              },
              required: [],
            },
          },
          {
            name: "list_claude_configs",
            description: "List all CLAUDE.md configuration files (both loaded and available)",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "get_applied_config",
            description: "Get information about the currently applied configuration",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        ];

      this.logger.debug(`[TOOL-HANDLER] Base tools count: ${baseTools.length}`);
      baseTools.forEach((tool, i) => {
        this.logger.debug(`[TOOL-HANDLER] Base tool ${i+1}: ${tool.name}`);
      });

      // Add proxied tools from external MCP servers
      let aggregatedTools: any[] = [...baseTools];
      this.logger.debug(`[TOOL-HANDLER] Checking proxy manager: ${this.proxyManager ? 'exists' : 'null'}`);
      
      if (this.proxyManager) {
        this.logger.debug(`[TOOL-HANDLER] Getting external tools from proxy manager...`);
        this.logger.debug(`[TOOL-HANDLER] Proxy manager connected servers:`, this.proxyManager.getConnectedServers());
        
        const externalTools = this.proxyManager.getAggregatedTools();
        this.logger.debug(`[TOOL-HANDLER] External tools count: ${externalTools.length}`);
        
        if (externalTools.length === 0) {
          this.logger.debug(`[TOOL-HANDLER] WARNING: No external tools found - checking proxy manager state...`);
          this.logger.debug(`[TOOL-HANDLER] Proxy manager has ${this.proxyManager.getConnectedServers().length} connected servers`);
        }
        
        externalTools.forEach((tool, i) => {
          this.logger.debug(`[TOOL-HANDLER] External tool ${i+1}: ${tool.name} - ${tool.description}`);
        });
        
        aggregatedTools = [...aggregatedTools, ...externalTools];
        this.logger.debug(`[TOOL-HANDLER] Total aggregated tools count: ${aggregatedTools.length}`);
      } else {
        this.logger.debug(`[TOOL-HANDLER] No proxy manager available - returning base tools only`);
      }

      this.logger.debug(`[TOOL-HANDLER] Final tools being returned:`);
      aggregatedTools.forEach((tool, i) => {
        this.logger.debug(`[TOOL-HANDLER] Final tool ${i+1}: ${tool.name}`);
      });

      return {
        tools: aggregatedTools,
      };
    });
  }

  /**
   * Setup the call tool handler
   */
  private setupCallToolHandler(): void {
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "apply_claude_config":
          return this.handleApplyClaudeConfig(args);
        
        
        case "list_claude_configs":
          return this.handleListClaudeConfigs(args);
        
        case "get_applied_config":
          return this.handleGetAppliedConfig(args);

        default:
          // Check if it's a proxied tool from external MCP server
          if (this.proxyManager) {
            try {
              const result = await this.proxyManager.callTool(name, args);
              return result;
            } catch (error) {
              this.logger.debug(`Error calling proxied tool ${name}:`, error);
              throw error;
            }
          }
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Handle apply_claude_config tool call
   */
  private async handleApplyClaudeConfig(args: any) {
    // Support single string argument or normal object argument
    let filePath: string = '';
    let profileName: string | undefined;
    let autoApply: boolean = true; // Auto-apply by default
    
    if (typeof args === 'string') {
      // Treat as filePath if string
      filePath = args;
    } else if (args && typeof args === 'object') {
      const argsObj = args as { 
        filePath?: string; 
        profileName?: string;
        autoApply?: boolean;
      };
      filePath = argsObj.filePath || '';
      profileName = argsObj.profileName;
      autoApply = argsObj.autoApply !== undefined ? argsObj.autoApply : true;
      
      // If filePath is empty, look for first argument
      if (!filePath) {
        const keys = Object.keys(args);
        if (keys.length > 0 && keys[0] !== 'profileName' && keys[0] !== 'autoApply') {
          filePath = (args as any)[keys[0]] || '';
        }
      }
    }
    
    // If no filePath but profileName is provided, try to find the file
    if (!filePath && profileName) {
      // First check if profile is already loaded
      if (this.activeProfiles.has(profileName)) {
        const config = this.activeProfiles.get(profileName);
        const existingPath = (config as any)?._filePath;
        if (existingPath) {
          filePath = existingPath;
        }
      }
      
      // If still no filePath, try common paths
      if (!filePath) {
        const pathResolver = PathResolver.getInstance();
        const possiblePaths = pathResolver.generateProfilePaths(profileName);
        
        for (const possiblePath of possiblePaths) {
          try {
            await this.claudeConfigManager.loadClaudeConfig(possiblePath);
            filePath = possiblePath;
            break;
          } catch {
            // Continue to next path
          }
        }
      }
    }
    
    if (!filePath) {
      return {
        content: [
          {
            type: "text",
            text: `File path is required`,
          },
        ],
        isError: true,
      };
    }
    
    try {
      // Try to resolve file path if it's just a name without extension
      let resolvedFilePath = filePath;
      if (!path.extname(filePath) && !filePath.includes('/')) {
        // Try common patterns for profile names
        const pathResolver = PathResolver.getInstance();
        const possiblePaths = pathResolver.generateFilePaths(filePath);
        
        for (const possiblePath of possiblePaths) {
          try {
            await this.claudeConfigManager.loadClaudeConfig(possiblePath);
            resolvedFilePath = possiblePath;
            break;
          } catch {
            // Continue to next path
          }
        }
      }
      
      const config = await this.claudeConfigManager.loadClaudeConfig(resolvedFilePath);
      // Auto-generate profile name from filename (without extension) or use default
      const yamlConfigManager = new YamlConfigManager();
      const autoProfileName = profileName || path.basename(resolvedFilePath, path.extname(resolvedFilePath)) || yamlConfigManager.getDefaultProfile();
      this.activeProfiles.set(autoProfileName, config);
      
      // Track the last applied profile
      this.lastAppliedProfile = autoProfileName;
      this.lastAppliedTime = new Date().toISOString();
      
      let responseMessages = [
        {
          type: "text" as const,
          text: `Successfully loaded CLAUDE.md configuration from ${resolvedFilePath} as profile '${autoProfileName}'`,
        },
      ];
      
      // If auto-apply is enabled
      if (autoApply) {
        const behaviorInstructions = BehaviorGenerator.generateInstructions(config);
        responseMessages.push(
          {
            type: "text" as const,
            text: `\nAutomatically applying profile '${autoProfileName}'...`,
          },
          {
            type: "text" as const,
            text: behaviorInstructions,
          }
        );
      } else {
        responseMessages.push({
          type: "text" as const,
          text: `Configuration includes: ${Object.keys(config).filter(k => !k.startsWith('_')).join(', ')}`,
        });
      }
      
      return {
        content: responseMessages,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to load CLAUDE.md: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }



  /**
   * Handle list_claude_configs tool call
   */
  private async handleListClaudeConfigs(args: any) {
    try {
      // Get loaded configs
      const loadedConfigNames = Array.from(this.activeProfiles.keys());
      
      // Get all available files
      const availableFiles = await this.fileScanner.scanForClaudeFiles();
      const loadedPaths = Array.from(this.activeProfiles.values()).map(config => 
        (config as any)._filePath
      ).filter(Boolean);
      
      // Separate loaded and unloaded
      const unloadedFiles = availableFiles.filter(file => 
        !loadedPaths.includes(file.path)
      ).map(file => ({
        path: file.path,
        isClaudeConfig: file.isClaudeConfig,
        matchedPattern: file.matchedPattern
      }));
      
      const result = {
        loaded: loadedConfigNames.map(name => ({
          name,
          status: "loaded",
          path: (this.activeProfiles.get(name) as any)?._filePath || "unknown"
        })),
        available: unloadedFiles.map(file => ({
          path: file.path,
          status: "available",
          pattern: file.matchedPattern
        })),
        summary: {
          totalLoaded: loadedConfigNames.length,
          totalAvailable: unloadedFiles.length,
          total: loadedConfigNames.length + unloadedFiles.length
        }
      };
      
      return {
        content: [
          {
            type: "text",
            text: `CLAUDE.md configs:\n\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to list configs: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
  
  /**
   * Handle get_active_profile tool call - returns currently applied profile info
   */
  private async handleGetAppliedConfig(args: any) {
    // Track the last applied profile (we'll need to store this when apply_claude_config is called)
    const lastAppliedProfile = this.lastAppliedProfile;
    
    if (!lastAppliedProfile) {
      return {
        content: [
          {
            type: "text",
            text: "No configuration is currently applied.",
          },
        ],
      };
    }
    
    const config = this.activeProfiles.get(lastAppliedProfile);
    if (!config) {
      return {
        content: [
          {
            type: "text",
            text: `Configuration '${lastAppliedProfile}' was applied but is no longer in memory.`,
          },
        ],
      };
    }
    
    const profileInfo = {
      name: lastAppliedProfile,
      title: config.title || "Untitled",
      description: config.description || "No description",
      path: (config as any)._filePath || "unknown",
      appliedAt: this.lastAppliedTime || "unknown",
      sections: Object.keys(config).filter(k => !k.startsWith('_')),
    };
    
    return {
      content: [
        {
          type: "text",
          text: `Applied configuration:\n\n${JSON.stringify(profileInfo, null, 2)}`,
        },
      ],
    };
  }


}