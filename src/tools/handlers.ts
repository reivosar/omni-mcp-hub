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
            name: "list_claude_configs",
            description: "List all loaded Claude configurations",
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
        
        case "list_claude_configs":
          return this.handleListClaudeConfigs(args);

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
   * Handle list_claude_configs tool call
   */
  private async handleListClaudeConfigs(args: any) {
    const configs = Array.from(this.activeProfiles.entries()).map(([name, config]) => {
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
          text: `Loaded Claude configurations:\n\n${JSON.stringify(configs, null, 2)}`,
        },
      ],
    };
  }


}