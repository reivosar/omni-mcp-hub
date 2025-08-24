import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { minimatch } from 'minimatch';
import { ILogger, SilentLogger } from '../utils/logger.js';
import { PathResolver } from '../utils/path-resolver.js';
import { SchemaValidator, ValidationResult } from '../validation/schema-validator.js';
import { defaultPathValidator, safeResolve, containsDangerousPatterns } from '../utils/path-security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// External server configuration interface
export interface ExternalServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
}

// YAML configuration file type definitions
export interface YamlConfig {
  mode?: 'minimal' | 'standard' | 'advanced';
  preset?: 'claude-basic' | 'claude-enterprise' | 'custom';
  autoLoad?: {
    profiles?: Array<{
      name: string;
      path: string;
      autoApply?: boolean;
    }>;
  };
  fileSettings?: {
    configFiles?: {
      claude?: string;
      behavior?: string;
      custom?: string;
    };
    includePaths?: string[];
    excludePatterns?: string[];
    allowedExtensions?: string[];
  };
  directoryScanning?: {
    recursive?: boolean;
    maxDepth?: number;
    includeHidden?: boolean;
    followSymlinks?: boolean;
  };
  profileManagement?: {
    allowDuplicateNames?: boolean;
    autoNamePattern?: string;
    defaultProfile?: string;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    verboseFileLoading?: boolean;
    verboseProfileSwitching?: boolean;
  };
  externalServers?: {
    enabled?: boolean;
    servers?: ExternalServerConfig[];
    autoConnect?: boolean;
    retry?: {
      maxAttempts?: number;
      delayMs?: number;
    };
  };
}

// Default configuration
const DEFAULT_CONFIG: YamlConfig = {
  mode: 'minimal',
  preset: 'claude-basic',
  autoLoad: {
    profiles: []
  },
  fileSettings: {
    configFiles: {
      claude: "CLAUDE.md",
      behavior: "*-behavior.md",
      custom: "*-config.md"
    },
    includePaths: ["./configs/", "./profiles/"],
    excludePatterns: ["*.tmp", "*.backup", "*~", ".git/**", "node_modules/**", "dist/**"],
    allowedExtensions: [".md", ".markdown", ".txt"]
  },
  directoryScanning: {
    recursive: true,
    maxDepth: 3,
    includeHidden: false,
    followSymlinks: false
  },
  profileManagement: {
    allowDuplicateNames: false,
    autoNamePattern: "%filename%",
    defaultProfile: "default"
  },
  logging: {
    level: "info",
    verboseFileLoading: true,
    verboseProfileSwitching: false
  },
  externalServers: {
    enabled: true,
    servers: [],
    autoConnect: true,
    retry: {
      maxAttempts: 3,
      delayMs: 1000
    }
  }
};

export class YamlConfigManager {
  private config: YamlConfig = DEFAULT_CONFIG;
  private configPath: string = '';
  private logger: ILogger;
  private validator?: SchemaValidator;

  constructor(configPath?: string, logger?: ILogger) {
    if (configPath) {
      this.configPath = configPath;
    }
    this.logger = logger || new SilentLogger();
  }

  /**
   * Enable schema validation
   */
  async enableValidation(): Promise<void> {
    if (!this.validator) {
      this.validator = new SchemaValidator(this.logger);
      await this.validator.initialize();
    }
  }

  /**
   * Validate configuration file
   */
  async validateConfig(configPath?: string): Promise<ValidationResult> {
    if (!this.validator) {
      await this.enableValidation();
    }
    
    const yamlPath = configPath || this.configPath || this.findYamlConfigFile();
    return this.validator!.validateConfig(yamlPath);
  }

  /**
   * Load YAML configuration file
   */
  async loadYamlConfig(configPath?: string, options?: { validate?: boolean }): Promise<YamlConfig> {
    const yamlPath = configPath || this.configPath || this.findYamlConfigFile();
    
    try {
      const content = await fs.readFile(yamlPath, 'utf-8');
      const yamlData = yaml.load(content) as YamlConfig;
      
      // Perform validation if requested
      if (options?.validate) {
        try {
          if (!this.validator) {
            await this.enableValidation();
          }
          const validationResult = await this.validator!.validateConfig(yamlPath);
          
          if (!validationResult.valid) {
            this.logger.warn(`Configuration validation failed for ${yamlPath}:`);
            for (const error of validationResult.errors) {
              this.logger.warn(`  - ${error.field}: ${error.message}`);
            }
          }
          
          if (validationResult.warnings.length > 0) {
            this.logger.info(`Configuration warnings for ${yamlPath}:`);
            for (const warning of validationResult.warnings) {
              this.logger.info(`  - ${warning.field}: ${warning.message}`);
            }
          }
        } catch (validationError) {
          this.logger.warn(`Schema validation failed: ${validationError}`);
        }
      }
      
      // Merge with default configuration
      this.config = this.mergeConfig(DEFAULT_CONFIG, yamlData);
      this.configPath = yamlPath;
      
      if (this.config.logging?.verboseFileLoading) {
        this.logger.debug(`Loaded YAML config: ${yamlPath}`);
      }
      
      return this.config;
    } catch (_error) {
      if (this.config.logging?.verboseFileLoading) {
        this.logger.debug(`YAML config not found, using defaults: ${yamlPath}`);
      }
      return this.config;
    }
  }

