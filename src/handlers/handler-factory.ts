import { ClientType } from '../types/client-types';
import { BaseClientHandler } from './base-handler';
import { MCPHandler } from './mcp-handler';
import { LSPHandler } from './lsp-handler';
import { RESTHandler } from './rest-handler';
import { OmniSourceManager } from '../sources/source-manager';

export class HandlerFactory {
  private sourceManager: OmniSourceManager;

  constructor(sourceManager: OmniSourceManager) {
    this.sourceManager = sourceManager;
  }

  create(type: ClientType): BaseClientHandler {
    switch (type) {
      case ClientType.CLAUDE:
        return new MCPHandler(this.sourceManager);
      case ClientType.CURSOR:
        return new LSPHandler();
      case ClientType.COPILOT:
        return new LSPHandler();
      case ClientType.CHATGPT:
        return new RESTHandler();
      case ClientType.REST:
        return new RESTHandler();
      default:
        throw new Error(`Unsupported client type: ${type}`);
    }
  }

  getSupportedTypes(): ClientType[] {
    return [
      ClientType.CLAUDE,
      ClientType.CURSOR,
      ClientType.COPILOT,
      ClientType.CHATGPT,
      ClientType.REST
    ];
  }
}