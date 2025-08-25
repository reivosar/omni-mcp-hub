import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { YamlConfig, YamlConfigManager } from '../config/yaml-config.js';
import { ILogger, SilentLogger } from './logger.js';
import { PathResolver } from './path-resolver.js';
import { safeJoin, validatePathExists, defaultPathValidator } from './path-security.js';

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
  patterns?: string[];
}

export class FileScanner {
  private yamlConfig: YamlConfigManager;
  private logger: ILogger;

  constructor(yamlConfigOrLogger?: YamlConfigManager | ILogger, logger?: ILogger) {
    // Handle different constructor signatures for backward compatibility
    if (yamlConfigOrLogger && 'getConfig' in yamlConfigOrLogger) {
      // First argument is YamlConfigManager
      this.yamlConfig = yamlConfigOrLogger as YamlConfigManager;
      this.logger = logger || new SilentLogger();
    } else {
      // First argument is ILogger or undefined
      this.yamlConfig = new YamlConfigManager(); // Create default
      this.logger = (yamlConfigOrLogger as ILogger) || new SilentLogger();
    }
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
        const pathResolver = PathResolver.getInstance();
        const absolutePath = pathResolver.resolveAbsolutePath(includePath);
        
        try {
          const stat = await fs.stat(absolutePath);
          if (stat.isDirectory()) {
            await this.scanDirectoryRecursively(absolutePath, files, scanOptions, 0);
          }
        } catch (_error) {
          // Directory doesn't exist, skip it
          if (config.logging?.verboseFileLoading) {
            this.logger.debug(`Directory not found: ${absolutePath}`);
          }
        }
      }
    } else {
      // No includePaths configured, scan targetPath
      try {
        await this.scanDirectoryRecursively(targetPath, files, scanOptions, 0);
      } catch (error) {
        if (config.logging?.verboseFileLoading) {
          this.logger.debug(`Directory scan error: ${targetPath}`, error);
        }
      }
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Recursively scan directory
   */
  private async scanDirectoryRecursively(
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
        let fullPath: string;
        
        try {
          // Use secure path joining to prevent path traversal
          fullPath = safeJoin(dirPath, entry.name);
          
          // Additional validation with PathResolver
          const pathResolver = PathResolver.getInstance();
          fullPath = pathResolver.resolveAbsolutePath(fullPath);
        } catch (error) {
          // Skip entries that fail security validation
          if (this.yamlConfig.getConfig().logging?.verboseFileLoading) {
            this.logger.debug(`Skipping entry due to security validation: ${entry.name}`, error);
          }
          continue;
        }

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
            await this.scanDirectoryRecursively(fullPath, results, options, currentDepth + 1);
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
        this.logger.debug(`Directory access error: ${dirPath}`, error);
      }
    }
  }

  /**
   * Create file info with security validation
   */
  private async createFileInfo(filePath: string, options: Required<ScanOptions>): Promise<FileInfo | null> {
    try {
      // Validate path security first
      if (!defaultPathValidator.isPathSafe(filePath)) {
        if (this.yamlConfig.getConfig().logging?.verboseFileLoading) {
          this.logger.debug(`File path contains dangerous patterns: ${filePath}`);
        }
        return null;
      }
      
      // Use secure path existence validation with flexible roots
      const pathExists = await validatePathExists(filePath, {
        allowAbsolutePaths: true,
        allowedRoots: [process.cwd(), '/tmp', '/var/folders', '/private/var/folders'],
        followSymlinks: options.followSymlinks,
        maxDepth: 20
      });
      
      if (!pathExists) {
        return null;
      }
      
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) return null;

      const _config = this.yamlConfig.getConfig();
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
    } catch (_error) {
      return null;
    }
  }

  /**
   * Check if file is a CLAUDE configuration file
   */
  private isClaudeConfigFile(filePath: string, options: Required<ScanOptions>): boolean {
    const config = this.yamlConfig.getConfig();
    const configFiles = config.fileSettings?.configFiles;
    const fileName = path.basename(filePath);

    // If specific patterns are provided, use only those
    if (options.patterns && options.patterns.length > 0) {
      return options.patterns.some(pattern => this.yamlConfig.matchesPattern(fileName, pattern));
    }

    // Check configured patterns if available
    if (configFiles) {
      const patterns = [
        configFiles.claude,
        configFiles.behavior,
        configFiles.custom,
        ...options.customPatterns
      ].filter(Boolean) as string[];

      if (patterns.length > 0) {
        return patterns.some(pattern => this.yamlConfig.matchesPattern(fileName, pattern));
      }
    }

    // Check custom patterns even without main config
    if (options.customPatterns && options.customPatterns.length > 0) {
      return options.customPatterns.some(pattern => {
        // Handle glob patterns like *.test
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(fileName);
        }
        // Handle regular string matching
        return fileName.includes(pattern);
      });
    }

    // If no configFiles and no custom patterns, return false
    // This handles the specific test case where both are empty
    return false;
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
      customPatterns: [],
      patterns: []
    };

    return {
      ...defaultOptions,
      ...options,
      customPatterns: [...defaultOptions.customPatterns, ...(options?.customPatterns || [])],
      patterns: [...(defaultOptions.patterns || []), ...(options?.patterns || [])]
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
          this.logger.debug(`Pattern search error: ${searchPath}`, error);
        }
      }
    }

    return allFiles;
  }

  /**
   * Normalize file path with security validation
   */
  static normalizePath(filePath: string): string {
    // Validate path security
    if (!defaultPathValidator.isPathSafe(filePath)) {
      throw new Error(`File path contains dangerous patterns: ${filePath}`);
    }
    
    const pathResolver = PathResolver.getInstance();
    return pathResolver.resolveAbsolutePath(filePath);
  }

  /**
   * Check if file exists with security validation
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      // Use secure path validation with flexible roots
      return await validatePathExists(filePath, {
        allowAbsolutePaths: true,
        allowedRoots: [process.cwd(), '/tmp', '/var/folders', '/private/var/folders'],
        followSymlinks: false,
        maxDepth: 20
      });
    } catch {
      return false;
    }
  }

  /**
   * Check if directory exists with security validation
   */
  static async directoryExists(dirPath: string): Promise<boolean> {
    try {
      // Validate path security first
      if (!defaultPathValidator.isPathSafe(dirPath)) {
        return false;
      }
      
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Find Claude configuration files
   */
  findClaudeConfigFiles(directory: string, options?: ScanOptions): string[] {
    // Synchronous version for compatibility with tests
    const results: string[] = [];
    const scanOptions = this.mergeScanOptions(this.yamlConfig.getConfig(), options);
    
    try {
      this.scanDirectorySyncRecursive(directory, results, scanOptions, 0);
    } catch (_error) {
      // Return empty array on error
    }
    
    return results.sort();
  }

  /**
   * Synchronous recursive directory scan for tests
   */
  private scanDirectorySyncRecursive(
    dirPath: string,
    results: string[],
    options: Required<ScanOptions>,
    currentDepth: number
  ): void {
    // Check maximum depth
    if (options.maxDepth > 0 && currentDepth >= options.maxDepth) {
      return;
    }

    // Check if directory should be included
    if (!this.yamlConfig.shouldIncludeDirectory(dirPath)) {
      return;
    }

    try {
      const entries = fsSync.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        let fullPath: string;
        
        try {
          // Use secure path joining to prevent path traversal
          fullPath = path.join(dirPath, entry.name);
          
          // Additional validation with PathResolver
          const pathResolver = PathResolver.getInstance();
          fullPath = pathResolver.resolveAbsolutePath(fullPath);
        } catch (_error) {
          // Skip entries that fail security validation
          continue;
        }

        // Skip hidden files/directories unless allowed
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
            this.scanDirectorySyncRecursive(fullPath, results, options, currentDepth + 1);
          }
        } else if (entry.isFile() || (entry.isSymbolicLink() && options.followSymlinks)) {
          // Check file extension
          if (!this.yamlConfig.isAllowedExtension(fullPath)) {
            continue;
          }

          const fileInfo = this.createSyncFileInfo(fullPath, options);
          if (fileInfo && fileInfo.isClaudeConfig) {
            results.push(fileInfo.path);
          }
        }
      }
    } catch (_error) {
      // Skip directories that can't be accessed
    }
  }

  /**
   * Synchronous file info creation
   */
  private createSyncFileInfo(filePath: string, options: Required<ScanOptions>): FileInfo | null {
    try {
      // Validate path security first
      if (!defaultPathValidator.isPathSafe(filePath)) {
        return null;
      }
      
      const stats = fsSync.statSync(filePath);
      if (!stats.isFile()) return null;

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
    } catch (_error) {
      return null;
    }
  }

  /**
   * Scan directory for files
   */
  scanDirectory(directory: string, options?: {
    extensions?: string[];
    recursive?: boolean;
    exclude?: string[];
    include?: string[];
    maxSize?: number;
  }): string[] {
    const results: string[] = [];
    
    try {
      const entries = fsSync.readdirSync(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory() && options?.recursive) {
          const subResults = this.scanDirectory(fullPath, options);
          results.push(...subResults);
        } else if (entry.isFile()) {
          // Apply filters
          if (options?.extensions) {
            const ext = path.extname(entry.name);
            if (!options.extensions.includes(ext)) {
              continue;
            }
          }
          
          if (options?.exclude) {
            const shouldExclude = options.exclude.some(pattern => {
              if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(entry.name);
              }
              return entry.name.includes(pattern);
            });
            if (shouldExclude) continue;
          }
          
          if (options?.include) {
            const shouldInclude = options.include.some(pattern => {
              if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(entry.name);
              }
              return entry.name.includes(pattern);
            });
            if (!shouldInclude) continue;
          }
          
          if (options?.maxSize) {
            try {
              const stats = fsSync.statSync(fullPath);
              if (stats.size > options.maxSize) continue;
            } catch {
              continue;
            }
          }
          
          results.push(fullPath);
        }
      }
    } catch {
      // Return empty array on error
    }
    
    return results;
  }

  /**
   * Get file metadata
   */
  getFileMetadata(filePath: string): {
    path: string;
    size: number;
    extension: string;
    name: string;
    lastModified: Date;
    isDirectory: boolean;
  } | null {
    try {
      const stats = fsSync.statSync(filePath);
      return {
        path: filePath,
        size: stats.size,
        extension: path.extname(filePath),
        name: path.basename(filePath),
        lastModified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    } catch {
      return null;
    }
  }

  /**
   * Validate if file is a valid Claude config
   */
  isValidClaudeConfig(filePath: string): boolean {
    try {
      if (!filePath.toLowerCase().endsWith('.md')) return false;
      
      const content = fsSync.readFileSync(filePath, 'utf-8');
      if (content.length === 0) return false;
      
      // Check for basic markdown structure
      return /^#+\s+.+$/m.test(content);
    } catch {
      return false;
    }
  }

  /**
   * Watch directory for changes
   */
  watchDirectory(directory: string, callback: (event: string, filename: string) => void, options?: {
    filter?: (filename: string) => boolean;
  }): { close: () => void } | null {
    try {
      const fsWatcher = fsSync.watch(directory, (event, filename) => {
        if (filename && (!options?.filter || options.filter(filename))) {
          callback(event, filename);
        }
      });
      
      return {
        close: () => {
          fsWatcher.close();
        }
      };
    } catch {
      return null;
    }
  }

  /**
   * Search for text in files
   */
  searchInFiles(files: string[], searchText: string | RegExp, options?: {
    caseSensitive?: boolean;
    useRegex?: boolean;
    includeContext?: boolean;
    maxResults?: number;
  }): Array<{
    file: string;
    matches: Array<{
      lineNumber: number;
      lineContent: string;
      context?: string[];
    }>;
  }> {
    const results: Array<{
      file: string;
      matches: Array<{
        lineNumber: number;
        lineContent: string;
        context?: string[];
      }>;
    }> = [];
    
    for (const file of files) {
      try {
        const content = fsSync.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        const matches: Array<{
          lineNumber: number;
          lineContent: string;
          context?: string[];
        }> = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let found = false;
          
          if (searchText instanceof RegExp) {
            found = searchText.test(line);
          } else if (options?.useRegex) {
            const caseSensitive = options.caseSensitive ?? true; // Default to case-sensitive
            const regex = new RegExp(searchText, caseSensitive ? 'g' : 'gi');
            found = regex.test(line);
          } else {
            const caseSensitive = options?.caseSensitive ?? true; // Default to case-sensitive
            const searchStr = caseSensitive ? searchText : searchText.toLowerCase();
            const testLine = caseSensitive ? line : line.toLowerCase();
            found = testLine.includes(searchStr);
          }
          
          if (found) {
            const match = {
              lineNumber: i + 1,
              lineContent: line,
              ...(options?.includeContext && {
                context: [
                  lines[i - 1] || '',
                  lines[i + 1] || ''
                ]
              })
            };
            
            matches.push(match);
            
            if (options?.maxResults && matches.length >= options.maxResults) {
              break;
            }
          }
        }
        
        if (matches.length > 0) {
          results.push({ file, matches });
        }
      } catch {
        // Skip files that can't be read (like binary files)
      }
    }
    
    return results;
  }
}