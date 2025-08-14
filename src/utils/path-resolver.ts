import * as path from 'path';

/**
 * Centralized path resolution for configuration files and profiles
 */
export class PathResolver {
  private static instance: PathResolver;
  
  private constructor() {}
  
  static getInstance(): PathResolver {
    if (!PathResolver.instance) {
      PathResolver.instance = new PathResolver();
    }
    return PathResolver.instance;
  }

  /**
   * Get the YAML config path from environment variable or default
   */
  getYamlConfigPath(): string {
    return process.env.OMNI_CONFIG_PATH || './omni-config.yaml';
  }

  /**
   * Get the directory where profiles should be searched
   * Based on the directory containing the YAML config file
   */
  getProfileSearchDirectory(): string {
    const configPath = this.getYamlConfigPath();
    return path.dirname(configPath);
  }

  /**
   * Get absolute YAML config path
   */
  getAbsoluteYamlConfigPath(): string {
    const configPath = this.getYamlConfigPath();
    if (path.isAbsolute(configPath)) {
      return configPath;
    }
    return path.resolve(process.cwd(), configPath);
  }

  /**
   * Generate possible paths for a profile name
   */
  generateProfilePaths(profileName: string): string[] {
    const searchDir = this.getProfileSearchDirectory();
    return [
      `${profileName}.md`,
      `${searchDir}/${profileName}.md`,
      `${searchDir}/${profileName}`,
      `./${profileName}.md`,
      `./${profileName}`,
      `${profileName}-behavior.md`,
      `${searchDir}/${profileName}-behavior.md`
    ];
  }

  /**
   * Generate possible paths for a file path (when resolving file paths)
   */
  generateFilePaths(filePath: string): string[] {
    const searchDir = this.getProfileSearchDirectory();
    return [
      `${filePath}.md`,
      `${searchDir}/${filePath}.md`,
      `${searchDir}/${filePath}`,
      `./${filePath}.md`,
      `./${filePath}`
    ];
  }

  /**
   * Resolve relative path to absolute path
   */
  resolveAbsolutePath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.resolve(process.cwd(), relativePath);
  }
}