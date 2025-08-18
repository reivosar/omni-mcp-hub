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
    
    this.logger.debug('[TOOL-HANDLERS] Initializing ToolHandlers');
    this.logger.debug('[TOOL-HANDLERS] Active profiles count:', activeProfiles.size);
    this.logger.debug('[TOOL-HANDLERS] Proxy manager provided:', !!proxyManagerOrFileScanner);
    
    const pathResolver = PathResolver.getInstance();
    const yamlConfigPath = pathResolver.getYamlConfigPath();
    this.logger.debug('[TOOL-HANDLERS] YAML config path:', yamlConfigPath);
    
    // Handle both old and new constructor signatures
    if (proxyManagerOrFileScanner && 'addServer' in proxyManagerOrFileScanner) {
      this.logger.debug('[TOOL-HANDLERS] Using new signature with MCPProxyManager');
      // New signature with MCPProxyManager
      this.proxyManager = proxyManagerOrFileScanner;
      this.fileScanner = new FileScanner(YamlConfigManager.createWithPath(yamlConfigPath, this.logger), this.logger);
    } else {
      this.logger.debug('[TOOL-HANDLERS] Using old signature with FileScanner');
      // Old signature with FileScanner
      this.fileScanner = proxyManagerOrFileScanner || new FileScanner(YamlConfigManager.createWithPath(yamlConfigPath, this.logger), this.logger);
    }
    
    this.logger.debug('[TOOL-HANDLERS] ToolHandlers initialization complete');
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
      
      // Check if local resources are configured
      // For Serena-only setup, we don't need CLAUDE.md management tools
      const hasLocalResources = false;
      
      this.logger.debug(`[TOOL-HANDLER] Local resources configured: ${hasLocalResources}`);
      
      // Only include CLAUDE.md management tools if local resources are configured
      const baseTools = hasLocalResources ? [
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
        ] : [];

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
      this.logger.debug(`[TOOL-HANDLER] Processing tool call: ${name}`);
      this.logger.debug(`[TOOL-HANDLER] Tool arguments:`, JSON.stringify(args));

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
            this.logger.debug(`[TOOL-HANDLER] Attempting proxy tool call: ${name}`);
            return this.errorHandler.wrapToolCall(
              () => this.proxyManager!.callTool(name, args),
              {
                operation: 'proxy_tool_call',
                toolName: name,
                args,
              }
            );
          }
          this.logger.debug(`[TOOL-HANDLER] Unknown tool requested: ${name}`);
          return createStandardErrorResponse(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Handle apply_claude_config tool call
   */
  private async handleApplyClaudeConfig(args: unknown) {
    this.logger.debug('[APPLY-CLAUDE-CONFIG] Handler called');
    return this.errorHandler.wrapToolCall(
      () => this.doHandleApplyClaudeConfig(args),
      {
        operation: 'apply_claude_config',
        args,
      }
    );
  }

  private async doHandleApplyClaudeConfig(args: unknown) {
    this.logger.debug('[APPLY-CLAUDE-CONFIG] Starting configuration application');
    this.logger.debug('[APPLY-CLAUDE-CONFIG] Raw arguments:', JSON.stringify(args));
    
    // Support single string argument or normal object argument
    let filePath: string = '';
    let profileName: string | undefined;
    let autoApply: boolean = true; // Auto-apply by default
    
    if (typeof args === 'string') {
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Arguments type: string, treating as profileName');
      // Treat as profileName if string (common usage pattern)
      profileName = args;
    } else if (args && typeof args === 'object') {
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Arguments type: object, parsing properties');
      const argsObj = args as { 
        filePath?: string; 
        profileName?: string;
        autoApply?: boolean;
      };
      filePath = argsObj.filePath || '';
      profileName = argsObj.profileName;
      autoApply = argsObj.autoApply !== undefined ? argsObj.autoApply : true;
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Parsed - filePath:', filePath, 'profileName:', profileName, 'autoApply:', autoApply);
      
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
    
    this.logger.debug('[APPLY-CLAUDE-CONFIG] After parsing - filePath:', filePath, 'profileName:', profileName);
    
    // Handle profileName-only case (resolve path from YAML config)
    if (!filePath && profileName) {
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Handling profileName-only case:', profileName);
      // First check if profile is already loaded
      if (this.activeProfiles.has(profileName)) {
        this.logger.debug('[APPLY-CLAUDE-CONFIG] Profile already loaded:', profileName);
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
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Profile not loaded, searching for file path');
      const existingConfig = this.activeProfiles.get(profileName);
      const existingPath = (existingConfig as Record<string, unknown>)?._filePath as string;
      if (existingPath) {
        this.logger.debug('[APPLY-CLAUDE-CONFIG] Found existing path:', existingPath);
        filePath = existingPath;
      }
      
      // If still no filePath, try YAML config autoLoad profiles first
      if (!filePath) {
        this.logger.debug('[APPLY-CLAUDE-CONFIG] No existing path found, checking YAML config autoLoad profiles');
        const pathResolver = PathResolver.getInstance();
        const yamlConfigPath = pathResolver.getAbsoluteYamlConfigPath();
        this.logger.debug('[APPLY-CLAUDE-CONFIG] YAML config path:', yamlConfigPath);
        const yamlConfigManager = YamlConfigManager.createWithPath(yamlConfigPath, this.logger);
        try {
          const yamlConfig = await yamlConfigManager.loadYamlConfig();
          this.logger.debug('[APPLY-CLAUDE-CONFIG] Loaded YAML config, autoLoad profiles:', yamlConfig.autoLoad?.profiles?.length || 0);
          const autoLoadProfiles = yamlConfig.autoLoad?.profiles || [];
          
          // Look for matching profile in autoLoad
          const matchingProfile = autoLoadProfiles.find(p => p.name === profileName);
          this.logger.debug('[APPLY-CLAUDE-CONFIG] Searching for matching profile in autoLoad:', profileName);
          if (matchingProfile?.path) {
            this.logger.debug('[APPLY-CLAUDE-CONFIG] Found matching profile in autoLoad:', matchingProfile.path);
            // Handle Docker container paths first
            let resolvedPath = matchingProfile.path;
            if (resolvedPath.startsWith('/app/')) {
              const projectRelativePath = resolvedPath.replace('/app/', '');
              resolvedPath = path.join(process.cwd(), projectRelativePath);
            } else if (!path.isAbsolute(resolvedPath)) {
              resolvedPath = path.resolve(process.cwd(), resolvedPath);
            }
            
            try {
              this.logger.debug('[APPLY-CLAUDE-CONFIG] Attempting to load config from resolved path:', resolvedPath);
              await this.claudeConfigManager.loadClaudeConfig(resolvedPath);
              filePath = resolvedPath;
              this.logger.debug('[APPLY-CLAUDE-CONFIG] Successfully loaded from YAML autoLoad path:', resolvedPath);
            } catch (error) {
              this.logger.debug('[APPLY-CLAUDE-CONFIG] Failed to load from YAML autoLoad path:', resolvedPath, 'Error:', error);
              // Path from YAML config doesn't work, continue to fallback
            }
          }
        } catch (error) {
          this.logger.debug('[APPLY-CLAUDE-CONFIG] Failed to load YAML config:', error);
          // YAML config loading failed, continue to fallback
        }
      }
      
      // If still no filePath, try common paths as fallback
      if (!filePath) {
        this.logger.debug('[APPLY-CLAUDE-CONFIG] Still no filePath, trying common paths fallback');
        const pathResolver = PathResolver.getInstance();
        const possiblePaths = pathResolver.generateProfilePaths(profileName);
        this.logger.debug('[APPLY-CLAUDE-CONFIG] Generated possible paths:', possiblePaths);
        
        for (const possiblePath of possiblePaths) {
          try {
            this.logger.debug('[APPLY-CLAUDE-CONFIG] Trying possible path:', possiblePath);
            await this.claudeConfigManager.loadClaudeConfig(possiblePath);
            filePath = possiblePath;
            this.logger.debug('[APPLY-CLAUDE-CONFIG] Successfully loaded from possible path:', possiblePath);
            break;
          } catch (error) {
            this.logger.debug('[APPLY-CLAUDE-CONFIG] Failed to load from possible path:', possiblePath, 'Error:', error);
            // Continue to next path
          }
        }
      }
    }
    
    // If we have a filePath (either provided or resolved), resolve path format
    if (filePath) {
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Resolving filePath format:', filePath);
      // Handle Docker container paths (convert /app/ to actual project path)
      if (filePath.startsWith('/app/')) {
        const projectRelativePath = filePath.replace('/app/', '');
        filePath = path.join(process.cwd(), projectRelativePath);
        this.logger.debug('[APPLY-CLAUDE-CONFIG] Converted Docker path:', filePath);
      }
      // Handle other relative paths
      else if (!path.isAbsolute(filePath)) {
        const originalPath = filePath;
        filePath = path.resolve(process.cwd(), filePath);
        this.logger.debug('[APPLY-CLAUDE-CONFIG] Resolved relative path:', originalPath, 'to:', filePath);
      }
    }
    
    if (!filePath) {
      this.logger.debug('[APPLY-CLAUDE-CONFIG] No filePath found after all resolution attempts');
      return createStandardErrorResponse('File path is required');
    }
    
    this.logger.debug('[APPLY-CLAUDE-CONFIG] Final filePath to load:', filePath);
    
    // If it's just a name without extension, try common patterns
    if (!path.extname(filePath) && !filePath.includes('/')) {
      this.logger.debug('[APPLY-CLAUDE-CONFIG] FilePath has no extension, trying common patterns');
      const pathResolver = PathResolver.getInstance();
      const possiblePaths = pathResolver.generateFilePaths(filePath);
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Generated file paths:', possiblePaths);
      
      for (const possiblePath of possiblePaths) {
        try {
          this.logger.debug('[APPLY-CLAUDE-CONFIG] Trying file path:', possiblePath);
          await this.claudeConfigManager.loadClaudeConfig(possiblePath);
          filePath = possiblePath;
          this.logger.debug('[APPLY-CLAUDE-CONFIG] Successfully loaded from file path:', possiblePath);
          break;
        } catch (error) {
          this.logger.debug('[APPLY-CLAUDE-CONFIG] Failed to load from file path:', possiblePath, 'Error:', error);
          // Continue to next path
        }
      }
    }
    
    this.logger.debug('[APPLY-CLAUDE-CONFIG] Attempting final config load from:', filePath);
    const config = await this.claudeConfigManager.loadClaudeConfig(filePath);
    this.logger.debug('[APPLY-CLAUDE-CONFIG] Successfully loaded config, keys:', Object.keys(config));
    
    // Auto-generate profile name from filename (without extension) or use default
    const yamlConfigManager = new YamlConfigManager();
    const autoProfileName = profileName || path.basename(filePath, path.extname(filePath)) || yamlConfigManager.getDefaultProfile();
    this.logger.debug('[APPLY-CLAUDE-CONFIG] Generated profile name:', autoProfileName);
    this.activeProfiles.set(autoProfileName, config);
    this.logger.debug('[APPLY-CLAUDE-CONFIG] Stored in activeProfiles, total profiles:', this.activeProfiles.size);
    
    // Track the last applied profile
    this.lastAppliedProfile = autoProfileName;
    this.lastAppliedTime = new Date().toISOString();
    this.logger.debug('[APPLY-CLAUDE-CONFIG] Tracked last applied profile:', autoProfileName, 'at:', this.lastAppliedTime);
    
    let responseMessages = [
      {
        type: "text" as const,
        text: `Successfully loaded CLAUDE.md configuration from ${filePath} as profile '${autoProfileName}'`,
      },
    ];
    
    // If auto-apply is enabled
    if (autoApply) {
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Auto-apply enabled, generating behavior instructions');
      const behaviorInstructions = BehaviorGenerator.generateInstructions(config);
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Generated instructions length:', behaviorInstructions.length);
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
      this.logger.debug('[APPLY-CLAUDE-CONFIG] Auto-apply disabled, showing config summary');
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
    this.logger.debug('[LIST-CLAUDE-CONFIGS] Handler called');
    return this.doHandleListClaudeConfigs(args);
  }

  private async doHandleListClaudeConfigs(_args: unknown) {
      this.logger.debug('[LIST-CLAUDE-CONFIGS] Starting list operation');
      // Get loaded configs
      const loadedConfigNames = Array.from(this.activeProfiles.keys());
      this.logger.debug('[LIST-CLAUDE-CONFIGS] Loaded config names:', loadedConfigNames);
      
      // Get all available files
      this.logger.debug('[LIST-CLAUDE-CONFIGS] Scanning for available files');
      const availableFiles = await this.fileScanner.scanForClaudeFiles();
      this.logger.debug('[LIST-CLAUDE-CONFIGS] Found available files:', availableFiles.length);
      const loadedPaths = Array.from(this.activeProfiles.values()).map(config => 
        (config as Record<string, unknown>)._filePath as string
      ).filter(Boolean);
      this.logger.debug('[LIST-CLAUDE-CONFIGS] Loaded file paths:', loadedPaths);
      
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
    this.logger.debug('[GET-APPLIED-CONFIG] Handler called');
    return this.doHandleGetAppliedConfig(args);
  }

  private async doHandleGetAppliedConfig(_args: unknown) {
    this.logger.debug('[GET-APPLIED-CONFIG] Starting get applied config operation');
    // Track the last applied profile (we'll need to store this when apply_claude_config is called)
    const lastAppliedProfile = this.lastAppliedProfile;
    this.logger.debug('[GET-APPLIED-CONFIG] Last applied profile:', lastAppliedProfile);
    
    if (!lastAppliedProfile) {
      this.logger.debug('[GET-APPLIED-CONFIG] No configuration currently applied');
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
      this.logger.debug('[GET-APPLIED-CONFIG] Configuration no longer in memory:', lastAppliedProfile);
      return {
        content: [
          {
            type: "text",
            text: `Configuration '${lastAppliedProfile}' was applied but is no longer in memory.`,
          },
        ],
      };
    }
    
    this.logger.debug('[GET-APPLIED-CONFIG] Found configuration for profile:', lastAppliedProfile);
    
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