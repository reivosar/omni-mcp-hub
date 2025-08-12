import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ClaudeConfig } from "../utils/claude-config.js";

export class ResourceHandlers {
  private server: Server;
  private activeProfiles: Map<string, ClaudeConfig>;

  constructor(server: Server, activeProfiles: Map<string, ClaudeConfig>) {
    this.server = server;
    this.activeProfiles = activeProfiles;
  }

  /**
   * Setup all resource handlers
   */
  setupHandlers(): void {
    this.setupListResourcesHandler();
    this.setupReadResourceHandler();
  }

  /**
   * Setup the list resources handler
   */
  private setupListResourcesHandler(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const baseResources = [
        {
          uri: "info://server",
          name: "Server Information",
          description: "Basic information about this MCP server",
          mimeType: "text/plain",
        },
        {
          uri: "greeting://world",
          name: "World Greeting", 
          description: "A greeting message for the world",
          mimeType: "text/plain",
        },
      ];

      // Add dynamic resources for each loaded profile
      const profileResources = Array.from(this.activeProfiles.keys()).map(profileName => ({
        uri: `claude://profile/${profileName}`,
        name: `Claude Profile: ${profileName}`,
        description: `Configuration details for Claude profile '${profileName}'`,
        mimeType: "application/json",
      }));

      return {
        resources: [...baseResources, ...profileResources],
      };
    });
  }

  /**
   * Setup the read resource handler
   */
  private setupReadResourceHandler(): void {
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case "info://server":
          return {
            contents: [
              {
                uri,
                mimeType: "text/plain",
                text: "Omni MCP Hub Server v1.0.0 - A universal MCP server for Claude Code integration with CLAUDE.md management",
              },
            ],
          };

        case "greeting://world":
          return {
            contents: [
              {
                uri,
                mimeType: "text/plain",
                text: "Hello, World! This is a greeting from the Omni MCP Hub server with CLAUDE.md support.",
              },
            ],
          };

        default:
          // Handle claude://profile/{name} resources
          const profileMatch = uri.match(/^claude:\/\/profile\/(.+)$/);
          if (profileMatch) {
            const profileName = profileMatch[1];
            const config = this.activeProfiles.get(profileName);
            
            if (config) {
              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(config, null, 2),
                  },
                ],
              };
            }
          }
          
          throw new Error(`Unknown resource: ${uri}`);
      }
    });
  }
}