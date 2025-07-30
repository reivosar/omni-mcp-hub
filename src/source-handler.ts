export interface SourceHandler {
  initialize(config: string): Promise<void>;
  getFiles(patterns: string[]): Promise<Map<string, string>>;
  getFile(fileName: string): Promise<string | null>;
  listFiles(): Promise<string[]>;
  getSourceInfo(): string;
}

export class SourceManager {
  private handlers = new Map<string, SourceHandler>();

  registerHandler(protocol: string, handler: SourceHandler) {
    this.handlers.set(protocol, handler);
  }

  async initializeSource(sourceUrl: string): Promise<SourceHandler> {
    const [protocol, config] = this.parseSourceUrl(sourceUrl);
    
    const handler = this.handlers.get(protocol);
    if (!handler) {
      throw new Error(`Unsupported protocol: ${protocol}`);
    }

    await handler.initialize(config);
    return handler;
  }

  private parseSourceUrl(sourceUrl: string): [string, string] {
    const colonIndex = sourceUrl.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid source URL format: ${sourceUrl}`);
    }

    const protocol = sourceUrl.substring(0, colonIndex);
    const config = sourceUrl.substring(colonIndex + 1);
    
    return [protocol, config];
  }

  getSupportedProtocols(): string[] {
    return Array.from(this.handlers.keys());
  }
}