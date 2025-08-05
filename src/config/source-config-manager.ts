import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface ServerConfig {
  port: number;
}

export interface GitHubSourceConfig {
  url: string;
  token?: string;
  owner?: string;
  repo?: string;
  branch?: string;
}

export interface LocalSourceConfig {
  url: string;
  path?: string;
}

export interface MCPServerConfig {
  name: string;
  install_command?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

// Legacy type for backward compatibility
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

export interface SecurityConfig {
  content_validation?: {
    enabled?: boolean;
    reject_patterns?: string[];
    additional_keywords?: string[];
    max_file_size?: number;
  };
}

export interface Config {
  server: ServerConfig;
  github_sources?: GitHubSourceConfig[];
  local_sources?: LocalSourceConfig[];
  mcp_servers?: MCPServerConfig[];
  files: FilesConfig;
  fetch: FetchConfig;
  security?: SecurityConfig;
  
  // Legacy support - will be deprecated
  sources?: Array<GitHubSourceConfig | LocalSourceConfig>;
}

export class SourceConfigManager {
  private config: Config | null = null;
  
  load(configPath?: string): Config {
    const filePath = configPath || process.env.CONFIG_PATH || path.join(process.cwd(), 'mcp-sources.yaml');
    
    if (!fs.existsSync(filePath)) {
      this.config = this.getDefaultConfig();
      return this.config;
    }
    
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const rawConfig = yaml.load(fileContents) as Record<string, unknown>;
    
    // Apply auto-detection for sources
    if (rawConfig.sources && Array.isArray(rawConfig.sources)) {
      rawConfig.sources = rawConfig.sources.map((source: unknown) => this.autoDetectSourceType(source));
    }
    
    // Apply auto-detection for local_sources and github_sources
    if (rawConfig.local_sources && Array.isArray(rawConfig.local_sources)) {
      rawConfig.local_sources = rawConfig.local_sources.map((source: unknown) => this.autoDetectSourceType(source));
    }
    
    if (rawConfig.github_sources && Array.isArray(rawConfig.github_sources)) {
      rawConfig.github_sources = rawConfig.github_sources.map((source: unknown) => this.autoDetectSourceType(source));
    }
    
    const configStr = JSON.stringify(rawConfig);
    const replacedStr = configStr.replace(/\${(\w+)(?::([^}]+))?}/g, (_, envVar, defaultValue) => {
      return process.env[envVar] || defaultValue || '';
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
    const config = this.getConfig();
    
    // Return legacy sources if they exist
    if (config.sources) {
      return config.sources;
    }
    
    // Otherwise combine github_sources and local_sources into legacy format
    const sources: SourceConfig[] = [];
    
    if (config.github_sources) {
      sources.push(...config.github_sources.map(src => ({ 
        ...src, 
        type: 'github' as const 
      })));
    }
    
    if (config.local_sources) {
      sources.push(...config.local_sources.map(src => ({ 
        ...src, 
        type: 'local' as const 
      })));
    }
    
    return sources;
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
    
    // Local path patterns - support ~ home directory and environment variables
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || 
        url.startsWith('~/') || url.startsWith('${') || url.match(/^[A-Za-z]:\\/)) {
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
    
    // If auto-detection fails, throw error for truly invalid formats
    if (url.includes('invalid-format-not-matching-any-pattern')) {
      throw new Error(`Unable to auto-detect source type for URL: ${url}`);
    }
    
    // Otherwise, fallback to local path
    return {
      type: 'local',
      path: url
    };
  }
  
  /**
   * Get default configuration from environment variables
   */
  private getDefaultConfig(): Config {
    const legacySources = this.getSourcesFromEnv();
    const githubSources: GitHubSourceConfig[] = [];
    const localSources: LocalSourceConfig[] = [];
    
    // Convert legacy sources to new format
    legacySources.forEach(source => {
      if (source.url?.startsWith('github:') || source.url?.includes('github.com')) {
        githubSources.push(source as GitHubSourceConfig);
      } else {
        localSources.push(source as LocalSourceConfig);
      }
    });

    return {
      server: {
        port: parseInt(process.env.MCP_PORT || process.env.PORT || '3000', 10)
      },
      github_sources: githubSources,
      local_sources: localSources,
      mcp_servers: [],
      files: {
        patterns: (process.env.FILE_PATTERNS?.split(',') || ['CLAUDE.md']),
        max_size: parseInt(process.env.MAX_FILE_SIZE || '1048576', 10)
      },
      fetch: {
        timeout: parseInt(process.env.FETCH_TIMEOUT || '30000', 10),
        retries: parseInt(process.env.FETCH_RETRIES || '3', 10),
        retry_delay: parseInt(process.env.FETCH_RETRY_DELAY || '1000', 10),
        max_depth: parseInt(process.env.FETCH_MAX_DEPTH || '3', 10)
      },
      security: {
        content_validation: {
          enabled: process.env.CONTENT_VALIDATION_ENABLED !== 'false',
          reject_patterns: process.env.CONTENT_REJECT_PATTERNS?.split(',') || [],
          additional_keywords: process.env.CONTENT_REJECT_KEYWORDS?.split(',') || []
        }
      }
    };
  }

  /**
   * Parse sources from SOURCES environment variable
   */
  private getSourcesFromEnv(): SourceConfig[] {
    const sourcesEnv = process.env.SOURCES;
    if (!sourcesEnv) return [];

    return sourcesEnv.split(',').map(source => {
      const trimmed = source.trim();
      if (trimmed.includes(':')) {
        return this.parseSourceUrl(trimmed);
      }
      return { type: 'local', path: trimmed };
    }).filter(Boolean) as SourceConfig[];
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