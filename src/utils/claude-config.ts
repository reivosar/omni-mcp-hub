import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { PathResolver } from './path-resolver.js';
import { SchemaVersionManager, VersionedConfig } from './schema-version-manager.js';
import { ILogger, SilentLogger } from './logger.js';

export interface ClaudeConfig {
  projectName?: string;
  instructions?: string[];
  customInstructions?: string[];
  knowledge?: string[];
  rules?: string[];
  context?: string[];
  tools?: string[];
  memory?: string;
  content?: string;
  filePath?: string;
  profileName?: string;
  [key: string]: unknown;
}

export class ClaudeConfigManager {
  private configCache: Map<string, ClaudeConfig> = new Map();
  private versionManager: SchemaVersionManager;
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger || new SilentLogger();
    this.versionManager = new SchemaVersionManager(this.logger);
  }

  /**
   * Check if a section requires special parsing (no key-value extraction)
   */
  private isSpecialSection(section: string | null): boolean {
    if (!section) return false;
    return section === 'inheritance';
  }

  /**
   * Normalize inheritance property names to match expected interface
   */
  private normalizeInheritanceKey(key: string): string {
    const keyMap: { [key: string]: string } = {
      'enabled': 'enabled',
      'baseprofiles': 'baseProfiles',
      'base_profiles': 'baseProfiles',
      'overridestrategy': 'overrideStrategy',
      'override_strategy': 'overrideStrategy',
      'mergearrays': 'mergeArrays',
      'merge_arrays': 'mergeArrays',
      'respectorder': 'respectOrder',
      'respect_order': 'respectOrder'
    };
    
    const normalized = keyMap[key.toLowerCase()] || key;
    return normalized;
  }

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

      // Check for key-value pairs (Key: Value) - but only outside of special sections
      const kvMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
      if (kvMatch && !this.isSpecialSection(currentSection)) {
        // Save current section before processing key-value pair
        if (currentSection && currentContent.length > 0) {
          this.addToConfig(config, currentSection, currentContent.join('\n').trim());
          currentContent = [];
        }
        
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
        config.instructions = content.split('\n').filter(line => line.trim());
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
      case 'inheritance':
      case 'inheritance_configuration':
      case 'inheritanceconfiguration':
        // Parse inheritance configuration from YAML-like content
        try {
          const lines = content.split('\n');
          const inheritanceConfig: { [key: string]: unknown } = {};
          let currentKey = '';
          let isArrayContext = false;
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            // Check for key-value pairs (no leading whitespace for main keys)
            const kvMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
            if (kvMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
              const key = kvMatch[1].trim();
              let value = kvMatch[2].trim();
              
              // Normalize key names to match expected interface
              const normalizedKey = this.normalizeInheritanceKey(key);
              
              if (value) {
                // Handle boolean values
                if (value === 'true') {
                  inheritanceConfig[normalizedKey] = true;
                } else if (value === 'false') {
                  inheritanceConfig[normalizedKey] = false;
                } else if (value.includes(',')) {
                  // Handle comma-separated arrays (e.g., "base1.md, base2.md")
                  inheritanceConfig[normalizedKey] = value.split(',').map(v => v.trim());
                } else {
                  inheritanceConfig[normalizedKey] = value;
                }
                isArrayContext = false;
              } else {
                // Key with no value - likely an array
                currentKey = normalizedKey;
                inheritanceConfig[normalizedKey] = [];
                isArrayContext = true;
              }
            } else if (trimmed.startsWith('- ') && isArrayContext && currentKey) {
              // Array item
              const arrayValue = trimmed.substring(2).trim().replace(/^["']|["']$/g, '');
              if (Array.isArray(inheritanceConfig[currentKey])) {
                (inheritanceConfig[currentKey] as string[]).push(arrayValue);
              }
            }
          }
          
          config.inheritance = inheritanceConfig;
        } catch (_error) {
          // Fallback: treat as regular content
          config[section] = content;
        }
        break;
      default:
        config[section] = content;
    }
  }

  /**
   * Load CLAUDE.md file from path with automatic version migration
   */
  async loadClaudeConfig(filePath: string, options: { autoMigrate?: boolean } = {}): Promise<ClaudeConfig | null> {
    try {
      const pathResolver = PathResolver.getInstance();
      const absolutePath = pathResolver.resolveAbsolutePath(filePath);
      
      // Validate file extension
      if (!absolutePath.toLowerCase().endsWith('.md')) {
        return null;
      }
      
      // Check cache first, but validate freshness
      if (this.configCache.has(absolutePath)) {
        const cached = this.configCache.get(absolutePath)!;
        try {
          const stats = await fs.stat(absolutePath);
          const cacheTime = (cached._lastModified && typeof cached._lastModified === 'string') 
            ? new Date(cached._lastModified) 
            : new Date(0);
          if (stats.mtime <= cacheTime) {
            return cached;
          }
          // File is newer than cache, remove from cache and reload
          this.configCache.delete(absolutePath);
        } catch {
          // If stat fails, return cached version
          return cached;
        }
      }

      const content = await fs.readFile(absolutePath, 'utf-8');
      let config = this.parseClaude(content) as VersionedConfig;
      
      // Add metadata
      config._filePath = absolutePath;
      config._lastModified = new Date().toISOString();
      config.content = content;
      config.filePath = absolutePath;
      config.profileName = this.generateProfileName(absolutePath);

      // Check version compatibility and migrate if needed
      const compatInfo = this.versionManager.checkCompatibility(config);
      
      if (compatInfo.requiresMigration) {
        this.logger.info(`Config at ${filePath} requires migration from v${this.versionManager.extractVersion(config).major}.${this.versionManager.extractVersion(config).minor}.${this.versionManager.extractVersion(config).patch}`);
        
        if (options.autoMigrate !== false) {
          // Create backup before migration
          await this.versionManager.createBackup(config, absolutePath);
          
          // Perform migration
          config = await this.versionManager.migrateConfig(config);
          
          // Save migrated config back to file
          await this.saveClaude(absolutePath, config);
          
          this.logger.info(`Config successfully migrated and saved to ${absolutePath}`);
        } else {
          this.logger.warn(`Config migration required but autoMigrate is disabled. Use with autoMigrate: true to perform migration.`);
        }
      }

      // Add version metadata if not present
      if (!config.$version || !config.$schema) {
        config = this.versionManager.addVersionMetadata(config);
      }
      
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
    const skipInheritance = '_exported' in config;
    const content = this.configToClaudeFormat(config, skipInheritance);
    await fs.writeFile(filePath, content, 'utf-8');
    
    // Update cache
    const pathResolver = PathResolver.getInstance();
    const absolutePath = pathResolver.resolveAbsolutePath(filePath);
    this.configCache.set(absolutePath, { ...config, _lastModified: new Date().toISOString() });
  }

  /**
   * Convert config object back to CLAUDE.md format
   */
  private configToClaudeFormat(config: ClaudeConfig, skipInheritance = false): string {
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
    if (config.instructions && config.instructions.length > 0) {
      lines.push('# Instructions');
      lines.push('');
      config.instructions.forEach(instruction => {
        lines.push(instruction);
      });
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

    // Add inheritance configuration (but not for exported profiles)
    if (config.inheritance && !skipInheritance) {
      const inheritance = config.inheritance as {
        enabled?: boolean;
        baseProfiles?: string[];
        overrideStrategy?: string;
        mergeArrays?: boolean;
        allowToolsAppend?: string[];
        sectionAppendList?: string[];
      };
      lines.push('# Inheritance Configuration');
      lines.push('');
      lines.push(`Enabled: ${inheritance.enabled}`);
      if (inheritance.baseProfiles?.length) {
        lines.push(`Base Profiles: ${inheritance.baseProfiles.join(', ')}`);
      }
      if (inheritance.overrideStrategy) {
        lines.push(`Override Strategy: ${inheritance.overrideStrategy}`);
      }
      if (inheritance.mergeArrays !== undefined) {
        lines.push(`Merge Arrays: ${inheritance.mergeArrays}`);
      }
      if (inheritance.allowToolsAppend?.length) {
        lines.push(`Allow Tools Append: ${inheritance.allowToolsAppend.join(', ')}`);
      }
      if (inheritance.sectionAppendList?.length) {
        lines.push(`Section Append List: ${inheritance.sectionAppendList.join(', ')}`);
      }
      lines.push('');
    }

    // Add custom sections (skip inheritance and metadata fields)
    const skipFields = ['instructions', 'customInstructions', 'rules', 'knowledge', 'context', 'tools', 'memory', 'projectName', 'inheritance'];
    if (skipInheritance) {
      skipFields.push('content'); // Skip content when exporting to avoid including original inheritance sections
    }
    
    for (const [key, value] of Object.entries(config)) {
      if (key.startsWith('_') || skipFields.includes(key)) {
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
        .map(file => {
          const pathResolver = PathResolver.getInstance();
          return pathResolver.resolveAbsolutePath(path.join(directory, file));
        });
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

  /**
   * Check config version compatibility without loading
   */
  async checkConfigVersion(filePath: string): Promise<{ version: string; compatible: boolean; requiresMigration: boolean }> {
    try {
      const pathResolver = PathResolver.getInstance();
      const absolutePath = pathResolver.resolveAbsolutePath(filePath);
      
      const content = await fs.readFile(absolutePath, 'utf-8');
      const config = this.parseClaude(content) as VersionedConfig;
      
      const compatInfo = this.versionManager.checkCompatibility(config);
      const version = this.versionManager.extractVersion(config);
      
      return {
        version: `${version.major}.${version.minor}.${version.patch}`,
        compatible: compatInfo.compatible,
        requiresMigration: compatInfo.requiresMigration
      };
    } catch (_error) {
      throw new Error(`Failed to check version for ${filePath}: ${_error}`);
    }
  }

  /**
   * Get current schema version
   */
  getCurrentSchemaVersion(): string {
    const version = SchemaVersionManager.getCurrentVersion();
    return `${version.major}.${version.minor}.${version.patch}`;
  }

  /**
   * Apply Claude configuration
   */
  async applyClaudeConfig(config: ClaudeConfig, options?: { 
    validate?: boolean;
    autoApply?: boolean;
    dryRun?: boolean;
    force?: boolean;
  }): Promise<{
    success: boolean;
    appliedContent: string;
    profileName?: string;
    dryRun?: boolean;
    autoApply?: boolean;
    force?: boolean;
    error?: string;
  }> {
    // Validate config by default unless explicitly disabled
    const shouldValidate = options?.validate !== false;
    
    if (shouldValidate && !this.validateConfig(config)) {
      return {
        success: false,
        appliedContent: '',
        error: 'Configuration validation failed - required fields missing',
        dryRun: options?.dryRun,
        autoApply: options?.autoApply,
        force: options?.force
      };
    }
    
    // Implementation would apply config to system
    // For now, return success with the content that was applied
    return {
      success: true,
      appliedContent: config.content || '',
      profileName: config.profileName,
      dryRun: options?.dryRun,
      autoApply: options?.autoApply,
      force: options?.force
    };
  }

  /**
   * Calculate checksum for config content
   */
  calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Export configuration to JSON
   */
  async exportConfiguration(config: ClaudeConfig, filePath: string): Promise<boolean> {
    try {
      const configData = {
        ...config,
        exportedAt: new Date().toISOString(),
        checksum: this.calculateChecksum(JSON.stringify(config))
      };
      await fs.writeFile(filePath, JSON.stringify(configData, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate profile name from file path
   */
  generateProfileName(filePath: string): string {
    if (!filePath) {
      return 'claude-config';
    }
    
    const basename = path.basename(filePath);
    const nameWithoutExt = basename.replace(/\.[^/.]+$/, '');
    
    // For CLAUDE.md files, return 'claude'
    if (nameWithoutExt.toLowerCase() === 'claude') {
      return 'claude';
    }
    
    // For other files, use the filename without extension
    if (nameWithoutExt) {
      return this.sanitizeProfileName(nameWithoutExt);
    }
    
    // Fallback for edge cases
    return 'claude-config';
  }

  /**
   * Get configuration metadata
   */
  async getConfigMetadata(filePath: string): Promise<{
    filePath: string;
    size: number;
    lastModified: Date;
    checksum: string;
  } | null> {
    try {
      const pathResolver = PathResolver.getInstance();
      const absolutePath = pathResolver.resolveAbsolutePath(filePath);
      const stats = await fs.stat(absolutePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      
      return {
        filePath: absolutePath,
        size: stats.size,
        lastModified: stats.mtime,
        checksum: this.calculateChecksum(content)
      };
    } catch {
      return null;
    }
  }

  /**
   * Import configuration from JSON
   */
  async importConfiguration(filePath: string): Promise<ClaudeConfig | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      // Remove metadata fields
      const { exportedAt: _exportedAt, checksum: _checksum, ...config } = data;
      return config as ClaudeConfig;
    } catch {
      return null;
    }
  }

  /**
   * List available configurations in directory
   */
  async listAvailableConfigs(directory: string): Promise<Array<{ profileName: string; filePath: string }>> {
    try {
      // Simple directory scanning for config files
      const files = await fs.readdir(directory);
      const configFiles = files.filter(file => file.endsWith('.md'))
                              .map(file => path.join(directory, file));
      
      return configFiles.map(filePath => ({
        profileName: this.generateProfileName(filePath),
        filePath: filePath
      }));
    } catch {
      return [];
    }
  }

  /**
   * Merge two configurations
   */
  mergeConfigurations(base: ClaudeConfig, override: ClaudeConfig): ClaudeConfig {
    const merged = { ...base };
    
    // Merge arrays
    const arrayFields = ['instructions', 'customInstructions', 'knowledge', 'rules', 'context', 'tools'];
    arrayFields.forEach(field => {
      if (override[field] && Array.isArray(override[field])) {
        const sourceArray = merged[field] || [];
        const overrideArray = override[field];
        merged[field] = (sourceArray as unknown[]).concat(overrideArray as unknown[]);
      }
    });
    
    // Merge other fields
    Object.keys(override).forEach(key => {
      if (!arrayFields.includes(key) && override[key] !== undefined) {
        // Special handling for content - combine if they have different sections
        if (key === 'content' && merged.content && override.content) {
          const baseContent = merged.content;
          const overrideContent = override.content;
          
          // If both have same section headers (e.g., both have "## Instructions"), 
          // override should replace. Otherwise, combine them.
          const baseSections = baseContent.match(/^##?\s+.+$/gm) || [];
          const overrideSections = overrideContent.match(/^##?\s+.+$/gm) || [];
          
          const hasOverlappingSections = baseSections.some(baseSection => 
            overrideSections.some(overrideSection => 
              baseSection.toLowerCase() === overrideSection.toLowerCase()
            )
          );
          
          if (hasOverlappingSections) {
            // Replace completely if same sections
            merged[key] = override[key];
          } else {
            // Combine if different sections
            merged[key] = `${baseContent}\n\n${overrideContent}`;
          }
        } else {
          merged[key] = override[key];
        }
      }
    });
    
    return merged;
  }

  /**
   * Parse markdown sections
   */
  parseMarkdownSections(content: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');
    let currentSection: string | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check for section headers
      const headerMatch = trimmed.match(/^#+\s*(.+)$/);
      if (headerMatch) {
        // Save previous section
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        
        // Normalize section names to match expected property names
        const sectionName = headerMatch[1].toLowerCase().trim();
        if (sectionName === 'custom instructions') {
          currentSection = 'customInstructions';
        } else if (sectionName === 'system instructions') {
          currentSection = 'instructions';
        } else if (sectionName === 'inheritance configuration') {
          currentSection = 'inheritance';
        } else {
          currentSection = sectionName.replace(/\s+/g, '_');
        }
        currentContent = [];
        continue;
      }
      
      // Add to current section content
      if (currentSection) {
        currentContent.push(line);
      }
    }
    
    // Save final section
    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }
    
    // Ensure expected sections exist even if empty
    const expectedSections = ['instructions', 'customInstructions', 'memory'];
    expectedSections.forEach(sectionName => {
      if (!(sectionName in sections)) {
        sections[sectionName] = '';
      }
    });
    
    return sections;
  }

  /**
   * Sanitize file path for security
   */
  sanitizePath(inputPath: string): string {
    // Remove dangerous characters and patterns
    let sanitized = inputPath.replace(/[<>:"|?*]/g, '_');
    sanitized = sanitized.replace(/\.\./g, '_');
    sanitized = path.normalize(sanitized);
    return sanitized;
  }

  /**
   * Validate configuration structure
   */
  validateConfig(config: ClaudeConfig): boolean {
    if (!config || typeof config !== 'object') {
      return false;
    }
    
    // Check required fields based on test expectations
    // content can be empty string, but filePath and profileName should not
    if (!('content' in config) || config.content === undefined || config.content === null) {
      return false;
    }
    
    const requiredNonEmptyFields = ['filePath', 'profileName'];
    for (const field of requiredNonEmptyFields) {
      if (!(field in config) || config[field] === undefined || config[field] === '') {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Validate content structure
   */
  validateContentStructure(content: string): boolean {
    if (!content || typeof content !== 'string') {
      return false;
    }
    
    // Basic markdown validation
    const hasHeaders = /^#+\s+.+$/m.test(content);
    return hasHeaders;
  }

  /**
   * Sanitize profile name
   */
  private sanitizeProfileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }
}