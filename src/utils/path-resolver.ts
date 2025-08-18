import * as path from "path";

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
   * Get the YAML config path - fixed to current working directory
   */
  getYamlConfigPath(): string {
    return "./omni-config.yaml";
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
      `${searchDir}/${profileName}-behavior.md`,
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
      `./${filePath}`,
    ];
  }

  /**
   * Resolve relative path to absolute path
   * Handles ./ and ../ prefixes explicitly
   */
  resolveAbsolutePath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    
    // For relative paths starting with ./ or ../, resolve from current working directory
    if (relativePath.startsWith('./') || relativePath.startsWith('../')) {
      return path.resolve(process.cwd(), relativePath);
    }
    
    // For other relative paths, also resolve from current working directory
    return path.resolve(process.cwd(), relativePath);
  }

  /**
   * Resolve profile path with project root fallback
   * Converts all relative paths to absolute paths
   */
  resolveProfilePath(profilePath: string): string {
    // If already absolute, return as-is
    if (path.isAbsolute(profilePath)) {
      return profilePath;
    }
    
    // For relative paths, resolve from current working directory
    return this.resolveAbsolutePath(profilePath);
  }
}