  /**
   * Auto-detect configuration file path with security validation
   */
  private findYamlConfigFile(): string {
    let configPath: string;
    
    // Check for environment variable first
    if (process.env.OMNI_CONFIG_PATH) {
      configPath = process.env.OMNI_CONFIG_PATH;
      console.log(`[YAML-CONFIG] Using config from OMNI_CONFIG_PATH: ${configPath}`);
      
      // Validate environment-provided path
      if (!defaultPathValidator.isPathSafe(configPath)) {
        throw new Error(`OMNI_CONFIG_PATH contains dangerous patterns: ${configPath}`);
      }
    } else {
      const pathResolver = PathResolver.getInstance();
      configPath = pathResolver.resolveAbsolutePath('omni-config.yaml');
      console.log(`[YAML-CONFIG] Looking for config file at: ${configPath}`);
      console.log(`[YAML-CONFIG] Current working directory: ${process.cwd()}`);
    }
    
    return configPath;
  }

  /**
   * Deep merge configurations
   */
  private mergeConfig(defaultConfig: YamlConfig, userConfig: YamlConfig): YamlConfig {
    const merged = { ...defaultConfig };

    if (userConfig.autoLoad) {
      merged.autoLoad = { ...defaultConfig.autoLoad, ...userConfig.autoLoad };
    }

    if (userConfig.fileSettings) {
      merged.fileSettings = {
        ...defaultConfig.fileSettings,
        ...userConfig.fileSettings,
        configFiles: {
          ...defaultConfig.fileSettings?.configFiles,
          ...userConfig.fileSettings.configFiles
        }
      };
    }

    if (userConfig.directoryScanning) {
      merged.directoryScanning = { ...defaultConfig.directoryScanning, ...userConfig.directoryScanning };
    }

    if (userConfig.profileManagement) {
      merged.profileManagement = { ...defaultConfig.profileManagement, ...userConfig.profileManagement };
    }

    if (userConfig.logging) {
      merged.logging = { ...defaultConfig.logging, ...userConfig.logging };
    }

    if (userConfig.externalServers) {
      merged.externalServers = { ...defaultConfig.externalServers, ...userConfig.externalServers };
    }

    return merged;
  }

  /**
   * Get current configuration
   */
  getConfig(): YamlConfig {
    return this.config;
  }

