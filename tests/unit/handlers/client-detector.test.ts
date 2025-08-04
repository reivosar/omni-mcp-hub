import { Request } from 'express';
import { ClientTypeDetector } from '../../../src/handlers/client-detector';
import { ClientType, ClientDetectionRule } from '../../../src/types/client-types';

describe('ClientTypeDetector', () => {
  let detector: ClientTypeDetector;

  beforeEach(() => {
    detector = new ClientTypeDetector();
  });

  describe('constructor', () => {
    it('should initialize with default rules', () => {
      const rules = detector.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should initialize with custom rules', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            userAgent: ['custom-agent']
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      const rules = customDetector.getRules();
      
      expect(rules).toEqual(customRules);
    });
  });

  describe('detect', () => {
    it('should detect Claude client by user agent and headers', () => {
      const req = {
        headers: {
          'user-agent': 'Claude/1.0',
          'x-client': 'claude'
        },
        path: '/api/v1/mcp',
        url: '/api/v1/mcp'
      } as any as Request;

      const result = detector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });

    it('should detect by multiple conditions', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            userAgent: ['claude'],
            headers: {
              'x-client-type': 'mcp'
            },
            path: ['/mcp'],
            contentType: ['application/json']
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {
          'user-agent': 'Claude/1.0',
          'x-client-type': 'mcp',
          'content-type': 'application/json'
        },
        path: '/mcp/test',
        url: '/mcp/test'
      } as any as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });

    it('should return UNKNOWN for unmatched requests', () => {
      const req = {
        headers: {
          'user-agent': 'Unknown/1.0'
        },
        path: '/unknown',
        url: '/unknown'
      } as Request;

      const result = detector.detect(req);
      expect(result).toBe(ClientType.UNKNOWN);
    });

    it('should handle missing user agent', () => {
      const req = {
        headers: {},
        path: '/test',
        url: '/test'
      } as Request;

      const result = detector.detect(req);
      expect(result).toBe(ClientType.UNKNOWN);
    });

    it('should be case insensitive for user agent matching', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            userAgent: ['CLAUDE']
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {
          'user-agent': 'claude/1.0'
        },
        path: '/test',
        url: '/test'
      } as any as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });

    it('should be case insensitive for content type matching', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            contentType: ['APPLICATION/JSON']
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {
          'content-type': 'application/json; charset=utf-8'
        },
        path: '/test',
        url: '/test'
      } as any as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });

    it('should match path prefixes', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            path: ['/api/mcp']
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {},
        path: '/api/mcp/tools',
        url: '/api/mcp/tools'
      } as any as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });

    it('should handle headers with case insensitive keys', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            headers: {
              'X-Client-Type': 'mcp'
            }
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {
          'x-client-type': 'mcp'
        },
        path: '/test',
        url: '/test'
      } as any as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });

    it('should fail if any condition does not match', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            userAgent: ['claude'],
            headers: {
              'x-client-type': 'mcp'
            }
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {
          'user-agent': 'claude/1.0',
          'x-client-type': 'rest' // Wrong value
        },
        path: '/test',
        url: '/test'
      } as any as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.UNKNOWN);
    });

    it('should match first rule in order', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            userAgent: ['test-agent']
          }
        },
        {
          type: ClientType.CURSOR,
          conditions: {
            userAgent: ['test-agent']
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {
          'user-agent': 'test-agent/1.0'
        },
        path: '/test',
        url: '/test'
      } as any as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });
  });

  describe('addRule', () => {
    it('should add a new detection rule', () => {
      const initialCount = detector.getRules().length;
      
      const newRule: ClientDetectionRule = {
        type: ClientType.COPILOT,
        conditions: {
          userAgent: ['copilot']
        }
      };
      
      detector.addRule(newRule);
      
      const rules = detector.getRules();
      expect(rules.length).toBe(initialCount + 1);
      expect(rules[rules.length - 1]).toEqual(newRule);
    });

    it('should detect with newly added rule', () => {
      const newRule: ClientDetectionRule = {
        type: ClientType.COPILOT,
        conditions: {
          userAgent: ['copilot']
        }
      };
      
      detector.addRule(newRule);
      
      const req = {
        headers: {
          'user-agent': 'copilot/1.0'
        },
        path: '/test',
        url: '/test'
      } as Request;

      const result = detector.detect(req);
      expect(result).toBe(ClientType.COPILOT);
    });
  });

  describe('removeRule', () => {
    it('should remove rules of specified type', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: { userAgent: ['claude1'] }
        },
        {
          type: ClientType.CLAUDE,
          conditions: { userAgent: ['claude2'] }
        },
        {
          type: ClientType.CURSOR,
          conditions: { userAgent: ['cursor'] }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      customDetector.removeRule(ClientType.CLAUDE);
      
      const rules = customDetector.getRules();
      expect(rules.length).toBe(1);
      expect(rules[0].type).toBe(ClientType.CURSOR);
    });

    it('should not affect detection after removing rules', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: { userAgent: ['claude'] }
        },
        {
          type: ClientType.CURSOR,
          conditions: { userAgent: ['cursor'] }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      customDetector.removeRule(ClientType.CLAUDE);
      
      const req = {
        headers: {
          'user-agent': 'claude/1.0'
        },
        path: '/test',
        url: '/test'
      } as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.UNKNOWN);
    });

    it('should handle removing non-existent rule type', () => {
      const initialRules = detector.getRules();
      detector.removeRule(ClientType.UNKNOWN);
      
      const finalRules = detector.getRules();
      expect(finalRules).toEqual(initialRules);
    });
  });

  describe('getRules', () => {
    it('should return a copy of rules array', () => {
      const rules = detector.getRules();
      const originalLength = rules.length;
      
      rules.push({
        type: ClientType.UNKNOWN,
        conditions: {}
      });
      
      const rulesAgain = detector.getRules();
      expect(rulesAgain.length).toBe(originalLength);
    });

    it('should return current rules after modifications', () => {
      const initialRules = detector.getRules();
      
      const newRule: ClientDetectionRule = {
        type: ClientType.COPILOT,
        conditions: { userAgent: ['copilot'] }
      };
      
      detector.addRule(newRule);
      detector.removeRule(ClientType.CLAUDE);
      
      const finalRules = detector.getRules();
      expect(finalRules.length).toBe(initialRules.length);
      expect(finalRules.some(rule => rule.type === ClientType.COPILOT)).toBe(true);
      expect(finalRules.some(rule => rule.type === ClientType.CLAUDE)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty conditions', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {}
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {},
        path: '/test',
        url: '/test'
      } as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });

    it('should handle multiple user agents in condition', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            userAgent: ['claude', 'anthropic', 'assistant']
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {
          'user-agent': 'anthropic/2.0'
        },
        path: '/test',
        url: '/test'
      } as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });

    it('should handle multiple paths in condition', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            path: ['/api/mcp', '/api/claude', '/mcp']
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {},
        path: '/api/claude/test',
        url: '/api/claude/test'
      } as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });

    it('should handle multiple content types in condition', () => {
      const customRules: ClientDetectionRule[] = [
        {
          type: ClientType.CLAUDE,
          conditions: {
            contentType: ['application/json', 'application/jsonrpc', 'text/json']
          }
        }
      ];
      
      const customDetector = new ClientTypeDetector(customRules);
      
      const req = {
        headers: {
          'content-type': 'application/jsonrpc+json'
        },
        path: '/test',
        url: '/test'
      } as Request;

      const result = customDetector.detect(req);
      expect(result).toBe(ClientType.CLAUDE);
    });
  });
});