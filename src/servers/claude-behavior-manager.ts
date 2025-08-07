/**
 * Claude Behavior Manager
 * 
 * Automatically detects and applies behavior instructions from CLAUDE.md files
 * in local sources to modify Claude's response style and personality.
 */

import { SourceConfigManager } from '../config/source-config-manager';
import { OmniSourceManager } from '../sources/source-manager';

export interface BehaviorInstructions {
  instructions: string;
  source: string;
}

export class ClaudeBehaviorManager {
  private configManager: SourceConfigManager;
  private sourceManager: OmniSourceManager;

  constructor() {
    this.configManager = new SourceConfigManager();
    this.sourceManager = new OmniSourceManager();
  }

  /**
   * Detects behavior instructions from CLAUDE.md files in local sources
   */
  async detectBehaviorInstructions(): Promise<BehaviorInstructions | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const sources = this.configManager.getSources();
    const localSources = sources.filter(source => source.type === 'local');
    
    for (const source of localSources) {
      if (!source.path) continue;
      
      try {
        // Try to read CLAUDE.md from each local source
        const sourcePath = source.path.startsWith('/') ? source.path : `./${source.path}`;
        const claudeFilePath = `${sourcePath}/CLAUDE.md`;
        
        const content = await this.sourceManager.getSourceFile(sourcePath, 'CLAUDE.md');
        
        if (content) {
          const behaviorInstructions = this.extractBehaviorFromContent(content);
          
          if (behaviorInstructions) {
            return {
              instructions: behaviorInstructions,
              source: claudeFilePath
            };
          }
        }
      } catch (error) {
        console.warn(`Failed to read CLAUDE.md from ${source.path}:`, error);
        continue;
      }
    }

    return null;
  }

  /**
   * Extracts behavior instructions from CLAUDE.md content
   */
  extractBehaviorFromContent(content: string): string | null {
    // Just use the entire CLAUDE.md content as behavior instructions
    const trimmedContent = content.trim();
    return trimmedContent || null;
  }

  /**
   * Formats behavior instructions as a system prompt
   */
  formatBehaviorPrompt(instructions: string, _source: string): string {
    // Just return the raw instructions - let Claude interpret them
    return instructions.trim();
  }

  /**
   * Checks if behavior detection is enabled in configuration
   */
  isEnabled(): boolean {
    const config = this.configManager.getConfig();
    
    // Enabled by default unless explicitly disabled
    if (!config.behavior_detection) {
      return true;
    }
    
    return config.behavior_detection.enabled !== false;
  }
}