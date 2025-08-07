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
    const behaviorSections = [
      'System Behavior',
      'Claude Instructions', 
      'Assistant Prompt',
      'Behavior Instructions'
    ];

    let extractedContent = '';

    for (const sectionName of behaviorSections) {
      const patterns = [
        // English headers
        new RegExp(`##\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i'),
        // Japanese headers (with だっちゃ)
        new RegExp(`##\\s*${sectionName}[^\\n]*だっちゃ[^\\n]*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i'),
        // Mixed headers
        new RegExp(`##\\s*${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i')
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const sectionContent = match[1].trim();
          if (sectionContent) {
            extractedContent += `${sectionContent}\n\n`;
          }
          break; // Found this section, move to next
        }
      }
    }

    return extractedContent.trim() || null;
  }

  /**
   * Formats behavior instructions as a system prompt
   */
  formatBehaviorPrompt(instructions: string, source: string): string {
    if (!instructions.trim()) {
      return `Based on CLAUDE.md instructions from ${source}, maintain standard behavior with no specific behavior modifications.`;
    }

    return `Based on CLAUDE.md instructions from ${source}:

${instructions}

Please follow these behavior instructions in all your responses while maintaining your core functionality as Claude Code.`;
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