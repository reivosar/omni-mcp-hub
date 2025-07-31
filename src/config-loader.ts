import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface ServerConfig {
  port: number;
}

export interface SourceConfig {
  type: 'github' | 'local';
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

export interface GitHubConfig {
  token?: string;
  webhook_secret?: string;
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
  github: GitHubConfig;
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
    const rawConfig = yaml.load(fileContents) as any;
    
    const configStr = JSON.stringify(rawConfig);
    const replacedStr = configStr.replace(/\${(\w+)}/g, (match, envVar) => {
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
}