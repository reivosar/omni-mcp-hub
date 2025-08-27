import * as fs from "fs/promises";
import * as path from "path";
import { ClaudeConfigManager, ClaudeConfig } from "../utils/claude-config.js";
import { YamlConfigManager } from "./yaml-config.js";
import { FileScanner } from "../utils/file-scanner.js";
import { PathResolver } from "../utils/path-resolver.js";
import { ILogger, SilentLogger } from "../utils/logger.js";

export interface InitialProfile {
  name: string;
  path: string;
  autoApply?: boolean;
}

export interface McpConfig {
  initialProfiles: InitialProfile[];
}

export class ConfigLoader {
  private claudeConfigManager: ClaudeConfigManager;
  private yamlConfigManager: YamlConfigManager;
  private fileScanner: FileScanner;
  private logger: ILogger;

  constructor(
    claudeConfigManager: ClaudeConfigManager,
    yamlConfigManager?: YamlConfigManager,
    logger?: ILogger,
  ) {
    this.claudeConfigManager = claudeConfigManager;
    this.logger = logger || new SilentLogger();
    const pathResolver = PathResolver.getInstance();
    const defaultConfigPath = pathResolver.getYamlConfigPath();
    this.yamlConfigManager =
      yamlConfigManager ||
      YamlConfigManager.createWithPath(defaultConfigPath, this.logger);
    this.fileScanner = new FileScanner(this.yamlConfigManager, this.logger);
  }

  /**
   * Load initial configuration from .mcp-config.json and YAML config
   */
  async loadInitialConfig(): Promise<Map<string, ClaudeConfig>> {
    const activeProfiles = new Map<string, ClaudeConfig>();

    try {
      // 1. Load YAML configuration file
      await this.yamlConfigManager.loadYamlConfig();
      const yamlConfig = this.yamlConfigManager.getConfig();

      // 2. Load profiles from YAML configuration
      if (yamlConfig.autoLoad?.profiles) {
        this.logger.info(
          `[CONFIG-LOADER] Found ${yamlConfig.autoLoad.profiles.length} autoLoad profiles to load`,
        );
        await this.loadProfilesFromYaml(
          yamlConfig.autoLoad.profiles,
          activeProfiles,
        );
      } else {
        this.logger.info(
          "[CONFIG-LOADER] No autoLoad profiles found in YAML config",
        );
      }

      // 3. Load profiles from legacy .mcp-config.json (backward compatibility)
      await this.loadLegacyConfig(activeProfiles);

      // 4. Auto-scan functionality disabled - only load autoLoad profiles
    } catch (error) {
      this.logger.debug("Initial config loading error:", error);
    }

    return activeProfiles;
  }

  /**
   * Load legacy .mcp-config.json for backward compatibility
   */
  private async loadLegacyConfig(
    activeProfiles: Map<string, ClaudeConfig>,
  ): Promise<void> {
    try {
      const configPath = path.join(process.cwd(), ".mcp-config.json");
      const configData = await fs.readFile(configPath, "utf-8");
      const config: McpConfig = JSON.parse(configData);

      if (config.initialProfiles && Array.isArray(config.initialProfiles)) {
        await this.loadProfiles(config.initialProfiles, activeProfiles);
      }
    } catch (_error) {
      // Ignore scanning errors
    }
  }

