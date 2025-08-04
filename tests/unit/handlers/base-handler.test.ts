import { Request, Response } from 'express';
import { BaseClientHandler } from '../../../src/handlers/base-handler';
import { ClientType, ProtocolType } from '../../../src/types/client-types';

// Create a concrete implementation for testing
class TestHandler extends BaseClientHandler {
  constructor(clientType: ClientType, protocolType: ProtocolType) {
    super(clientType, protocolType);
  }

  async process(req: Request, res: Response): Promise<void> {
    res.json({ message: 'test' });
  }

  getSupportedMethods(): string[] {
    return ['test', 'ping'];
  }
}

describe('BaseClientHandler', () => {
  let handler: TestHandler;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    handler = new TestHandler(ClientType.CLAUDE, ProtocolType.MCP);
    
    mockRequest = {
      body: {},
      headers: {},
      method: 'POST'
    };
    
    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };
  });

  describe('Constructor', () => {
    it('should initialize with client type and protocol type', () => {
      const claudeHandler = new TestHandler(ClientType.CLAUDE, ProtocolType.MCP);
      expect(claudeHandler.getClientType()).toBe(ClientType.CLAUDE);
      expect(claudeHandler.getProtocolType()).toBe(ProtocolType.MCP);
    });

    it('should work with different client and protocol combinations', () => {
      const restHandler = new TestHandler(ClientType.REST, ProtocolType.REST);
      expect(restHandler.getClientType()).toBe(ClientType.REST);
      expect(restHandler.getProtocolType()).toBe(ProtocolType.REST);

      const lspHandler = new TestHandler(ClientType.CURSOR, ProtocolType.LSP);
      expect(lspHandler.getClientType()).toBe(ClientType.CURSOR);
      expect(lspHandler.getProtocolType()).toBe(ProtocolType.LSP);
    });
  });

  describe('getClientType', () => {
    it('should return the client type set in constructor', () => {
      expect(handler.getClientType()).toBe(ClientType.CLAUDE);
    });

    it('should return correct type for different clients', () => {
      const cursorHandler = new TestHandler(ClientType.CURSOR, ProtocolType.LSP);
      expect(cursorHandler.getClientType()).toBe(ClientType.CURSOR);

      const restHandler = new TestHandler(ClientType.REST, ProtocolType.REST);
      expect(restHandler.getClientType()).toBe(ClientType.REST);

      const unknownHandler = new TestHandler(ClientType.UNKNOWN, ProtocolType.REST);
      expect(unknownHandler.getClientType()).toBe(ClientType.UNKNOWN);
    });
  });

  describe('getProtocolType', () => {
    it('should return the protocol type set in constructor', () => {
      expect(handler.getProtocolType()).toBe(ProtocolType.MCP);
    });

    it('should return correct protocol for different types', () => {
      const lspHandler = new TestHandler(ClientType.CURSOR, ProtocolType.LSP);
      expect(lspHandler.getProtocolType()).toBe(ProtocolType.LSP);

      const restHandler = new TestHandler(ClientType.REST, ProtocolType.REST);
      expect(restHandler.getProtocolType()).toBe(ProtocolType.REST);

      const wsHandler = new TestHandler(ClientType.UNKNOWN, ProtocolType.WEBSOCKET);
      expect(wsHandler.getProtocolType()).toBe(ProtocolType.WEBSOCKET);
    });
  });

  describe('Abstract Methods Implementation', () => {
    it('should implement process method', async () => {
      await handler.process(mockRequest as Request, mockResponse as Response);
      
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'test' });
    });

    it('should implement getSupportedMethods', () => {
      const methods = handler.getSupportedMethods();
      
      expect(methods).toEqual(['test', 'ping']);
      expect(Array.isArray(methods)).toBe(true);
    });
  });

  describe('Protected Properties', () => {
    it('should have protected clientType and protocolType accessible to subclasses', () => {
      // This is tested indirectly through the getters
      expect(handler.getClientType()).toBeDefined();
      expect(handler.getProtocolType()).toBeDefined();
    });
  });

  describe('Inheritance', () => {
    it('should be extendable by concrete classes', () => {
      expect(handler).toBeInstanceOf(BaseClientHandler);
      expect(handler).toBeInstanceOf(TestHandler);
    });

    it('should enforce abstract method implementation', () => {
      // TypeScript ensures this at compile time, but we can check runtime behavior
      expect(typeof handler.process).toBe('function');
      expect(typeof handler.getSupportedMethods).toBe('function');
    });
  });

  describe('Type Safety', () => {
    it('should work with all valid ClientType values', () => {
      const clientTypes = [
        ClientType.CLAUDE,
        ClientType.CURSOR, 
        ClientType.COPILOT,
        ClientType.CHATGPT,
        ClientType.REST,
        ClientType.UNKNOWN
      ];
      clientTypes.forEach(clientType => {
        const testHandler = new TestHandler(clientType, ProtocolType.REST);
        expect(testHandler.getClientType()).toBe(clientType);
      });
    });

    it('should work with all valid ProtocolType values', () => {
      const protocolTypes = [
        ProtocolType.MCP,
        ProtocolType.LSP,
        ProtocolType.REST,
        ProtocolType.WEBSOCKET
      ];
      protocolTypes.forEach(protocolType => {
        const testHandler = new TestHandler(ClientType.UNKNOWN, protocolType);
        expect(testHandler.getProtocolType()).toBe(protocolType);
      });
    });
  });

  describe('Method Signatures', () => {
    it('should have correct method signatures', () => {
      // Check that methods have expected parameter counts
      expect(handler.getClientType.length).toBe(0);
      expect(handler.getProtocolType.length).toBe(0);
      expect(handler.getSupportedMethods.length).toBe(0);
      expect(handler.process.length).toBe(2); // req, res
    });

    it('should return correct types', () => {
      expect(typeof handler.getClientType()).toBe('string');
      expect(typeof handler.getProtocolType()).toBe('string');
      expect(Array.isArray(handler.getSupportedMethods())).toBe(true);
    });
  });
});

