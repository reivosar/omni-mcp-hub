import { SourceManager, SourceHandler } from './source-handler';
import { GitHubHandler } from '../handlers/github-handler';
import { LocalHandler } from '../handlers/local-handler';
import { SourceConfigManager } from '../config/source-config-manager';
import { ContentValidator } from '../utils/content-validator';

export class OmniSourceManager {
  private sourceManager: SourceManager;
  private sources = new Map<string, SourceHandler>();
  private configLoader: SourceConfigManager;

  constructor() {
    this.sourceManager = new SourceManager();
    this.configLoader = new SourceConfigManager();

    // Register handlers
    this.sourceManager.registerHandler('github', new GitHubHandler('/tmp/repos'));
    this.sourceManager.registerHandler('local', new LocalHandler());
  }

  async initializeSources() {
    const config = this.configLoader.getConfig();
    
    if (!config.sources || config.sources.length === 0) {
      console.log('No sources configured');
      return;
    }
    
    for (const source of config.sources) {
      try {
        let sourceUrl: string;
        if (source.type === 'github') {
          sourceUrl = `github:${source.owner}/${source.repo}`;
        } else if (source.type === 'local') {
          sourceUrl = `local:${source.path}`;
        } else {
          continue;
        }

        const handler = await this.sourceManager.initializeSource(sourceUrl);
        this.sources.set(sourceUrl, handler);
        console.log(`Initialized source: ${handler.getSourceInfo()}`);
      } catch (error) {
        console.error(`Failed to initialize source:`, error);
      }
    }
  }

  getSourceNames(): string[] {
    return Array.from(this.sources.keys());
  }

  async getSourceFiles(sourceName: string, patterns?: string[]): Promise<Map<string, string>> {
    const handler = this.sources.get(sourceName);
    if (!handler) {
      throw new Error(`Source not found: ${sourceName}`);
    }

    const config = this.configLoader.getConfig();
    const usePatterns = patterns || config.files.patterns;
    const files = await handler.getFiles(usePatterns);
    
    // Configure custom validation if specified
    if (config.security?.content_validation?.enabled !== false) {
      if (config.security?.content_validation?.reject_patterns) {
        ContentValidator.setCustomPatterns(config.security.content_validation.reject_patterns);
      }
      if (config.security?.content_validation?.additional_keywords) {
        ContentValidator.setCustomKeywords(config.security.content_validation.additional_keywords);
      }
      
      // Validate and filter malicious content
      const validatedFiles = new Map<string, string>();
      for (const [fileName, content] of files.entries()) {
        const validation = await ContentValidator.validate(content);
        if (validation.isValid) {
          validatedFiles.set(fileName, content);
        } else {
          console.warn(`Rejected ${fileName} from ${sourceName}: ${validation.reason}`);
          if (validation.flaggedPatterns) {
            console.warn(`Flagged patterns: ${validation.flaggedPatterns.join(', ')}`);
          }
        }
      }
      
      return validatedFiles;
    }
    
    return files;
  }

  async getSourceFile(sourceName: string, fileName: string): Promise<string | null> {
    const handler = this.sources.get(sourceName);
    if (!handler) {
      throw new Error(`Source not found: ${sourceName}`);
    }

    const config = this.configLoader.getConfig();
    const content = await handler.getFile(fileName);
    
    if (!content) {
      return null;
    }
    
    // Check file size
    if (content.length > config.files.max_size) {
      throw new Error(`File too large: ${fileName} (${content.length} bytes, max: ${config.files.max_size})`);
    }
    
    // Validate content if security is enabled
    if (config.security?.content_validation?.enabled !== false) {
      // Configure custom validation if specified
      if (config.security?.content_validation?.reject_patterns) {
        ContentValidator.setCustomPatterns(config.security.content_validation.reject_patterns);
      }
      if (config.security?.content_validation?.additional_keywords) {
        ContentValidator.setCustomKeywords(config.security.content_validation.additional_keywords);
      }
      
      const validation = await ContentValidator.validate(content);
      if (!validation.isValid) {
        console.warn(`Rejected ${fileName} from ${sourceName}: ${validation.reason}`);
        if (validation.flaggedPatterns) {
          console.warn(`Flagged patterns: ${validation.flaggedPatterns.join(', ')}`);
        }
        return null;
      }
    }

    return content;
  }

  async listSourceFiles(sourceName: string): Promise<string[]> {
    const handler = this.sources.get(sourceName);
    if (!handler) {
      throw new Error(`Source not found: ${sourceName}`);
    }

    return await handler.listFiles();
  }

  getBundleMode(): boolean {
    // Bundle mode can be controlled via environment variable
    return process.env.BUNDLE_MODE === 'true';
  }

  getFilePatterns(): string[] {
    const config = this.configLoader.getConfig();
    return config.files.patterns;
  }
}