  /**
   * Auto scan for CLAUDE.md files based on YAML configuration
   */
  private async autoScanProfiles(
    activeProfiles: Map<string, ClaudeConfig>,
  ): Promise<void> {
    const yamlConfig = this.yamlConfigManager.getConfig();
    const includePaths = yamlConfig.fileSettings?.includePaths || [];

    if (includePaths.length === 0) return;

    try {
      const scannedFiles = await this.fileScanner.scanForClaudeFiles();
      const config = this.yamlConfigManager.getConfig();

      for (const fileInfo of scannedFiles) {
        if (!fileInfo.isClaudeConfig) continue;

        const profileName = this.yamlConfigManager.generateProfileName(
          fileInfo.path,
        );

        const isAlreadyLoaded =
          activeProfiles.has(profileName) ||
          Array.from(activeProfiles.values()).some(
            (config) =>
              (config as { _filePath?: string })._filePath === fileInfo.path,
          );

        if (isAlreadyLoaded) {
          const allowDuplicates =
            config.profileManagement?.allowDuplicateNames ?? false;
          if (!allowDuplicates) continue;
        }

        try {
          const loadedConfig = await this.claudeConfigManager.loadClaudeConfig(
            fileInfo.path,
          );

          if (!loadedConfig) {
            if (config.logging?.verboseFileLoading) {
              this.logger.debug(
                `Auto-scan profile '${profileName}' returned null: ${fileInfo.path}`,
              );
            }
            continue;
          }

          (
            loadedConfig as { _autoScanned?: boolean; _filePath?: string }
          )._autoScanned = true;
          (
            loadedConfig as { _autoScanned?: boolean; _filePath?: string }
          )._filePath = fileInfo.path;
          activeProfiles.set(profileName, loadedConfig);

          if (this.yamlConfigManager.isVerboseProfileSwitching()) {
            this.yamlConfigManager.log(
              "info",
              `Auto-scanned profile '${profileName}': ${fileInfo.path}`,
            );
          }
        } catch (error) {
          if (config.logging?.verboseFileLoading) {
            this.logger.debug(
              `Auto-scan profile '${profileName}' failed: ${error}`,
            );
          }
        }
      }
    } catch (error) {
      if (yamlConfig.logging?.verboseFileLoading) {
        this.logger.debug("Auto-scan error:", error);
      }
    }
  }

  /**
   * Load profiles from YAML configuration
   */
  private async loadProfilesFromYaml(
    profiles: Array<{
      name: string;
      path?: string;
      url?: string;
      autoApply?: boolean;
    }>,
    activeProfiles: Map<string, ClaudeConfig>,
  ): Promise<void> {
    const config = this.yamlConfigManager.getConfig();
    this.logger.info(
      `[CONFIG-LOADER] Processing ${profiles.length} YAML profiles`,
    );

    for (const profile of profiles) {
      this.logger.info(
        `[CONFIG-LOADER] Loading profile '${profile.name}' from ${profile.url || profile.path}, autoApply: ${profile.autoApply}`,
      );
      if ((profile.path || profile.url) && profile.name) {
        if (profile.autoApply === false) {
          if (this.yamlConfigManager.isVerboseProfileSwitching()) {
            this.yamlConfigManager.log(
              "info",
              `Skipping profile '${profile.name}' (autoApply: false): ${profile.url || profile.path}`,
            );
          }
          continue;
        }

        try {
          let fullPath: string;
          let downloadedFiles: Map<string, string> = new Map();

          if (profile.url) {
            this.logger.info(
              `[CONFIG-LOADER] Downloading recursively from URL: ${profile.url}`,
            );
            const result = await this.downloadAndCacheRecursively(profile.url);
            fullPath = result.mainFile;
            downloadedFiles = result.allFiles;
            this.logger.info(
              `[CONFIG-LOADER] Downloaded and cached main file: ${fullPath}`,
            );
            this.logger.info(
              `[CONFIG-LOADER] Downloaded ${downloadedFiles.size} files total`,
            );
          } else if (profile.path) {
            const pathResolver = PathResolver.getInstance();
            fullPath = pathResolver.resolveProfilePath(profile.path);
            downloadedFiles.set(profile.url || profile.path || "", fullPath);
          } else {
            throw new Error("Neither url nor path specified");
          }

          const loadedConfig =
            await this.claudeConfigManager.loadClaudeConfig(fullPath);

          if (!loadedConfig) {
            this.logger.warn(
              `[CONFIG-LOADER] Failed to load profile '${profile.name}' from ${fullPath} - config is null`,
            );
            continue;
          }

          (
            loadedConfig as {
              _autoApply?: boolean;
              _filePath?: string;
              _sourceUrl?: string;
              _downloadedFiles?: Map<string, string>;
            }
          )._autoApply = profile.autoApply === true;
          (
            loadedConfig as {
              _autoApply?: boolean;
              _filePath?: string;
              _sourceUrl?: string;
              _downloadedFiles?: Map<string, string>;
            }
          )._filePath = fullPath;
          (
            loadedConfig as {
              _autoApply?: boolean;
              _filePath?: string;
              _sourceUrl?: string;
              _downloadedFiles?: Map<string, string>;
            }
          )._sourceUrl = profile.url || "";
          (
            loadedConfig as {
              _autoApply?: boolean;
              _filePath?: string;
              _sourceUrl?: string;
              _downloadedFiles?: Map<string, string>;
            }
          )._downloadedFiles = downloadedFiles;

          activeProfiles.set(profile.name, loadedConfig);
          this.logger.info(
            `[CONFIG-LOADER] Successfully loaded profile '${profile.name}' from ${fullPath}`,
          );
          this.logger.info(
            `[CONFIG-LOADER] Downloaded ${downloadedFiles.size} supporting files`,
          );

          if (profile.autoApply === true) {
            const { BehaviorGenerator } = await import(
              "../utils/behavior-generator.js"
            );
            const behaviorInstructions =
              BehaviorGenerator.generateInstructions(loadedConfig);
            this.logger.info(
              `[CONFIG-LOADER] Auto-applying profile '${profile.name}'`,
            );
            this.logger.debug(`\n=== APPLYING PROFILE '${profile.name}' ===`);
            this.logger.debug(behaviorInstructions);
            this.logger.debug(`=== END PROFILE APPLICATION ===\n`);
          }

          if (this.yamlConfigManager.isVerboseProfileSwitching()) {
            const applyStatus = profile.autoApply === true ? " (APPLIED)" : "";
            this.yamlConfigManager.log(
              "info",
              `Auto-loaded profile '${profile.name}': ${profile.url || profile.path}${applyStatus}`,
            );
          }
        } catch (error) {
          this.logger.info(
            `[CONFIG-LOADER] Failed to load profile '${profile.name}' from ${profile.url || profile.path}: ${error}`,
          );
          if (config.logging?.verboseFileLoading) {
            this.logger.debug(
              `Profile '${profile.name}' loading failed: ${error}`,
            );
          }
        }
      }
    }
  }