// Test that the abstract class cannot be instantiated directly
describe('BaseClientHandler Abstract Class', () => {
  it('should be an abstract class', () => {
    // TypeScript prevents direct instantiation, but we can test the class structure
    expect(BaseClientHandler.prototype.constructor).toBe(BaseClientHandler);
    expect(typeof BaseClientHandler).toBe('function');
  });

  it('should define abstract methods that must be implemented', () => {
    // These are enforced at compile time by TypeScript
    // We can check that the prototype doesn't have implementations
    expect(BaseClientHandler.prototype.process).toBeUndefined();
    expect(BaseClientHandler.prototype.getSupportedMethods).toBeUndefined();
  });

  it('should have concrete implementations for getter methods', () => {
    expect(typeof BaseClientHandler.prototype.getClientType).toBe('function');
    expect(typeof BaseClientHandler.prototype.getProtocolType).toBe('function');
  });
});

// Test multiple inheritance scenarios
describe('Multiple Handler Instances', () => {
  it('should support multiple handlers with different configurations', () => {
    const handler1 = new TestHandler(ClientType.CLAUDE, ProtocolType.MCP);
    const handler2 = new TestHandler(ClientType.CURSOR, ProtocolType.LSP);
    const handler3 = new TestHandler(ClientType.REST, ProtocolType.REST);

    expect(handler1.getClientType()).toBe(ClientType.CLAUDE);
    expect(handler1.getProtocolType()).toBe(ProtocolType.MCP);

    expect(handler2.getClientType()).toBe(ClientType.CURSOR);
    expect(handler2.getProtocolType()).toBe(ProtocolType.LSP);

    expect(handler3.getClientType()).toBe(ClientType.REST);
    expect(handler3.getProtocolType()).toBe(ProtocolType.REST);
  });

  it('should maintain separate state for each instance', () => {
    const handlers = [
      new TestHandler(ClientType.CLAUDE, ProtocolType.MCP),
      new TestHandler(ClientType.CURSOR, ProtocolType.LSP),
      new TestHandler(ClientType.COPILOT, ProtocolType.LSP),
      new TestHandler(ClientType.CHATGPT, ProtocolType.REST),
      new TestHandler(ClientType.REST, ProtocolType.REST),
      new TestHandler(ClientType.UNKNOWN, ProtocolType.WEBSOCKET)
    ];

    const expectedPairs = [
      [ClientType.CLAUDE, ProtocolType.MCP],
      [ClientType.CURSOR, ProtocolType.LSP],
      [ClientType.COPILOT, ProtocolType.LSP],
      [ClientType.CHATGPT, ProtocolType.REST],
      [ClientType.REST, ProtocolType.REST],
      [ClientType.UNKNOWN, ProtocolType.WEBSOCKET]
    ];

    handlers.forEach((handler, index) => {
      const [expectedClient, expectedProtocol] = expectedPairs[index];
      expect(handler.getClientType()).toBe(expectedClient);
      expect(handler.getProtocolType()).toBe(expectedProtocol);
    });
  });
});