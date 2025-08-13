import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ClaudeConfig } from "../utils/claude-config.js";
import { FileScanner } from "../utils/file-scanner.js";
import { YamlConfigManager } from "../config/yaml-config.js";

export class ResourceHandlers {
  private server: Server;
  private activeProfiles: Map<string, ClaudeConfig>;
  private fileScanner: FileScanner;

  constructor(server: Server, activeProfiles: Map<string, ClaudeConfig>) {
    this.server = server;
    this.activeProfiles = activeProfiles;
    // Determine correct path based on working directory
    const isInExamplesDir = process.cwd().endsWith('/examples');
    const yamlConfigPath = isInExamplesDir ? './omni-config.yaml' : './examples/omni-config.yaml';
    this.fileScanner = new FileScanner(YamlConfigManager.createWithPath(yamlConfigPath));
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
          uri: "config://files/scannable",
          name: "Scannable Config Files",
          description: "All configuration files that can be loaded (not yet active)",
          mimeType: "application/json",
        },
        {
          uri: "config://profiles/active",
          name: "Active Profiles List",
          description: "List of currently loaded/active profile names",
          mimeType: "application/json",
        },
      ];

      // Check for auto-apply profiles
      const autoApplyProfiles = Array.from(this.activeProfiles.entries())
        .filter(([name, config]) => (config as any)._autoApply === true);
      
      if (autoApplyProfiles.length > 0) {
        baseResources.unshift({
          uri: "config://auto-apply",
          name: "🚀 Auto-Apply Instructions",
          description: `Automatically apply ${autoApplyProfiles.length} profile(s) marked for auto-application`,
          mimeType: "text/plain",
        });
      }

      // Add dynamic resources for each loaded profile (active/assigned profiles)
      const profileResources = Array.from(this.activeProfiles.keys()).map(profileName => ({
        uri: `config://profile/active/${profileName}`,
        name: `Active: ${profileName}`,
        description: `Configuration details for active profile '${profileName}'`,
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
        case "config://files/scannable":
          try {
            const availableFiles = await this.fileScanner.scanForClaudeFiles();
            const fileList = availableFiles.map(file => ({
              path: file.path,
              isClaudeConfig: file.isClaudeConfig,
              matchedPattern: file.matchedPattern
            }));
            
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify({
                    totalFiles: fileList.length,
                    files: fileList
                  }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify({ error: `Failed to scan files: ${error}` }, null, 2),
                },
              ],
            };
          }

        case "config://auto-apply":
          const autoApplyProfiles = Array.from(this.activeProfiles.entries())
            .filter(([name, config]) => (config as any)._autoApply === true);
          
          if (autoApplyProfiles.length === 0) {
            return {
              contents: [
                {
                  uri,
                  mimeType: "text/plain",
                  text: "No profiles marked for auto-apply",
                },
              ],
            };
          }
          
          // Combine all auto-apply profiles into instructions
          let combinedInstructions = "# AUTO-APPLIED CONFIGURATION\n\n";
          combinedInstructions += "The following behavior profiles have been automatically loaded:\n\n";
          
          for (const [name, config] of autoApplyProfiles) {
            const { BehaviorGenerator } = await import('../utils/behavior-generator.js');
            combinedInstructions += `## Profile: ${name}\n\n`;
            combinedInstructions += BehaviorGenerator.generateInstructions(config);
            combinedInstructions += "\n\n---\n\n";
          }
          
          return {
            contents: [
              {
                uri,
                mimeType: "text/plain",
                text: combinedInstructions,
              },
            ],
          };

        case "config://profiles/active":
          const activeProfileNames = Array.from(this.activeProfiles.keys());
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify({
                  totalActiveProfiles: activeProfileNames.length,
                  activeProfiles: activeProfileNames
                }, null, 2),
              },
            ],
          };

        default:
          // Handle config://profile/active/{name} resources
          const profileMatch = uri.match(/^config:\/\/profile\/active\/(.+)$/);
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