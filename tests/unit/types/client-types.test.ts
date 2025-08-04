import { 
  ClientType, 
  ProtocolType, 
  ClientDetectionRule, 
  CLIENT_DETECTION_RULES 
} from '../../../src/types/client-types';

describe('ClientType', () => {
  describe('Enum Values', () => {
    it('should have correct enum values', () => {
      expect(ClientType.CLAUDE).toBe('claude');
      expect(ClientType.CURSOR).toBe('cursor');
      expect(ClientType.COPILOT).toBe('copilot');
      expect(ClientType.CHATGPT).toBe('chatgpt');
      expect(ClientType.REST).toBe('rest');
      expect(ClientType.UNKNOWN).toBe('unknown');
    });

    it('should have all expected client types', () => {
      const expectedTypes = ['claude', 'cursor', 'copilot', 'chatgpt', 'rest', 'unknown'];
      const actualTypes = Object.values(ClientType).filter(value => typeof value === 'string');
      expect(actualTypes).toEqual(expect.arrayContaining(expectedTypes));
      expect(actualTypes).toHaveLength(expectedTypes.length);
    });
  });

  describe('getProtocol method', () => {
    it('should return MCP for Claude', () => {
      expect(ClientType.getProtocol(ClientType.CLAUDE)).toBe(ProtocolType.MCP);
    });

    it('should return LSP for Cursor', () => {
      expect(ClientType.getProtocol(ClientType.CURSOR)).toBe(ProtocolType.LSP);
    });

    it('should return LSP for Copilot', () => {
      expect(ClientType.getProtocol(ClientType.COPILOT)).toBe(ProtocolType.LSP);
    });

    it('should return REST for ChatGPT', () => {
      expect(ClientType.getProtocol(ClientType.CHATGPT)).toBe(ProtocolType.REST);
    });

    it('should return REST for REST client', () => {
      expect(ClientType.getProtocol(ClientType.REST)).toBe(ProtocolType.REST);
    });

    it('should return REST for unknown client', () => {
      expect(ClientType.getProtocol(ClientType.UNKNOWN)).toBe(ProtocolType.REST);
    });

    it('should handle all client types', () => {
      // Ensure all enum values are covered in getProtocol
      const clientTypes = [
        ClientType.CLAUDE,
        ClientType.CURSOR,
        ClientType.COPILOT,
        ClientType.CHATGPT,
        ClientType.REST,
        ClientType.UNKNOWN
      ];
      clientTypes.forEach(clientType => {
        expect(() => ClientType.getProtocol(clientType)).not.toThrow();
      });
    });
  });
});

describe('ProtocolType', () => {
  describe('Enum Values', () => {
    it('should have correct enum values', () => {
      expect(ProtocolType.MCP).toBe('mcp');
      expect(ProtocolType.LSP).toBe('lsp');
      expect(ProtocolType.REST).toBe('rest');
      expect(ProtocolType.WEBSOCKET).toBe('websocket');
    });

    it('should have all expected protocol types', () => {
      const expectedTypes = ['mcp', 'lsp', 'rest', 'websocket'];
      const actualTypes = Object.values(ProtocolType);
      expect(actualTypes).toEqual(expect.arrayContaining(expectedTypes));
      expect(actualTypes).toHaveLength(expectedTypes.length);
    });
  });
});