  /**
   * Check if logging should be output based on level
   */
  shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const configLevel = this.config.logging?.level || 'info';
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[configLevel];
  }

  /**
   * Log message with level check
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    if (this.shouldLog(level)) {
      this.logger.debug(`[${level.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Get default profile name
   */
  getDefaultProfile(): string {
    return this.config.profileManagement?.defaultProfile || 'default';
  }

  /**
   * Check if verbose profile switching is enabled
   */
  isVerboseProfileSwitching(): boolean {
    return this.config.logging?.verboseProfileSwitching ?? false;
  }

  /**
   * Create a YamlConfigManager with test configuration
   */
  static createForTest(config: YamlConfig): YamlConfigManager {
    const manager = new YamlConfigManager();
    manager.config = { ...DEFAULT_CONFIG, ...config };
    return manager;
  }

  /**
   * Create a YamlConfigManager for specific config file path
   */
  static createWithPath(configPath: string, logger?: ILogger): YamlConfigManager {
    return new YamlConfigManager(configPath, logger);
  }

  /**
   * Check if file path matches pattern
   */
  matchesPattern(filePath: string, pattern: string): boolean {
    const fileName = path.basename(filePath);
    return minimatch(fileName, pattern, { nocase: true });
  }

  /**
   * Check if file matches exclusion patterns
   */
  isExcluded(filePath: string): boolean {
    const excludePatterns = this.config.fileSettings?.excludePatterns || [];
    return excludePatterns.some(pattern => {
      try {
        // Check filename match
        if (this.matchesPattern(filePath, pattern)) return true;
        
        // Check full path match (for directory patterns)
        let regexPattern = pattern
          .replace(/\*/g, '__ASTERISK__')
          .replace(/\?/g, '__QUESTION__')
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/__ASTERISK__/g, '.*')
          .replace(/__QUESTION__/g, '.');
        
        const regex = new RegExp(regexPattern, 'i');
        return regex.test(filePath);
      } catch (_error) {
        // Fallback to simple string comparison on regex error
        return filePath.toLowerCase().includes(pattern.toLowerCase());
      }
    });
  }

  /**
   * Check if file extension is allowed
   */
  isAllowedExtension(filePath: string): boolean {
    const allowedExtensions = this.config.fileSettings?.allowedExtensions || [];
    const ext = path.extname(filePath).toLowerCase();
    return allowedExtensions.includes(ext);
  }

  /**
   * Check if directory should be included with security validation
   */
  shouldIncludeDirectory(dirPath: string): boolean {
    // Validate directory path security (but allow simple paths)
    if (containsDangerousPatterns(dirPath)) {
      if (this.config.logging?.verboseFileLoading) {
        this.logger.debug(`Directory path contains dangerous patterns: ${dirPath}`);
      }
      return false;
    }
    
    const includePaths = this.config.fileSettings?.includePaths || [];
    if (includePaths.length === 0) return true;

    return includePaths.some(includePath => {
      try {
        const pathResolver = PathResolver.getInstance();
        const resolvedIncludePath = pathResolver.resolveAbsolutePath(includePath);
        const resolvedDirPath = pathResolver.resolveAbsolutePath(dirPath);
        return resolvedDirPath.startsWith(resolvedIncludePath);
      } catch (error) {
        if (this.config.logging?.verboseFileLoading) {
          this.logger.debug(`Path resolution failed for include check: ${includePath} -> ${dirPath}`, error);
        }
        return false;
      }
    });
  }

  /**
   * Auto-generate profile name
   */
  generateProfileName(filePath: string): string {
    const pattern = this.config.profileManagement?.autoNamePattern || '%filename%';
    const filename = path.basename(filePath, path.extname(filePath));
    const dirname = path.basename(path.dirname(filePath));

    return pattern
      .replace('%filename%', filename)
      .replace('%dirname%', dirname)
      .replace('%path%', filePath);
  }

  /**
   * Save configuration file with security validation
   */
  async saveYamlConfig(configPath?: string): Promise<void> {
    const pathResolver = PathResolver.getInstance();
    const savePath = configPath || this.configPath || pathResolver.resolveAbsolutePath('omni-config.yaml');
    
    // Validate save path security (but allow simple paths)
    if (containsDangerousPatterns(savePath)) {
      throw new Error(`Configuration save path contains dangerous patterns: ${savePath}`);
    }
    
    try {
      // Ensure path is within allowed roots with flexible validation
      safeResolve(savePath, {
        allowAbsolutePaths: true,
        allowedRoots: [process.cwd(), '/tmp', '/var/folders', '/private/var/folders'],
        maxDepth: 20
      });
      
      const yamlContent = yaml.dump(this.config, {
        indent: 2,
        lineWidth: 80,
        noRefs: true
      });

      await fs.writeFile(savePath, yamlContent, 'utf-8');
      
      if (this.config.logging?.verboseFileLoading) {
        this.logger.debug(`Saved YAML config: ${savePath}`);
      }
    } catch (error) {
      throw new Error(`Failed to save YAML config to '${savePath}': ${error}`);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<YamlConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
  }

  /**
   * Perform dry-run validation
   */
  async dryRun(configPath?: string): Promise<import('../validation/schema-validator.js').DryRunResult> {
    if (!this.validator) {
      await this.enableValidation();
    }
    
    const yamlPath = configPath || this.configPath || this.findYamlConfigFile();
    return this.validator!.dryRun(yamlPath, this.config);
  }

  /**
   * Format validation result for display
   */
  formatValidationResult(result: ValidationResult): string {
    if (!this.validator) {
      return 'Validator not initialized';
    }
    return this.validator.formatValidationResult(result);
  }

  /**
   * Get validation instance (create if needed)
   */
  async getValidator(): Promise<SchemaValidator> {
    if (!this.validator) {
      await this.enableValidation();
    }
    return this.validator!;
  }
}