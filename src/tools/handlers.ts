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

export class ToolHandlers {
  private server: Server;
  private claudeConfigManager: ClaudeConfigManager;
  private activeProfiles: Map<string, ClaudeConfig>;
  private fileScanner: FileScanner;

  constructor(
    server: Server,
    claudeConfigManager: ClaudeConfigManager,
    activeProfiles: Map<string, ClaudeConfig>,
    fileScanner?: FileScanner
  ) {
    this.server = server;
    this.claudeConfigManager = claudeConfigManager;
    this.activeProfiles = activeProfiles;
    // Determine correct path based on working directory
    const isInExamplesDir = process.cwd().endsWith('/examples');
    const yamlConfigPath = isInExamplesDir ? './omni-config.yaml' : './examples/omni-config.yaml';
    this.fileScanner = fileScanner || new FileScanner(YamlConfigManager.createWithPath(yamlConfigPath));
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
      return {
        tools: [
          // CLAUDE.md management tools
          {
            name: "load_claude_config",
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
            name: "list_loaded_configs",
            description: "List all currently loaded configuration profiles",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "list_unloaded_configs",
            description: "List all configuration files that are not yet loaded",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "list_all_configs",
            description: "List both loaded and unloaded configuration files",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        ],
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
        case "load_claude_config":
          return this.handleLoadClaudeConfig(args);
        
        
        case "list_loaded_configs":
          return this.handleListLoadedConfigs(args);
        
        case "list_unloaded_configs":
          return this.handleListUnloadedConfigs(args);
        
        case "list_all_configs":
          return this.handleListAllConfigs(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Handle load_claude_config tool call
   */
  private async handleLoadClaudeConfig(args: any) {
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
      const config = await this.claudeConfigManager.loadClaudeConfig(filePath);
      // Auto-generate profile name from filename (without extension) or use default
      const yamlConfigManager = new YamlConfigManager();
      const autoProfileName = profileName || path.basename(filePath, path.extname(filePath)) || yamlConfigManager.getDefaultProfile();
      this.activeProfiles.set(autoProfileName, config);
      
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
   * Handle list_loaded_configs tool call
   */
  private async handleListLoadedConfigs(args: any) {
    const loadedConfigNames = Array.from(this.activeProfiles.keys());
    
    return {
      content: [
        {
          type: "text",
          text: `Loaded configs (${loadedConfigNames.length}):\n\n${JSON.stringify(loadedConfigNames, null, 2)}`,
        },
      ],
    };
  }

  /**
   * Handle list_unloaded_configs tool call
   */
  private async handleListUnloadedConfigs(args: any) {
    try {
      const availableFiles = await this.fileScanner.scanForClaudeFiles();
      
      // Get loaded profile file paths - check multiple possible path properties
      const loadedPaths = Array.from(this.activeProfiles.values()).map(config => {
        const configAny = config as any;
        return configAny._filePath || configAny.filePath || configAny.path || configAny._originalPath;
      }).filter(Boolean);
      
      // Filter out already loaded files
      const unloadedFiles = availableFiles.filter(file => 
        !loadedPaths.some(loadedPath => 
          loadedPath === file.path || 
          loadedPath === file.path.replace(process.cwd() + '/', './') ||
          file.path === loadedPath.replace(process.cwd() + '/', './')
        )
      ).map(file => ({
        path: file.path,
        isClaudeConfig: file.isClaudeConfig,
        matchedPattern: file.matchedPattern
      }));
      
      return {
        content: [
          {
            type: "text",
            text: `Unloaded configs (${unloadedFiles.length}):\n\n${JSON.stringify(unloadedFiles, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to scan for unloaded configs: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle list_all_configs tool call
   */
  private async handleListAllConfigs(args: any) {
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
        loaded: loadedConfigNames,
        unloaded: unloadedFiles,
        summary: {
          totalLoaded: loadedConfigNames.length,
          totalUnloaded: unloadedFiles.length,
          totalAvailable: loadedConfigNames.length + unloadedFiles.length
        }
      };
      
      return {
        content: [
          {
            type: "text",
            text: `All configs:\n\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to list all configs: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }


}