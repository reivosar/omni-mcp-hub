import * as fs from 'fs/promises';
import * as path from 'path';

export interface ClaudeConfig {
  projectName?: string;
  instructions?: string;
  customInstructions?: string[];
  knowledge?: string[];
  rules?: string[];
  context?: string[];
  tools?: string[];
  memory?: string;
  [key: string]: unknown;
}

export class ClaudeConfigManager {
  private configCache: Map<string, ClaudeConfig> = new Map();

  /**
   * Parse CLAUDE.md file content into structured config
   */
  parseClaude(content: string): ClaudeConfig {
    const config: ClaudeConfig = {};
    const lines = content.split('\n');
    let currentSection: string | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('<!--')) continue;

      // Check for section headers (# Section Name)
      const headerMatch = trimmed.match(/^#+\s*(.+)$/);
      if (headerMatch) {
        // Save previous section
        if (currentSection && currentContent.length > 0) {
          this.addToConfig(config, currentSection, currentContent.join('\n').trim());
        }
        
        currentSection = headerMatch[1].toLowerCase().replace(/\s+/g, '_');
        currentContent = [];
        continue;
      }

      // Check for key-value pairs (Key: Value)
      const kvMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1].toLowerCase().replace(/\s+/g, '_');
        const value = kvMatch[2];
        config[key] = value;
        continue;
      }

      // Add to current section content
      if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save final section
    if (currentSection && currentContent.length > 0) {
      this.addToConfig(config, currentSection, currentContent.join('\n').trim());
    }

    return config;
  }

  private addToConfig(config: ClaudeConfig, section: string, content: string) {
    switch (section) {
      case 'instructions':
      case 'system_instructions':
        config.instructions = content;
        break;
      case 'custom_instructions':
        config.customInstructions = content.split('\n').filter(line => line.trim());
        break;
      case 'knowledge':
      case 'knowledge_base':
        config.knowledge = content.split('\n').filter(line => line.trim());
        break;
      case 'rules':
      case 'guidelines':
        config.rules = content.split('\n').filter(line => line.trim());
        break;
      case 'context':
      case 'background':
        config.context = content.split('\n').filter(line => line.trim());
        break;
      case 'tools':
      case 'available_tools':
        config.tools = content.split('\n').filter(line => line.trim());
        break;
      case 'memory':
      case 'memory_context':
        config.memory = content;
        break;
      default:
        config[section] = content;
    }
  }

  /**
   * Load CLAUDE.md file from path
   */
  async loadClaudeConfig(filePath: string): Promise<ClaudeConfig> {
    try {
      const absolutePath = path.resolve(filePath);
      
      // Check cache first
      if (this.configCache.has(absolutePath)) {
        return this.configCache.get(absolutePath)!;
      }

      const content = await fs.readFile(absolutePath, 'utf-8');
      const config = this.parseClaude(content);
      
      // Add metadata
      config._filePath = absolutePath;
      config._lastModified = new Date().toISOString();
      
      // Cache the config
      this.configCache.set(absolutePath, config);
      
      return config;
    } catch (_error) {
      throw new Error(`Failed to load CLAUDE.md from ${filePath}: ${_error}`);
    }
  }

  /**
   * Save config back to CLAUDE.md file
   */
  async saveClaude(filePath: string, config: ClaudeConfig): Promise<void> {
    const content = this.configToClaudeFormat(config);
    await fs.writeFile(filePath, content, 'utf-8');
    
    // Update cache
    const absolutePath = path.resolve(filePath);
    this.configCache.set(absolutePath, { ...config, _lastModified: new Date().toISOString() });
  }

  /**
   * Convert config object back to CLAUDE.md format
   */
  private configToClaudeFormat(config: ClaudeConfig): string {
    const lines: string[] = [];

    // Add project name if exists
    if (config.projectName) {
      lines.push(`# ${config.projectName}`);
      lines.push('');
    }

    // Add basic key-value pairs
    const simpleKeys = ['project_name', 'description', 'version'];
    for (const key of simpleKeys) {
      if (config[key] && typeof config[key] === 'string') {
        lines.push(`${key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}: ${config[key]}`);
      }
    }

    if (lines.length > 0) lines.push('');

    // Add instructions section
    if (config.instructions) {
      lines.push('# Instructions');
      lines.push('');
      lines.push(config.instructions);
      lines.push('');
    }

    // Add custom instructions
    if (config.customInstructions && config.customInstructions.length > 0) {
      lines.push('# Custom Instructions');
      lines.push('');
      config.customInstructions.forEach(instruction => {
        lines.push(instruction);
      });
      lines.push('');
    }

    // Add rules
    if (config.rules && config.rules.length > 0) {
      lines.push('# Rules');
      lines.push('');
      config.rules.forEach(rule => {
        lines.push(rule);
      });
      lines.push('');
    }

    // Add knowledge base
    if (config.knowledge && config.knowledge.length > 0) {
      lines.push('# Knowledge');
      lines.push('');
      config.knowledge.forEach(knowledge => {
        lines.push(knowledge);
      });
      lines.push('');
    }

    // Add context
    if (config.context && config.context.length > 0) {
      lines.push('# Context');
      lines.push('');
      config.context.forEach(ctx => {
        lines.push(ctx);
      });
      lines.push('');
    }

    // Add tools
    if (config.tools && config.tools.length > 0) {
      lines.push('# Tools');
      lines.push('');
      config.tools.forEach(tool => {
        lines.push(tool);
      });
      lines.push('');
    }

    // Add memory
    if (config.memory) {
      lines.push('# Memory');
      lines.push('');
      lines.push(config.memory);
      lines.push('');
    }

    // Add custom sections
    for (const [key, value] of Object.entries(config)) {
      if (key.startsWith('_') || ['instructions', 'customInstructions', 'rules', 'knowledge', 'context', 'tools', 'memory', 'projectName'].includes(key)) {
        continue;
      }
      
      if (typeof value === 'string') {
        lines.push(`# ${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`);
        lines.push('');
        lines.push(value);
        lines.push('');
      }
    }

    return lines.join('\n').trim() + '\n';
  }

  /**
   * List available CLAUDE.md files in directory
   */
  async findClaudeFiles(directory: string): Promise<string[]> {
    try {
      const files = await fs.readdir(directory, { recursive: true });
      return files
        .filter((file): file is string => typeof file === 'string')
        .filter(file => file.toLowerCase().includes('claude.md'))
        .map(file => path.join(directory, file));
    } catch (_error) {
      return [];
    }
  }

  /**
   * Clear config cache
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Get cached config paths
   */
  getCachedPaths(): string[] {
    return Array.from(this.configCache.keys());
  }
}