  /**
   * Load multiple profiles from legacy configuration
   */
  private async loadProfiles(
    profiles: InitialProfile[],
    activeProfiles: Map<string, ClaudeConfig>,
  ): Promise<void> {
    for (const profile of profiles) {
      if (profile.path && profile.name) {
        try {
          const pathResolver = PathResolver.getInstance();
          const fullPath = pathResolver.resolveProfilePath(profile.path);

          const loadedConfig =
            await this.claudeConfigManager.loadClaudeConfig(fullPath);

          if (!loadedConfig) {
            this.logger.debug(
              `Auto-loaded profile '${profile.name}' returned null: ${profile.path}`,
            );
            continue;
          }

          activeProfiles.set(profile.name, loadedConfig);
          this.logger.debug(
            `Auto-loaded profile '${profile.name}': ${profile.path}`,
          );
        } catch (error) {
          this.logger.debug(
            `Failed to load profile '${profile.name}': ${error}`,
          );
        }
      }
    }
  }

  /**
   * Get YAML configuration manager
   */
  getYamlConfigManager(): YamlConfigManager {
    return this.yamlConfigManager;
  }

  /**
   * Get file scanner
   */
  getFileScanner(): FileScanner {
    return this.fileScanner;
  }

  /**
   * Download and cache files recursively from GitHub URL
   */
  private async downloadAndCacheRecursively(
    url: string,
  ): Promise<{ mainFile: string; allFiles: Map<string, string> }> {
    url = this.convertToRawUrl(url);
    const visitedUrls = new Set<string>();
    const downloadedFiles = new Map<string, string>();

    const processFile = async (currentUrl: string): Promise<void> => {
      if (visitedUrls.has(currentUrl)) return;
      visitedUrls.add(currentUrl);

      this.logger.info(`[CONFIG-LOADER] Downloading: ${currentUrl}`);

      try {
        // 1. Download file content
        const response = await fetch(currentUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const content = await response.text();

        // 2. Convert URL to local cache path
        const localPath = this.urlToLocalPath(currentUrl);

        // 3. Ensure directory exists
        await fs.mkdir(path.dirname(localPath), { recursive: true });

        // 4. Save file locally
        await fs.writeFile(localPath, content, "utf-8");
        downloadedFiles.set(currentUrl, localPath);

        this.logger.info(`[CONFIG-LOADER] Cached: ${localPath}`);

        // 5. Extract markdown links from content
        const links = this.extractMarkdownLinks(content);

        // 6. Process each link recursively
        for (const link of links) {
          const absoluteUrl = this.resolveRelativeUrl(currentUrl, link);
          if (absoluteUrl) {
            await processFile(absoluteUrl);
          }
        }
      } catch (error) {
        this.logger.debug(
          `[CONFIG-LOADER] Failed to download ${currentUrl}: ${error}`,
        );
      }
    };

    await processFile(url);

    const mainFile = downloadedFiles.get(url) || this.urlToLocalPath(url);
    return { mainFile, allFiles: downloadedFiles };
  }

  /**
   * Extract markdown links from content
   */
  private extractMarkdownLinks(content: string): string[] {
    const links: string[] = [];

    const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+\.md)\)/g;
    let match;
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      links.push(match[2]);
    }

    const backtickLinkRegex = /`((?:docs\/)?[A-Z_]+\.md)`/g;
    while ((match = backtickLinkRegex.exec(content)) !== null) {
      links.push(match[1]);
    }

    const directLinkRegex = /(?:^|\s)(docs\/[A-Z_]+\.md)(?:\s|$)/g;
    while ((match = directLinkRegex.exec(content)) !== null) {
      links.push(match[1]);
    }

    const bracketLinkRegex = /\]\((docs\/[A-Z_]+\.md)\)/g;
    while ((match = bracketLinkRegex.exec(content)) !== null) {
      links.push(match[1]);
    }

    this.logger.debug(
      `[CONFIG-LOADER] Found ${links.length} markdown links: ${links.join(", ")}`,
    );
    return [...new Set(links)]; // Remove duplicates
  }

  /**
   * Convert GitHub raw URL to local cache path
   */
  private urlToLocalPath(url: string): string {

    const urlParts = url.split("/");
    const repoIndex = urlParts.findIndex(
      (part) => part === "claude-code-engineering-guide",
    );

    if (repoIndex === -1) {
      throw new Error(`Invalid GitHub URL format: ${url}`);
    }

    const markdownIndex = urlParts.findIndex((part) => part === "markdown");
    if (markdownIndex === -1) {
      throw new Error(`URL must contain 'markdown' directory: ${url}`);
    }

    const relativePath = urlParts.slice(markdownIndex + 1).join("/");
    const cacheDir = path.join(process.cwd(), "cache", "claude-guide");

    return path.join(cacheDir, relativePath);
  }

  /**
   * Convert GitHub page URL to raw URL
   */
  private convertToRawUrl(url: string): string {
    if (url.includes("github.com") && url.includes("/blob/")) {
      return url
        .replace("github.com", "raw.githubusercontent.com")
        .replace("/blob/", "/");
    }
    return url;
  }

  /**
   * Resolve relative URL to absolute URL
   */
  private resolveRelativeUrl(
    baseUrl: string,
    relativePath: string,
  ): string | null {
    try {
      if (relativePath.startsWith("http")) {
        return this.convertToRawUrl(relativePath);
      }

      baseUrl = this.convertToRawUrl(baseUrl);

      const urlParts = baseUrl.split("/");
      const markdownIndex = urlParts.findIndex((part) => part === "markdown");

      if (markdownIndex === -1) return null;

      const baseMarkdownUrl = urlParts.slice(0, markdownIndex + 1).join("/");

      if (relativePath.startsWith("./")) {
        relativePath = relativePath.substring(2);
      }

      return `${baseMarkdownUrl}/${relativePath}`;
    } catch (_error) {
      this.logger.debug(
        `[CONFIG-LOADER] Failed to resolve relative URL: ${baseUrl} + ${relativePath}`,
      );
      return null;
    }
  }
}
