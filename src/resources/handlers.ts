import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ClaudeConfig } from "../utils/claude-config.js";
import { FileScanner } from "../utils/file-scanner.js";
import { YamlConfigManager } from "../config/yaml-config.js";
import { PathResolver } from "../utils/path-resolver.js";
import { MCPProxyManager } from "../mcp-proxy/manager.js";
import { ILogger, SilentLogger } from "../utils/logger.js";
import { ErrorHandler } from "../utils/error-handler.js";
import { GitHubResourceManager } from "../utils/github-client.js";

export class ResourceHandlers {
  private server: Server;
  private activeProfiles: Map<string, ClaudeConfig>;
  private fileScanner: FileScanner;
  private proxyManager?: MCPProxyManager;
  private logger: ILogger;
  private errorHandler: ErrorHandler;
  private githubResourceManager: GitHubResourceManager;

  constructor(
    server: Server,
    activeProfiles: Map<string, ClaudeConfig>,
    proxyManager?: MCPProxyManager,
    logger?: ILogger,
  ) {
    this.server = server;
    this.activeProfiles = activeProfiles;
    this.proxyManager = proxyManager;
    this.logger = logger || new SilentLogger();
    this.errorHandler = ErrorHandler.getInstance(this.logger);
    // Use PathResolver for consistent config path resolution
    const pathResolver = PathResolver.getInstance();
    const yamlConfigPath = pathResolver.getYamlConfigPath();
    this.fileScanner = new FileScanner(
      YamlConfigManager.createWithPath(yamlConfigPath, this.logger),
      this.logger,
    );

    // Initialize GitHub resource manager
    this.githubResourceManager = new GitHubResourceManager(this.logger);
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
          description:
            "All configuration files that can be loaded (not yet active)",
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
      const autoApplyProfiles = Array.from(
        this.activeProfiles.entries(),
      ).filter(
        ([_name, config]) =>
          (config as unknown as { _autoApply?: boolean })._autoApply === true,
      );

      if (autoApplyProfiles.length > 0) {
        baseResources.unshift({
          uri: "config://auto-apply",
          name: "Auto-Apply Instructions",
          description: `Automatically apply ${autoApplyProfiles.length} profile(s) marked for auto-application`,
          mimeType: "text/plain",
        });
      }

      // Add engineering guide resources
      baseResources.push({
        uri: "engineering-guide://files",
        name: "📚 Engineering Guide - All Files",
        description: "All markdown files from Claude Code Engineering Guide",
        mimeType: "application/json",
      });

      baseResources.push({
        uri: "engineering-guide://combined",
        name: "📘 Engineering Guide - Combined",
        description: "Combined content from all engineering guide files",
        mimeType: "text/markdown",
      });

      // Try to add individual engineering guide file resources
      try {
        const engineeringFiles =
          await this.githubResourceManager.getEngineeringGuide();
        const fileResources = engineeringFiles.map((file) => ({
          uri: `engineering-guide://file/${encodeURIComponent(file.path)}`,
          name: `${file.name}`,
          description: `Engineering guide: ${file.path} (${Math.round(file.size / 1024)}KB)`,
          mimeType: "text/markdown",
        }));
        baseResources.push(...fileResources);
      } catch (error) {
        this.logger.warn(
          "Failed to load engineering guide file list for resources:",
          error,
        );
      }

      // Add dynamic resources for each loaded profile (active/assigned profiles)
      const profileResources = Array.from(this.activeProfiles.keys()).map(
        (profileName) => ({
          uri: `config://profile/active/${profileName}`,
          name: `Active: ${profileName}`,
          description: `Configuration details for active profile '${profileName}'`,
          mimeType: "application/json",
        }),
      );

      // Add proxied resources from external MCP servers
      let aggregatedResources = [...baseResources, ...profileResources];
      if (this.proxyManager) {
        const externalResources = this.proxyManager.getAggregatedResources();
        // Convert external resources to match our expected format
        const formattedExternalResources = externalResources.map(
          (resource) => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description || "External MCP resource",
            mimeType: resource.mimeType || "text/plain",
          }),
        );
        aggregatedResources = [
          ...aggregatedResources,
          ...formattedExternalResources,
        ];
      }

      return {
        resources: aggregatedResources,
      };
    });
  }

  /**
   * Setup the read resource handler
   */
  private setupReadResourceHandler(): void {
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri } = request.params;

        switch (uri) {
          case "config://files/scannable":
            try {
              const availableFiles =
                await this.fileScanner.scanForClaudeFiles();
              const fileList = availableFiles.map((file) => ({
                path: file.path,
                isClaudeConfig: file.isClaudeConfig,
                matchedPattern: file.matchedPattern,
              }));

              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(
                      {
                        totalFiles: fileList.length,
                        files: fileList,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            } catch (error) {
              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(
                      { error: `Failed to scan files: ${error}` },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

          case "config://auto-apply":
            const autoApplyProfiles = Array.from(
              this.activeProfiles.entries(),
            ).filter(
              ([_name, config]) =>
                (config as unknown as { _autoApply?: boolean })._autoApply ===
                true,
            );

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
            combinedInstructions +=
              "The following behavior profiles have been automatically loaded:\n\n";

            for (const [name, config] of autoApplyProfiles) {
              const { BehaviorGenerator } = await import(
                "../utils/behavior-generator.js"
              );
              combinedInstructions += `## Profile: ${name}\n\n`;
              combinedInstructions +=
                BehaviorGenerator.generateInstructions(config);
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
                  text: JSON.stringify(
                    {
                      totalActiveProfiles: activeProfileNames.length,
                      activeProfiles: activeProfileNames,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };

          case "engineering-guide://files":
            try {
              const files =
                await this.githubResourceManager.getEngineeringGuide();
              const fileList = files.map((file) => ({
                name: file.name,
                path: file.path,
                size: file.size,
                uri: `engineering-guide://file/${encodeURIComponent(file.path)}`,
              }));

              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(
                      {
                        totalFiles: fileList.length,
                        repository: "reivosar/claude-code-engineering-guide",
                        branch: "master",
                        path: "markdown",
                        files: fileList,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            } catch (error) {
              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(
                      {
                        error: `Failed to fetch engineering guide files: ${error}`,
                        repository: "reivosar/claude-code-engineering-guide",
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

          case "engineering-guide://combined":
            try {
              const files =
                await this.githubResourceManager.getEngineeringGuide();
              let combinedContent = "# Claude Code Engineering Guide\n\n";
              combinedContent +=
                "This is a combined view of all engineering guide documents.\n\n";
              combinedContent += "---\n\n";

              for (const file of files) {
                combinedContent += `## ${file.name}\n\n`;
                combinedContent += `**Path:** ${file.path}\n\n`;
                combinedContent += file.content;
                combinedContent += "\n\n---\n\n";
              }

              return {
                contents: [
                  {
                    uri,
                    mimeType: "text/markdown",
                    text: combinedContent,
                  },
                ],
              };
            } catch (error) {
              return {
                contents: [
                  {
                    uri,
                    mimeType: "text/markdown",
                    text: `# Engineering Guide Error\n\nFailed to fetch engineering guide content: ${error}`,
                  },
                ],
              };
            }

          default:
            // Handle config://profile/active/{name} resources
            const profileMatch = uri.match(
              /^config:\/\/profile\/active\/(.+)$/,
            );
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

            // Handle individual engineering guide files
            const fileMatch = uri.match(/^engineering-guide:\/\/file\/(.+)$/);
            if (fileMatch) {
              try {
                const filePath = decodeURIComponent(fileMatch[1]);
                const files =
                  await this.githubResourceManager.getEngineeringGuide();
                const file = files.find((f) => f.path === filePath);

                if (file) {
                  return {
                    contents: [
                      {
                        uri,
                        mimeType: "text/markdown",
                        text: file.content,
                      },
                    ],
                  };
                }
              } catch (error) {
                return {
                  contents: [
                    {
                      uri,
                      mimeType: "text/markdown",
                      text: `# Error\n\nFailed to fetch file: ${error}`,
                    },
                  ],
                };
              }
            }

            // Check if it's a proxied resource from external MCP server
            if (this.proxyManager) {
              try {
                const result = await this.proxyManager.readResource(uri);
                return result;
              } catch (error) {
                this.logger.debug(
                  `Error reading proxied resource ${uri}:`,
                  error,
                );
                // Fall through to throw error
              }
            }

            throw new Error(`Unknown resource: ${uri}`);
        }
      },
    );
  }
}
