import { SourceManager, SourceHandler } from './source-handler';
import { GitHubHandler } from './handlers/github-handler';
import { LocalHandler } from './handlers/local-handler';
import { ConfigLoader } from './config-loader';

export class OmniSourceManager {
  private sourceManager: SourceManager;
  private sources = new Map<string, SourceHandler>();
  private configLoader: ConfigLoader;

  constructor() {
    this.sourceManager = new SourceManager();
    this.configLoader = new ConfigLoader();

    // Register handlers
    this.sourceManager.registerHandler('github', new GitHubHandler('/app/repos'));
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

        const handler = await this.sourceManager.initializeSource(sourceUrl, source.token);
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
    return await handler.getFiles(usePatterns);
  }

  async getSourceFile(sourceName: string, fileName: string): Promise<string | null> {
    const handler = this.sources.get(sourceName);
    if (!handler) {
      throw new Error(`Source not found: ${sourceName}`);
    }

    const config = this.configLoader.getConfig();
    const content = await handler.getFile(fileName);
    if (content && content.length > config.files.max_size) {
      throw new Error(`File too large: ${fileName} (${content.length} bytes, max: ${config.files.max_size})`);
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