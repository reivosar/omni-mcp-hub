import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as path from 'path';
import { ClaudeConfigManager, ClaudeConfig } from "../utils/claude-config.js";
import { BehaviorGenerator } from "../utils/behavior-generator.js";

export class ToolHandlers {
  private server: Server;
  private claudeConfigManager: ClaudeConfigManager;
  private activeProfiles: Map<string, ClaudeConfig>;

  constructor(
    server: Server,
    claudeConfigManager: ClaudeConfigManager,
    activeProfiles: Map<string, ClaudeConfig>
  ) {
    this.server = server;
    this.claudeConfigManager = claudeConfigManager;
    this.activeProfiles = activeProfiles;
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
            name: "get_claude_behavior",
            description: "Get the current Claude behavior configuration",
            inputSchema: {
              type: "object",
              properties: {
                profileName: { 
                  type: "string", 
                  description: "Profile name to get (optional, defaults to 'default')" 
                },
              },
              required: [],
            },
          },
          {
            name: "update_claude_config",
            description: "Update Claude configuration and save to file",
            inputSchema: {
              type: "object",
              properties: {
                filePath: { type: "string", description: "Path to save the configuration" },
                config: { type: "object", description: "Configuration object to save" },
                profileName: { 
                  type: "string", 
                  description: "Profile name (optional)" 
                },
              },
              required: ["filePath", "config"],
            },
          },
          {
            name: "list_claude_profiles",
            description: "List all loaded Claude configuration profiles",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "find_claude_files",
            description: "Find CLAUDE.md files in a directory",
            inputSchema: {
              type: "object",
              properties: {
                directory: { 
                  type: "string", 
                  description: "Directory to search for CLAUDE.md files" 
                },
              },
              required: ["directory"],
            },
          },
          {
            name: "apply_claude_behavior",
            description: "Apply a loaded configuration to modify Claude's behavior",
            inputSchema: {
              type: "object",
              properties: {
                profileName: { 
                  type: "string", 
                  description: "Profile name to apply (defaults to 'default')" 
                },
                temporary: { 
                  type: "boolean", 
                  description: "Whether this is a temporary application (default: false)" 
                },
              },
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
        
        case "get_claude_behavior":
          return this.handleGetClaudeBehavior(args);
        
        case "update_claude_config":
          return this.handleUpdateClaudeConfig(args);
        
        case "list_claude_profiles":
          return this.handleListClaudeProfiles(args);
        
        case "find_claude_files":
          return this.handleFindClaudeFiles(args);
        
        case "apply_claude_behavior":
          return this.handleApplyClaudeBehavior(args);

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
      // Auto-generate profile name from filename (without extension)
      const autoProfileName = profileName || path.basename(filePath, path.extname(filePath));
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
   * Handle get_claude_behavior tool call
   */
  private async handleGetClaudeBehavior(args: any) {
    const { profileName = "default" } = args as { profileName?: string };
    
    const config = this.activeProfiles.get(profileName);
    if (!config) {
      return {
        content: [
          {
            type: "text",
            text: `No configuration found for profile '${profileName}'`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Current Claude behavior configuration for '${profileName}':\n\n${JSON.stringify(config, null, 2)}`,
        },
      ],
    };
  }

  /**
   * Handle update_claude_config tool call
   */
  private async handleUpdateClaudeConfig(args: any) {
    const { filePath, config, profileName = "default" } = args as {
      filePath: string;
      config: ClaudeConfig;
      profileName?: string;
    };

    try {
      await this.claudeConfigManager.saveClaude(filePath, config);
      this.activeProfiles.set(profileName, config);

      return {
        content: [
          {
            type: "text",
            text: `Successfully updated and saved configuration to ${filePath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to update configuration: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle list_claude_profiles tool call
   */
  private async handleListClaudeProfiles(args: any) {
    const profiles = Array.from(this.activeProfiles.entries()).map(([name, config]) => {
      return {
        name,
        filePath: (config as any)._filePath || "unknown",
        lastModified: (config as any)._lastModified || "unknown",
        sections: Object.keys(config).filter(k => !k.startsWith('_')),
      };
    });

    return {
      content: [
        {
          type: "text",
          text: `Loaded Claude profiles:\n\n${JSON.stringify(profiles, null, 2)}`,
        },
      ],
    };
  }

  /**
   * Handle find_claude_files tool call
   */
  private async handleFindClaudeFiles(args: any) {
    const { directory } = args as { directory: string };

    try {
      const files = await this.claudeConfigManager.findClaudeFiles(directory);
      return {
        content: [
          {
            type: "text",
            text: `Found CLAUDE.md files:\n${files.map(f => `- ${f}`).join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to search for CLAUDE.md files: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle apply_claude_behavior tool call
   */
  private async handleApplyClaudeBehavior(args: any) {
    // Support single string argument or normal object argument
    let profileName: string | string[] | undefined;
    let temporary = false;
    
    if (typeof args === 'string') {
      // Treat as profileName if string
      profileName = args;
    } else {
      ({ profileName, temporary = false } = args as {
        profileName?: string | string[];
        temporary?: boolean;
      });
    }

    // Support multiple profiles or all profiles
    let profilesToApply: string[] = [];
    
    if (!profileName) {
      // Apply all profiles if no profile name is specified
      profilesToApply = Array.from(this.activeProfiles.keys());
    } else if (Array.isArray(profileName)) {
      // Multiple profiles if array
      profilesToApply = profileName;
    } else {
      // Single profile if string
      profilesToApply = [profileName];
    }

    if (profilesToApply.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No profiles loaded. Use 'load_claude_config' to load configurations first.`,
          },
        ],
      };
    }

    // Merge each profile's configuration
    const mergedInstructions: string[] = [];
    const appliedProfiles: string[] = [];
    
    for (const name of profilesToApply) {
      const config = this.activeProfiles.get(name);
      if (config) {
        const instructions = BehaviorGenerator.generateInstructions(config);
        mergedInstructions.push(`\n=== Profile: ${name} ===\n${instructions}`);
        appliedProfiles.push(name);
      }
    }

    if (appliedProfiles.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No valid configurations found for specified profile(s): ${profilesToApply.join(', ')}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Applying Claude behavior from ${appliedProfiles.length} profile(s): ${appliedProfiles.join(', ')}${temporary ? ' (temporarily)' : ''}`,
        },
        {
          type: "text",
          text: mergedInstructions.join('\n'),
        },
      ],
    };
  }
}