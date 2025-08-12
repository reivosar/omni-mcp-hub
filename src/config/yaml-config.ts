import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// YAML configuration file type definitions
export interface YamlConfig {
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
}

// Default configuration
const DEFAULT_CONFIG: YamlConfig = {
  autoLoad: {
    profiles: []
  },
  fileSettings: {
    configFiles: {
      claude: "CLAUDE.md",
      behavior: "*-behavior.md",
      custom: "*-config.md"
    },
    includePaths: ["./examples/", "./configs/", "./profiles/"],
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
    verboseProfileSwitching: true
  }
};

export class YamlConfigManager {
  private config: YamlConfig = DEFAULT_CONFIG;
  private configPath: string = '';

  /**
   * Load YAML configuration file
   */
  async loadYamlConfig(configPath?: string): Promise<YamlConfig> {
    const yamlPath = configPath || this.findYamlConfigFile();
    
    try {
      const content = await fs.readFile(yamlPath, 'utf-8');
      const yamlData = yaml.load(content) as YamlConfig;
      
      // Merge with default configuration
      this.config = this.mergeConfig(DEFAULT_CONFIG, yamlData);
      this.configPath = yamlPath;
      
      if (this.config.logging?.verboseFileLoading) {
        console.log(`Loaded YAML config: ${yamlPath}`);
      }
      
      return this.config;
    } catch (error) {
      if (this.config.logging?.verboseFileLoading) {
        console.log(`YAML config not found, using defaults: ${yamlPath}`);
      }
      return this.config;
    }
  }

  /**
   * Auto-detect configuration file path
   */
  private findYamlConfigFile(): string {
    // Only look for omni-config.yaml in the current working directory
    return path.join(process.cwd(), 'omni-config.yaml');
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

    return merged;
  }

  /**
   * Get current configuration
   */
  getConfig(): YamlConfig {
    return this.config;
  }

  /**
   * Check if file path matches pattern
   */
  matchesPattern(filePath: string, pattern: string): boolean {
    const fileName = path.basename(filePath);
    
    try {
      // Convert glob pattern to regex
      // First temporarily replace * and ?
      let regexPattern = pattern
        .replace(/\*/g, '__ASTERISK__')
        .replace(/\?/g, '__QUESTION__')
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
        .replace(/__ASTERISK__/g, '.*') // * -> .*
        .replace(/__QUESTION__/g, '.'); // ? -> .
      
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(fileName);
    } catch (error) {
      // Fallback to simple string comparison on regex error
      return fileName.toLowerCase() === pattern.toLowerCase();
    }
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
      } catch (error) {
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
   * Check if directory should be included
   */
  shouldIncludeDirectory(dirPath: string): boolean {
    const includePaths = this.config.fileSettings?.includePaths || [];
    if (includePaths.length === 0) return true;

    return includePaths.some(includePath => {
      const resolvedIncludePath = path.resolve(includePath);
      const resolvedDirPath = path.resolve(dirPath);
      return resolvedDirPath.startsWith(resolvedIncludePath);
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
   * Save configuration file
   */
  async saveYamlConfig(configPath?: string): Promise<void> {
    const savePath = configPath || this.configPath || path.join(process.cwd(), 'omni-config.yaml');
    const yamlContent = yaml.dump(this.config, {
      indent: 2,
      lineWidth: 80,
      noRefs: true
    });

    await fs.writeFile(savePath, yamlContent, 'utf-8');
    
    if (this.config.logging?.verboseFileLoading) {
      console.log(`Saved YAML config: ${savePath}`);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<YamlConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
  }
}