import * as fs from 'fs/promises';
import * as path from 'path';
import { ClaudeConfigManager, ClaudeConfig } from '../utils/claude-config.js';

export interface InitialProfile {
  name: string;
  path: string;
}

export interface McpConfig {
  initialProfiles: InitialProfile[];
}

export class ConfigLoader {
  private claudeConfigManager: ClaudeConfigManager;

  constructor(claudeConfigManager: ClaudeConfigManager) {
    this.claudeConfigManager = claudeConfigManager;
  }

  /**
   * Load initial configuration from .mcp-config.json
   */
  async loadInitialConfig(): Promise<Map<string, ClaudeConfig>> {
    const activeProfiles = new Map<string, ClaudeConfig>();

    try {
      // ワークディレクトリの .mcp-config.json を探す
      const configPath = path.join(process.cwd(), '.mcp-config.json');
      
      try {
        const configData = await fs.readFile(configPath, 'utf-8');
        const config: McpConfig = JSON.parse(configData);
        
        // 初期読み込みファイルが指定されていれば読み込む
        if (config.initialProfiles && Array.isArray(config.initialProfiles)) {
          await this.loadProfiles(config.initialProfiles, activeProfiles);
        }
      } catch (error) {
        // .mcp-config.json がない場合は何もしない（正常動作）
      }
    } catch (error) {
      console.error("初期設定の読み込みエラー:", error);
    }

    return activeProfiles;
  }

  /**
   * Load multiple profiles from configuration
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
          console.error(`✅ プロファイル '${profile.name}' を自動読み込み: ${profile.path}`);
        } catch (error) {
          console.error(`❌ プロファイル '${profile.name}' の読み込みに失敗: ${error}`);
        }
      }
    }
  }
}