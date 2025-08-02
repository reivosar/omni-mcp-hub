import { ClientType } from '../types/client-types';
import { BaseClientHandler } from './base-handler';
import { MCPHandler } from './mcp-handler';
import { LSPHandler } from './lsp-handler';
import { RESTHandler } from './rest-handler';
import { OmniSourceManager } from '../sources/source-manager';
import { MCPServerManager } from '../mcp/mcp-server-manager';

export class HandlerFactory {
  private sourceManager: OmniSourceManager;
  private mcpServerManager: MCPServerManager;

  constructor(sourceManager: OmniSourceManager, mcpServerManager: MCPServerManager) {
    this.sourceManager = sourceManager;
    this.mcpServerManager = mcpServerManager;
  }

  create(type: ClientType): BaseClientHandler {
    switch (type) {
      case ClientType.CLAUDE:
        return new MCPHandler(this.sourceManager, this.mcpServerManager);
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

  static getSupportedTypes(): ClientType[] {
    return [
      ClientType.CLAUDE,
      ClientType.CURSOR,
      ClientType.COPILOT,
      ClientType.CHATGPT,
      ClientType.REST
    ];
  }

  static create(sourceManager: OmniSourceManager, mcpServerManager: MCPServerManager, type: ClientType): BaseClientHandler {
    const factory = new HandlerFactory(sourceManager, mcpServerManager);
    return factory.create(type);
  }

}