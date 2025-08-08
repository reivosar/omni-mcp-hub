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
  priority?: number; // Higher number = higher priority
}

export interface AllBehaviorInstructions {
  behaviors: BehaviorInstructions[];
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
  async detectBehaviorInstructions(): Promise<AllBehaviorInstructions | null> {
    if (!this.isEnabled()) {
      return null;
    }

    // Initialize source manager before using it
    await this.sourceManager.initializeSources();

    const sources = this.configManager.getSources();
    const localSources = sources.filter(source => source.type === 'local');
    const behaviors: BehaviorInstructions[] = [];
    
    for (const source of localSources) {
      if (!source.path) continue;
      
      try {
        // Try to read CLAUDE.md from each local source
        const sourcePath = source.path.startsWith('/') ? source.path : `./${source.path}`;
        const claudeFilePath = `${sourcePath}/CLAUDE.md`;
        const sourceUrl = `local:${sourcePath}`;
        
        const content = await this.sourceManager.getSourceFile(sourceUrl, 'CLAUDE.md');
        
        if (content) {
          const behaviorInstructions = this.extractBehaviorFromContent(content);
          
          if (behaviorInstructions) {
            behaviors.push({
              instructions: behaviorInstructions,
              source: claudeFilePath,
              priority: source.behavior_priority || 0
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to read CLAUDE.md from ${source.path}:`, error);
        continue;
      }
    }

    // Sort by priority (highest first)
    behaviors.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    return behaviors.length > 0 ? { behaviors } : null;
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