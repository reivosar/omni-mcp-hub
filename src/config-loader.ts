import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface ServerConfig {
  port: number;
}

export interface SourceConfig {
  type?: 'github' | 'local';
  url?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;
  token?: string;
}

export interface FilesConfig {
  patterns: string[];
  max_size: number;
}

export interface FetchConfig {
  timeout: number;
  retries: number;
  retry_delay: number;
  max_depth: number;
}

export interface CacheConfig {
  ttl: number;
}

export interface Config {
  server: ServerConfig;
  sources: SourceConfig[];
  files: FilesConfig;
  fetch: FetchConfig;
  cache: CacheConfig;
}

export class ConfigLoader {
  private config: Config | null = null;
  
  load(configPath?: string): Config {
    const filePath = configPath || process.env.CONFIG_PATH || path.join(process.cwd(), 'config.yaml');
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Configuration file not found: ${filePath}`);
    }
    
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const rawConfig = yaml.load(fileContents) as Record<string, unknown>;
    
    // Apply auto-detection for sources
    if (rawConfig.sources && Array.isArray(rawConfig.sources)) {
      rawConfig.sources = rawConfig.sources.map((source: unknown) => this.autoDetectSourceType(source));
    }
    
    const configStr = JSON.stringify(rawConfig);
    const replacedStr = configStr.replace(/\${(\w+)}/g, (_, envVar) => {
      return process.env[envVar] || '';
    });
    
    this.config = JSON.parse(replacedStr) as Config;
    return this.config;
  }
  
  getConfig(): Config {
    if (!this.config) {
      this.load();
    }
    return this.config!;
  }
  
  clearCache(): void {
    this.config = null;
  }
  
  getSources(): SourceConfig[] {
    return this.getConfig().sources;
  }
  
  getSourcesAsEnvFormat(): string {
    const sources = this.getSources();
    return sources.map(source => {
      if (source.type === 'github') {
        return `github:${source.owner}/${source.repo}`;
      } else if (source.type === 'local') {
        return `local:${source.path}`;
      }
      return '';
    }).filter(s => s).join(',');
  }
  
  /**
   * Auto-detect source type from URL or path and convert to appropriate configuration
   */
  private autoDetectSourceType(source: unknown): SourceConfig {
    // Type guard to ensure source is an object
    if (!source || typeof source !== 'object') {
      throw new Error('Invalid source configuration: must be an object');
    }
    
    const sourceObj = source as Record<string, unknown>;
    
    // Return as-is if type is already specified and no URL
    if (sourceObj.type && !sourceObj.url) {
      return sourceObj as SourceConfig;
    }
    
    // Auto-detect when URL is specified
    if (typeof sourceObj.url === 'string') {
      const result = this.parseSourceUrl(sourceObj.url);
      
      // Merge existing config with auto-detection results
      // Auto-detection takes priority for type and GitHub owner/repo/branch
      const merged = {
        ...sourceObj, // Base existing config
        ...result, // Override with auto-detection results
        url: sourceObj.url // Preserve original URL
      };
      
      return merged as SourceConfig;
    }
    
    return sourceObj as SourceConfig;
  }
  
  /**
   * Parse URL or path to generate source configuration
   */
  private parseSourceUrl(url: string): Partial<SourceConfig> {
    // GitHub URL patterns
    const githubPatterns = [
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^\/]+))?\/?$/,
      /^github:([^\/]+)\/([^\/]+?)(?:\.git)?(?:@(.+))?$/,
      /^([^\/]+)\/([^\/]+?)(?:\.git)?(?:@(.+))?$/ // owner/repo format
    ];
    
    for (const pattern of githubPatterns) {
      const match = url.match(pattern);
      if (match) {
        const [, owner, repoWithBranch, branch] = match;
        
        // Handle @branch suffix (separate from repoWithBranch)
        let repo = repoWithBranch;
        let finalBranch = branch;
        
        const branchMatch = repo.match(/^(.+)@(.+)$/);
        if (branchMatch && !finalBranch) {
          repo = branchMatch[1];
          finalBranch = branchMatch[2];
        }
        
        return {
          type: 'github',
          owner,
          repo,
          branch: finalBranch || 'main'
        };
      }
    }
    
    // Local path patterns
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.match(/^[A-Za-z]:\\/)) {
      return {
        type: 'local',
        path: url
      };
    }
    
    // file:// protocol
    if (url.startsWith('file://')) {
      return {
        type: 'local',
        path: url.replace('file://', '')
      };
    }
    
    throw new Error(`Unable to auto-detect source type for URL: ${url}`);
  }
  
  /**
   * Helper method to display source configuration examples
   */
  static getConfigExamples(): string {
    return `
# Auto-detection enabled configuration examples:

sources:
  # GitHub URL format (auto-detection)
  - url: https://github.com/microsoft/vscode
    token: \${GITHUB_TOKEN_PUBLIC}
    
  - url: github:facebook/react@main
    token: \${GITHUB_TOKEN_FACEBOOK}
    
  - url: your-org/private-repo@develop
    token: \${GITHUB_TOKEN_PRIVATE}
    
  # Local path format (auto-detection)
  - url: /Users/mac/my-project
  
  - url: ./relative-project
  
  - url: file:///absolute/path/to/project
  
  # Traditional format (backward compatibility)
  - type: github
    owner: company
    repo: enterprise
    branch: main
    token: \${GITHUB_TOKEN_ENTERPRISE}
    
  - type: local
    path: /Users/mac/Documents/project

# Note: Each GitHub source specifies its own token
# Global github.token is no longer needed
`;
  }
}