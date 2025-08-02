export enum ClientType {
  CLAUDE = 'claude',
  CURSOR = 'cursor',
  COPILOT = 'copilot',
  CHATGPT = 'chatgpt',
  REST = 'rest',
  UNKNOWN = 'unknown'
}

export enum ProtocolType {
  MCP = 'mcp',
  LSP = 'lsp',
  REST = 'rest',
  WEBSOCKET = 'websocket'
}

export interface ClientDetectionRule {
  type: ClientType;
  conditions: {
    userAgent?: string[];
    headers?: Record<string, string>;
    path?: string[];
    contentType?: string[];
  };
}

export const CLIENT_DETECTION_RULES: ClientDetectionRule[] = [
  {
    type: ClientType.CLAUDE,
    conditions: {
      userAgent: ['claude', 'anthropic'],
      headers: { 'x-client': 'claude' }
    }
  },
  {
    type: ClientType.CURSOR,
    conditions: {
      headers: { 'x-lsp-client': 'cursor' },
      userAgent: ['cursor']
    }
  },
  {
    type: ClientType.COPILOT,
    conditions: {
      userAgent: ['copilot', 'github-copilot'],
      headers: { 'x-github-copilot': 'true' }
    }
  },
  {
    type: ClientType.CHATGPT,
    conditions: {
      userAgent: ['chatgpt', 'openai'],
      headers: { 'x-openai-client': 'chatgpt' }
    }
  },
  {
    type: ClientType.REST,
    conditions: {
      path: ['/api/v1', '/rest'],
      contentType: ['application/json']
    }
  }
];

export namespace ClientType {
  export function getProtocol(type: ClientType): ProtocolType {
    switch(type) {
      case ClientType.CLAUDE: return ProtocolType.MCP;
      case ClientType.CURSOR: return ProtocolType.LSP;
      case ClientType.COPILOT: return ProtocolType.LSP;
      case ClientType.CHATGPT: return ProtocolType.REST;
      case ClientType.REST: return ProtocolType.REST;
      default: return ProtocolType.REST;
    }
  }
}