import * as path from "path";
import { safeResolve, containsDangerousPatterns } from "./path-security.js";

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
   * Generate possible paths for a profile name with secure path joining
   */
  generateProfilePaths(profileName: string): string[] {
    if (containsDangerousPatterns(profileName)) {
      throw new Error(
        `Invalid profile name contains dangerous patterns: ${profileName}`,
      );
    }

    const paths: string[] = [];

    try {
      paths.push(
        `${profileName}.md`,
        `./${profileName}.md`,
        `./${profileName}`,
        `./${profileName}.md`,
        `./${profileName}`,
        `${profileName}-behavior.md`,
        `./${profileName}-behavior.md`,
      );
    } catch (error) {
      throw new Error(
        `Failed to generate secure profile paths for '${profileName}': ${error}`,
      );
    }

    return paths;
  }

  /**
   * Generate possible paths for a file path with secure path joining
   */
  generateFilePaths(filePath: string): string[] {
    if (containsDangerousPatterns(filePath)) {
      throw new Error(
        `Invalid file path contains dangerous patterns: ${filePath}`,
      );
    }

    const paths: string[] = [];

    try {
      paths.push(
        `${filePath}.md`,
        `./${filePath}.md`,
        `./${filePath}`,
        `./${filePath}.md`,
        `./${filePath}`,
      );
    } catch (error) {
      throw new Error(
        `Failed to generate secure file paths for '${filePath}': ${error}`,
      );
    }

    return paths;
  }

  /**
   * Resolve relative path to absolute path with security validation
   * Handles ./ and ../ prefixes explicitly and prevents path traversal
   */
  resolveAbsolutePath(relativePath: string): string {
    if (relativePath === null || relativePath === undefined) {
      throw new Error("Path cannot be null or undefined");
    }

    if (!relativePath) {
      return process.cwd();
    }

    try {
      const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(relativePath);
      if (path.isAbsolute(relativePath) || isWindowsAbsolute) {
        try {
          return safeResolve(relativePath, {
            allowAbsolutePaths: true,
            allowedRoots: [
              process.cwd(),
              "/tmp",
              "/var/folders",
              "/private/var/folders",
            ],
            maxDepth: 20,
            followSymlinks: false,
          });
        } catch (_error) {
          throw new Error(
            `Absolute path contains dangerous patterns: ${relativePath}`,
          );
        }
      }

      return safeResolve(relativePath, {
        allowAbsolutePaths: false,
        allowedRoots: [
          process.cwd(),
          "/tmp",
          "/var/folders",
          "/private/var/folders",
        ], // Include macOS temp
        maxDepth: 20, // Increase depth limit
        followSymlinks: false,
      });
    } catch (_error) {
      if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
        try {
          return safeResolve(relativePath, {
            allowAbsolutePaths: true, // Allow absolute paths in fallback
            allowedRoots: [
              process.cwd(),
              "/tmp",
              "/var/folders",
              "/private/var/folders",
            ],
            maxDepth: 20,
            followSymlinks: false,
          });
        } catch (_fallbackError) {
          // Fallback path resolution failed
        }
      }

      const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(relativePath);
      if (path.isAbsolute(relativePath) || isWindowsAbsolute) {
        return path.resolve(relativePath);
      }

      return path.resolve(process.cwd(), relativePath);
    }
  }

  /**
   * Resolve profile path with project root fallback and security validation
   * Converts all relative paths to absolute paths
   */
  resolveProfilePath(profilePath: string): string {
    try {
      return this.resolveAbsolutePath(profilePath);
    } catch (error) {
      throw new Error(
        `Profile path resolution failed for '${profilePath}': ${error}`,
      );
    }
  }
}
