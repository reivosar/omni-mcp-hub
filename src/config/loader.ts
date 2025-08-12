import * as fs from 'fs/promises';
import * as path from 'path';
import { ClaudeConfigManager, ClaudeConfig } from '../utils/claude-config.js';
import { YamlConfigManager, YamlConfig } from './yaml-config.js';
import { FileScanner } from '../utils/file-scanner.js';

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

  constructor(claudeConfigManager: ClaudeConfigManager) {
    this.claudeConfigManager = claudeConfigManager;
    this.yamlConfigManager = new YamlConfigManager();
    this.fileScanner = new FileScanner(this.yamlConfigManager);
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
        await this.loadProfilesFromYaml(yamlConfig.autoLoad.profiles, activeProfiles);
      }

      // 3. Load profiles from legacy .mcp-config.json (backward compatibility)
      await this.loadLegacyConfig(activeProfiles);

      // 4. Auto-scan functionality (if configured)
      await this.autoScanProfiles(activeProfiles);

    } catch (error) {
      console.error("Initial config loading error:", error);
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
    } catch (error) {
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
        
        // Skip already loaded profiles
        if (activeProfiles.has(profileName)) {
          const allowDuplicates = config.profileManagement?.allowDuplicateNames ?? false;
          if (!allowDuplicates) continue;
        }

        try {
          const loadedConfig = await this.claudeConfigManager.loadClaudeConfig(fileInfo.path);
          activeProfiles.set(profileName, loadedConfig);
          
          if (config.logging?.verboseFileLoading) {
            console.error(`✅ Auto-scanned profile '${profileName}': ${fileInfo.path}`);
          }
        } catch (error) {
          if (config.logging?.verboseFileLoading) {
            console.error(`❌ Auto-scan profile '${profileName}' failed: ${error}`);
          }
        }
      }
    } catch (error) {
      if (yamlConfig.logging?.verboseFileLoading) {
        console.error("Auto-scan error:", error);
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
    
    for (const profile of profiles) {
      if (profile.path && profile.name) {
        try {
          const fullPath = path.isAbsolute(profile.path) 
            ? profile.path 
            : path.join(process.cwd(), profile.path);
          
          const loadedConfig = await this.claudeConfigManager.loadClaudeConfig(fullPath);
          activeProfiles.set(profile.name, loadedConfig);
          
          if (config.logging?.verboseFileLoading) {
            console.error(`✅ Auto-loaded profile '${profile.name}': ${profile.path}`);
          }
        } catch (error) {
          if (config.logging?.verboseFileLoading) {
            console.error(`❌ Profile '${profile.name}' loading failed: ${error}`);
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
          const fullPath = path.isAbsolute(profile.path) 
            ? profile.path 
            : path.join(process.cwd(), profile.path);
          
          const loadedConfig = await this.claudeConfigManager.loadClaudeConfig(fullPath);
          activeProfiles.set(profile.name, loadedConfig);
          console.error(`✅ Auto-loaded profile '${profile.name}': ${profile.path}`);
        } catch (error) {
          console.error(`❌ Failed to load profile '${profile.name}': ${error}`);
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