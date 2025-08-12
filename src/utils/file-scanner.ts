import * as fs from 'fs/promises';
import * as path from 'path';
import { YamlConfig, YamlConfigManager } from '../config/yaml-config.js';

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  directory: string;
  isClaudeConfig: boolean;
  matchedPattern?: string;
}

export interface ScanOptions {
  recursive?: boolean;
  maxDepth?: number;
  includeHidden?: boolean;
  followSymlinks?: boolean;
  customPatterns?: string[];
}

export class FileScanner {
  private yamlConfig: YamlConfigManager;

  constructor(yamlConfig: YamlConfigManager) {
    this.yamlConfig = yamlConfig;
  }

  /**
   * Recursively scan directories for CLAUDE.md files
   */
  async scanForClaudeFiles(
    targetPath: string = process.cwd(),
    options?: ScanOptions
  ): Promise<FileInfo[]> {
    const config = this.yamlConfig.getConfig();
    const scanOptions = this.mergeScanOptions(config, options);
    
    const files: FileInfo[] = [];
    
    // If includePaths are configured, scan those directories
    const includePaths = config.fileSettings?.includePaths || [];
    if (includePaths.length > 0) {
      for (const includePath of includePaths) {
        const absolutePath = path.isAbsolute(includePath) 
          ? includePath 
          : path.join(process.cwd(), includePath);
        
        try {
          const stat = await fs.stat(absolutePath);
          if (stat.isDirectory()) {
            await this.scanDirectory(absolutePath, files, scanOptions, 0);
          }
        } catch (error) {
          // Directory doesn't exist, skip it
          if (config.logging?.verboseFileLoading) {
            console.error(`Directory not found: ${absolutePath}`);
          }
        }
      }
    } else {
      // No includePaths configured, scan targetPath
      try {
        await this.scanDirectory(targetPath, files, scanOptions, 0);
      } catch (error) {
        if (config.logging?.verboseFileLoading) {
          console.error(`Directory scan error: ${targetPath}`, error);
        }
      }
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Recursively scan directory
   */
  private async scanDirectory(
    dirPath: string,
    results: FileInfo[],
    options: Required<ScanOptions>,
    currentDepth: number
  ): Promise<void> {
    // Check maximum depth
    if (options.maxDepth > 0 && currentDepth >= options.maxDepth) {
      return;
    }

    // Check if directory should be included
    if (!this.yamlConfig.shouldIncludeDirectory(dirPath)) {
      return;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip hidden files/directories
        if (!options.includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        // Check exclusion patterns
        if (this.yamlConfig.isExcluded(fullPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively scan directory
          if (options.recursive) {
            await this.scanDirectory(fullPath, results, options, currentDepth + 1);
          }
        } else if (entry.isFile() || (entry.isSymbolicLink() && options.followSymlinks)) {
          // Check file extension
          if (!this.yamlConfig.isAllowedExtension(fullPath)) {
            continue;
          }

          const fileInfo = await this.createFileInfo(fullPath, options);
          if (fileInfo) {
            results.push(fileInfo);
          }
        }
      }
    } catch (error) {
      const config = this.yamlConfig.getConfig();
      if (config.logging?.verboseFileLoading) {
        console.warn(`⚠️ Directory access error: ${dirPath}`, error);
      }
    }
  }

  /**
   * Create file info
   */
  private async createFileInfo(filePath: string, options: Required<ScanOptions>): Promise<FileInfo | null> {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) return null;

      const config = this.yamlConfig.getConfig();
      const name = path.basename(filePath);
      const extension = path.extname(filePath);
      const directory = path.dirname(filePath);

      // Check if this is a CLAUDE.md file
      const isClaudeConfig = this.isClaudeConfigFile(filePath, options);
      let matchedPattern: string | undefined;

      if (isClaudeConfig) {
        matchedPattern = this.getMatchedPattern(filePath);
      }

      return {
        path: filePath,
        name,
        extension,
        directory,
        isClaudeConfig,
        matchedPattern
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if file is a CLAUDE configuration file
   */
  private isClaudeConfigFile(filePath: string, options: Required<ScanOptions>): boolean {
    const config = this.yamlConfig.getConfig();
    const configFiles = config.fileSettings?.configFiles;

    if (!configFiles) return false;

    const fileName = path.basename(filePath);

    // Check configured patterns
    const patterns = [
      configFiles.claude,
      configFiles.behavior,
      configFiles.custom,
      ...options.customPatterns
    ].filter(Boolean) as string[];

    return patterns.some(pattern => this.yamlConfig.matchesPattern(fileName, pattern));
  }

  /**
   * Get matched pattern
   */
  private getMatchedPattern(filePath: string): string | undefined {
    const config = this.yamlConfig.getConfig();
    const configFiles = config.fileSettings?.configFiles;

    if (!configFiles) return undefined;

    const fileName = path.basename(filePath);
    const patterns = [
      { name: 'claude', pattern: configFiles.claude },
      { name: 'behavior', pattern: configFiles.behavior },
      { name: 'custom', pattern: configFiles.custom }
    ].filter(p => p.pattern) as Array<{ name: string; pattern: string }>;

    for (const { name, pattern } of patterns) {
      if (this.yamlConfig.matchesPattern(fileName, pattern)) {
        return `${name}:${pattern}`;
      }
    }

    return undefined;
  }

  /**
   * Merge scan options
   */
  private mergeScanOptions(config: YamlConfig, options?: ScanOptions): Required<ScanOptions> {
    const defaultOptions = {
      recursive: config.directoryScanning?.recursive ?? true,
      maxDepth: config.directoryScanning?.maxDepth ?? 3,
      includeHidden: config.directoryScanning?.includeHidden ?? false,
      followSymlinks: config.directoryScanning?.followSymlinks ?? false,
      customPatterns: []
    };

    return {
      ...defaultOptions,
      ...options,
      customPatterns: [...defaultOptions.customPatterns, ...(options?.customPatterns || [])]
    };
  }

  /**
   * Find files by specific pattern
   */
  async findFilesByPattern(pattern: string, searchPaths?: string[]): Promise<FileInfo[]> {
    const config = this.yamlConfig.getConfig();
    const paths = searchPaths || config.fileSettings?.includePaths || [process.cwd()];
    
    const allFiles: FileInfo[] = [];

    for (const searchPath of paths) {
      try {
        const files = await this.scanForClaudeFiles(searchPath, {
          customPatterns: [pattern]
        });
        allFiles.push(...files);
      } catch (error) {
        if (config.logging?.verboseFileLoading) {
          console.warn(`⚠️ Pattern search error: ${searchPath}`, error);
        }
      }
    }

    return allFiles;
  }

  /**
   * Normalize file path
   */
  static normalizePath(filePath: string): string {
    return path.resolve(filePath);
  }

  /**
   * Check if file exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if directory exists
   */
  static async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}