describe('CLIENT_DETECTION_RULES', () => {
  it('should be an array of detection rules', () => {
    expect(Array.isArray(CLIENT_DETECTION_RULES)).toBe(true);
    expect(CLIENT_DETECTION_RULES.length).toBeGreaterThan(0);
  });

  it('should have a rule for each major client type except UNKNOWN', () => {
    const rulesClientTypes = CLIENT_DETECTION_RULES.map(rule => rule.type);
    expect(rulesClientTypes).toContain(ClientType.CLAUDE);
    expect(rulesClientTypes).toContain(ClientType.CURSOR);
    expect(rulesClientTypes).toContain(ClientType.COPILOT);
    expect(rulesClientTypes).toContain(ClientType.CHATGPT);
    expect(rulesClientTypes).toContain(ClientType.REST);
    expect(rulesClientTypes).not.toContain(ClientType.UNKNOWN);
  });

  describe('Claude detection rule', () => {
    const claudeRule = CLIENT_DETECTION_RULES.find(rule => rule.type === ClientType.CLAUDE);

    it('should exist', () => {
      expect(claudeRule).toBeDefined();
    });

    it('should have correct conditions', () => {
      expect(claudeRule?.conditions.userAgent).toContain('claude');
      expect(claudeRule?.conditions.userAgent).toContain('anthropic');
      expect(claudeRule?.conditions.headers).toEqual({ 'x-client': 'claude' });
    });
  });

  describe('Cursor detection rule', () => {
    const cursorRule = CLIENT_DETECTION_RULES.find(rule => rule.type === ClientType.CURSOR);

    it('should exist', () => {
      expect(cursorRule).toBeDefined();
    });

    it('should have correct conditions', () => {
      expect(cursorRule?.conditions.userAgent).toContain('cursor');
      expect(cursorRule?.conditions.headers).toEqual({ 'x-lsp-client': 'cursor' });
    });
  });

  describe('Copilot detection rule', () => {
    const copilotRule = CLIENT_DETECTION_RULES.find(rule => rule.type === ClientType.COPILOT);

    it('should exist', () => {
      expect(copilotRule).toBeDefined();
    });

    it('should have correct conditions', () => {
      expect(copilotRule?.conditions.userAgent).toContain('copilot');
      expect(copilotRule?.conditions.userAgent).toContain('github-copilot');
      expect(copilotRule?.conditions.headers).toEqual({ 'x-github-copilot': 'true' });
    });
  });

  describe('ChatGPT detection rule', () => {
    const chatgptRule = CLIENT_DETECTION_RULES.find(rule => rule.type === ClientType.CHATGPT);

    it('should exist', () => {
      expect(chatgptRule).toBeDefined();
    });

    it('should have correct conditions', () => {
      expect(chatgptRule?.conditions.userAgent).toContain('chatgpt');
      expect(chatgptRule?.conditions.userAgent).toContain('openai');
      expect(chatgptRule?.conditions.headers).toEqual({ 'x-openai-client': 'chatgpt' });
    });
  });

  describe('REST detection rule', () => {
    const restRule = CLIENT_DETECTION_RULES.find(rule => rule.type === ClientType.REST);

    it('should exist', () => {
      expect(restRule).toBeDefined();
    });

    it('should have correct conditions', () => {
      expect(restRule?.conditions.path).toContain('/api/v1');
      expect(restRule?.conditions.path).toContain('/rest');
      expect(restRule?.conditions.contentType).toContain('application/json');
    });
  });

  it('should have valid rule structure', () => {
    CLIENT_DETECTION_RULES.forEach(rule => {
      expect(rule).toHaveProperty('type');
      expect(rule).toHaveProperty('conditions');
      expect(Object.values(ClientType)).toContain(rule.type);
      
      // Conditions should be an object
      expect(typeof rule.conditions).toBe('object');
      
      // If conditions exist, they should be valid
      if (rule.conditions.userAgent) {
        expect(Array.isArray(rule.conditions.userAgent)).toBe(true);
      }
      if (rule.conditions.headers) {
        expect(typeof rule.conditions.headers).toBe('object');
      }
      if (rule.conditions.path) {
        expect(Array.isArray(rule.conditions.path)).toBe(true);
      }
      if (rule.conditions.contentType) {
        expect(Array.isArray(rule.conditions.contentType)).toBe(true);
      }
    });
  });
});

describe('ClientDetectionRule interface', () => {
  it('should allow creating valid detection rules', () => {
    const customRule: ClientDetectionRule = {
      type: ClientType.UNKNOWN,
      conditions: {
        userAgent: ['custom-client'],
        headers: { 'x-custom': 'true' },
        path: ['/custom'],
        contentType: ['application/custom']
      }
    };

    expect(customRule.type).toBe(ClientType.UNKNOWN);
    expect(customRule.conditions.userAgent).toContain('custom-client');
    expect(customRule.conditions.headers?.['x-custom']).toBe('true');
    expect(customRule.conditions.path).toContain('/custom');
    expect(customRule.conditions.contentType).toContain('application/custom');
  });

  it('should allow partial conditions', () => {
    const partialRule: ClientDetectionRule = {
      type: ClientType.UNKNOWN,
      conditions: {
        userAgent: ['test-agent']
      }
    };

    expect(partialRule.type).toBe(ClientType.UNKNOWN);
    expect(partialRule.conditions.userAgent).toContain('test-agent');
    expect(partialRule.conditions.headers).toBeUndefined();
  });
});