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
import { ErrorHandler, createStandardErrorResponse } from "../utils/error-handler.js";

export class ToolHandlers {
  private server: Server;
  private claudeConfigManager: ClaudeConfigManager;
  private activeProfiles: Map<string, ClaudeConfig>;
  private fileScanner: FileScanner;
  private lastAppliedProfile: string | null = null;
  private lastAppliedTime: string | null = null;
  private proxyManager?: MCPProxyManager;
  private logger: ILogger;
  private errorHandler: ErrorHandler;

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
    this.errorHandler = ErrorHandler.getInstance(this.logger);
    
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
      let aggregatedTools: unknown[] = [...baseTools];
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
        this.logger.debug(`[TOOL-HANDLER] Final tool ${i+1}: ${(tool as Record<string, unknown>).name}`);
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
            return this.errorHandler.wrapToolCall(
              () => this.proxyManager!.callTool(name, args),
              {
                operation: 'proxy_tool_call',
                toolName: name,
                args,
              }
            );
          }
          return createStandardErrorResponse(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Handle apply_claude_config tool call
   */
  private async handleApplyClaudeConfig(args: unknown) {
    return this.errorHandler.wrapToolCall(
      () => this.doHandleApplyClaudeConfig(args),
      {
        operation: 'apply_claude_config',
        args,
      }
    );
  }

  private async doHandleApplyClaudeConfig(args: unknown) {
    // Support single string argument or normal object argument
    let filePath: string = '';
    let profileName: string | undefined;
    let autoApply: boolean = true; // Auto-apply by default
    
    if (typeof args === 'string') {
      // Treat as profileName if string (common usage pattern)
      profileName = args;
    } else if (args && typeof args === 'object') {
      const argsObj = args as { 
        filePath?: string; 
        profileName?: string;
        autoApply?: boolean;
      };
      filePath = argsObj.filePath || '';
      profileName = argsObj.profileName;
      autoApply = argsObj.autoApply !== undefined ? argsObj.autoApply : true;
      
      // If filePath is empty, look for first argument value (could be profileName)
      if (!filePath && !profileName) {
        const keys = Object.keys(args);
        if (keys.length > 0) {
          const firstValue = (args as Record<string, unknown>)[keys[0]] as string || '';
          if (keys[0] === 'filePath') {
            filePath = firstValue;
          } else {
            // Treat first argument as profileName
            profileName = firstValue;
          }
        }
      }
    }
    
    // Handle profileName-only case (resolve path from YAML config)
    if (!filePath && profileName) {
      // First check if profile is already loaded
      if (this.activeProfiles.has(profileName)) {
        const config = this.activeProfiles.get(profileName);
        
        // If profile is already loaded, apply it directly
        this.lastAppliedProfile = profileName;
        this.lastAppliedTime = new Date().toISOString();
        
        let responseMessages = [
          {
            type: "text" as const,
            text: `Profile '${profileName}' is already loaded and available`,
          },
        ];
        
        // If auto-apply is enabled
        if (autoApply) {
          const behaviorInstructions = BehaviorGenerator.generateInstructions(config!);
          responseMessages.push(
            {
              type: "text" as const,
              text: `\nApplying profile '${profileName}'...`,
            },
            {
              type: "text" as const,
              text: behaviorInstructions,
            }
          );
        } else {
          responseMessages.push({
            type: "text" as const,
            text: `Configuration includes: ${Object.keys(config!).filter(k => !k.startsWith('_')).join(', ')}`,
          });
        }
        
        return {
          content: responseMessages,
        };
      }
      
      // If not loaded, try to find the file path
      const existingConfig = this.activeProfiles.get(profileName);
      const existingPath = (existingConfig as Record<string, unknown>)?._filePath as string;
      if (existingPath) {
        filePath = existingPath;
      }
      
      // If still no filePath, try YAML config autoLoad profiles first
      if (!filePath) {
        const pathResolver = PathResolver.getInstance();
        const yamlConfigPath = pathResolver.getAbsoluteYamlConfigPath();
        const yamlConfigManager = YamlConfigManager.createWithPath(yamlConfigPath, this.logger);
        try {
          const yamlConfig = await yamlConfigManager.loadYamlConfig();
          const autoLoadProfiles = yamlConfig.autoLoad?.profiles || [];
          
          // Look for matching profile in autoLoad
          const matchingProfile = autoLoadProfiles.find(p => p.name === profileName);
          if (matchingProfile?.path) {
            // Resolve path (support both absolute and relative paths)
            const resolvedPath = path.isAbsolute(matchingProfile.path) 
              ? matchingProfile.path 
              : path.resolve(process.cwd(), matchingProfile.path);
            
            try {
              await this.claudeConfigManager.loadClaudeConfig(resolvedPath);
              filePath = resolvedPath;
            } catch {
              // Path from YAML config doesn't work, continue to fallback
            }
          }
        } catch {
          // YAML config loading failed, continue to fallback
        }
      }
      
      // If still no filePath, try common paths as fallback
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
    
    // If we have a filePath (either provided or resolved), resolve path format
    if (filePath) {
      // Handle Docker container paths (convert /app/ to actual project path)
      if (filePath.startsWith('/app/')) {
        const projectRelativePath = filePath.replace('/app/', '');
        filePath = path.join(process.cwd(), projectRelativePath);
      }
      // Handle other relative paths
      else if (!path.isAbsolute(filePath)) {
        filePath = path.resolve(process.cwd(), filePath);
      }
    }
    
    if (!filePath) {
      return createStandardErrorResponse('File path is required');
    }
    
    // If it's just a name without extension, try common patterns
    if (!path.extname(filePath) && !filePath.includes('/')) {
      const pathResolver = PathResolver.getInstance();
      const possiblePaths = pathResolver.generateFilePaths(filePath);
      
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
    
    const config = await this.claudeConfigManager.loadClaudeConfig(filePath);
    // Auto-generate profile name from filename (without extension) or use default
    const yamlConfigManager = new YamlConfigManager();
    const autoProfileName = profileName || path.basename(filePath, path.extname(filePath)) || yamlConfigManager.getDefaultProfile();
    this.activeProfiles.set(autoProfileName, config);
    
    // Track the last applied profile
    this.lastAppliedProfile = autoProfileName;
    this.lastAppliedTime = new Date().toISOString();
    
    let responseMessages = [
      {
        type: "text" as const,
        text: `Successfully loaded CLAUDE.md configuration from ${filePath} as profile '${autoProfileName}'`,
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
  }



  /**
   * Handle list_claude_configs tool call
   */
  private async handleListClaudeConfigs(args: unknown) {
    return this.doHandleListClaudeConfigs(args);
  }

  private async doHandleListClaudeConfigs(_args: unknown) {
      // Get loaded configs
      const loadedConfigNames = Array.from(this.activeProfiles.keys());
      
      // Get all available files
      const availableFiles = await this.fileScanner.scanForClaudeFiles();
      const loadedPaths = Array.from(this.activeProfiles.values()).map(config => 
        (config as Record<string, unknown>)._filePath as string
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
          path: (this.activeProfiles.get(name) as Record<string, unknown>)?._filePath as string || "unknown"
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
  }
  
  /**
   * Handle get_active_profile tool call - returns currently applied profile info
   */
  private async handleGetAppliedConfig(args: unknown) {
    return this.doHandleGetAppliedConfig(args);
  }

  private async doHandleGetAppliedConfig(_args: unknown) {
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
      path: (config as Record<string, unknown>)._filePath as string || "unknown",
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