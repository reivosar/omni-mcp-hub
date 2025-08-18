import * as fs from 'fs/promises';
import * as path from 'path';
import { ClaudeConfigManager, ClaudeConfig } from '../utils/claude-config.js';
import { YamlConfigManager } from './yaml-config.js';
import { FileScanner } from '../utils/file-scanner.js';
import { PathResolver } from '../utils/path-resolver.js';
import { ILogger, SilentLogger } from '../utils/logger.js';

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

  constructor(claudeConfigManager: ClaudeConfigManager, yamlConfigManager?: YamlConfigManager, logger?: ILogger) {
    this.claudeConfigManager = claudeConfigManager;
    this.logger = logger || new SilentLogger();
    const pathResolver = PathResolver.getInstance();
    const defaultConfigPath = pathResolver.getYamlConfigPath();
    this.yamlConfigManager = yamlConfigManager || YamlConfigManager.createWithPath(defaultConfigPath, this.logger);
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
        this.logger.info(`[CONFIG-LOADER] Found ${yamlConfig.autoLoad.profiles.length} autoLoad profiles to load`);
        await this.loadProfilesFromYaml(yamlConfig.autoLoad.profiles, activeProfiles);
      } else {
        this.logger.info("[CONFIG-LOADER] No autoLoad profiles found in YAML config");
      }

      // 3. Load profiles from legacy .mcp-config.json (backward compatibility)
      await this.loadLegacyConfig(activeProfiles);

      // 4. Auto-scan functionality (if configured)
      await this.autoScanProfiles(activeProfiles);

    } catch (error) {
      this.logger.debug("Initial config loading error:", error);
    }

    return activeProfiles;
  }

  /**
   * Load legacy .mcp-config.json for backward compatibility
   */
  private async loadLegacyConfig(activeProfiles: Map<string, ClaudeConfig>): Promise<void> {
    try {
      const configPath = path.join(process.cwd(), '.mcp-config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const config: McpConfig = JSON.parse(configData);
      
      if (config.initialProfiles && Array.isArray(config.initialProfiles)) {
        await this.loadProfiles(config.initialProfiles, activeProfiles);
      }
    } catch (_error) {
      // If .mcp-config.json doesn't exist, do nothing (normal operation)
    }
  }

  /**
   * Auto scan for CLAUDE.md files based on YAML configuration
   */
  private async autoScanProfiles(activeProfiles: Map<string, ClaudeConfig>): Promise<void> {
    const yamlConfig = this.yamlConfigManager.getConfig();
    const includePaths = yamlConfig.fileSettings?.includePaths || [];

    if (includePaths.length === 0) return;

    try {
      const scannedFiles = await this.fileScanner.scanForClaudeFiles();
      const config = this.yamlConfigManager.getConfig();

      for (const fileInfo of scannedFiles) {
        if (!fileInfo.isClaudeConfig) continue;

        const profileName = this.yamlConfigManager.generateProfileName(fileInfo.path);
        
        // Skip already loaded profiles (check both name and file path)
        const isAlreadyLoaded = activeProfiles.has(profileName) || 
          Array.from(activeProfiles.values()).some(config => 
            (config as { _filePath?: string })._filePath === fileInfo.path
          );
        
        if (isAlreadyLoaded) {
          const allowDuplicates = config.profileManagement?.allowDuplicateNames ?? false;
          if (!allowDuplicates) continue;
        }

        try {
          const loadedConfig = await this.claudeConfigManager.loadClaudeConfig(fileInfo.path);
          // Mark as auto-scanned (not explicitly auto-apply)
          (loadedConfig as { _autoScanned?: boolean; _filePath?: string })._autoScanned = true;
          (loadedConfig as { _autoScanned?: boolean; _filePath?: string })._filePath = fileInfo.path;
          activeProfiles.set(profileName, loadedConfig);
          
          if (this.yamlConfigManager.isVerboseProfileSwitching()) {
            this.yamlConfigManager.log('info', `Auto-scanned profile '${profileName}': ${fileInfo.path}`);
          }
        } catch (error) {
          if (config.logging?.verboseFileLoading) {
            this.logger.debug(`Auto-scan profile '${profileName}' failed: ${error}`);
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
    profiles: Array<{ name: string; path: string; autoApply?: boolean }>, 
    activeProfiles: Map<string, ClaudeConfig>
  ): Promise<void> {
    const config = this.yamlConfigManager.getConfig();
    this.logger.info(`[CONFIG-LOADER] Processing ${profiles.length} YAML profiles`);
    
    for (const profile of profiles) {
      this.logger.info(`[CONFIG-LOADER] Loading profile '${profile.name}' from path: ${profile.path}, autoApply: ${profile.autoApply}`);
      if (profile.path && profile.name) {
        // Skip if autoApply is explicitly set to false
        if (profile.autoApply === false) {
          if (this.yamlConfigManager.isVerboseProfileSwitching()) {
            this.yamlConfigManager.log('info', `Skipping profile '${profile.name}' (autoApply: false): ${profile.path}`);
          }
          continue;
        }
        
        try {
          // Use PathResolver for consistent path handling
          const pathResolver = PathResolver.getInstance();
          const fullPath = pathResolver.resolveProfilePath(profile.path);
          
          const loadedConfig = await this.claudeConfigManager.loadClaudeConfig(fullPath);
          // Mark config with autoApply flag for later use
          (loadedConfig as { _autoApply?: boolean; _filePath?: string })._autoApply = profile.autoApply === true;
          (loadedConfig as { _autoApply?: boolean; _filePath?: string })._filePath = fullPath;
          activeProfiles.set(profile.name, loadedConfig);
          this.logger.info(`[CONFIG-LOADER] Successfully loaded profile '${profile.name}' from ${fullPath}`);
          
          // If autoApply is true, apply the behavior immediately
          if (profile.autoApply === true) {
            const { BehaviorGenerator } = await import('../utils/behavior-generator.js');
            const behaviorInstructions = BehaviorGenerator.generateInstructions(loadedConfig);
            this.logger.info(`[CONFIG-LOADER] Auto-applying profile '${profile.name}'`);
            this.logger.debug(`\n=== APPLYING PROFILE '${profile.name}' ===`);
            this.logger.debug(behaviorInstructions);
            this.logger.debug(`=== END PROFILE APPLICATION ===\n`);
          }
          
          if (this.yamlConfigManager.isVerboseProfileSwitching()) {
            const applyStatus = profile.autoApply === true ? ' (APPLIED)' : '';
            this.yamlConfigManager.log('info', `Auto-loaded profile '${profile.name}': ${profile.path}${applyStatus}`);
          }
        } catch (error) {
          this.logger.info(`[CONFIG-LOADER] Failed to load profile '${profile.name}' from ${profile.path}: ${error}`);
          if (config.logging?.verboseFileLoading) {
            this.logger.debug(`Profile '${profile.name}' loading failed: ${error}`);
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
    activeProfiles: Map<string, ClaudeConfig>
  ): Promise<void> {
    for (const profile of profiles) {
      if (profile.path && profile.name) {
        try {
          // Use PathResolver for consistent path handling
          const pathResolver = PathResolver.getInstance();
          const fullPath = pathResolver.resolveProfilePath(profile.path);
          
          const loadedConfig = await this.claudeConfigManager.loadClaudeConfig(fullPath);
          activeProfiles.set(profile.name, loadedConfig);
          this.logger.debug(`Auto-loaded profile '${profile.name}': ${profile.path}`);
        } catch (error) {
          this.logger.debug(`Failed to load profile '${profile.name}': ${error}`);
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
}