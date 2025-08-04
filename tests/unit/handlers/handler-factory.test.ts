import { HandlerFactory } from '../../../src/handlers/handler-factory';
import { ClientType } from '../../../src/types/client-types';
import { MCPHandler } from '../../../src/handlers/mcp-handler';
import { LSPHandler } from '../../../src/handlers/lsp-handler';
import { RESTHandler } from '../../../src/handlers/rest-handler';
import { OmniSourceManager } from '../../../src/sources/source-manager';
import { MCPServerManager } from '../../../src/mcp/mcp-server-manager';

// Mock dependencies
jest.mock('../../../src/handlers/mcp-handler');
jest.mock('../../../src/handlers/lsp-handler');
jest.mock('../../../src/handlers/rest-handler');
jest.mock('../../../src/sources/source-manager');
jest.mock('../../../src/mcp/mcp-server-manager');

const MockMCPHandler = MCPHandler as jest.MockedClass<typeof MCPHandler>;
const MockLSPHandler = LSPHandler as jest.MockedClass<typeof LSPHandler>;
const MockRESTHandler = RESTHandler as jest.MockedClass<typeof RESTHandler>;
const MockOmniSourceManager = OmniSourceManager as jest.MockedClass<typeof OmniSourceManager>;
const MockMCPServerManager = MCPServerManager as jest.MockedClass<typeof MCPServerManager>;

describe('HandlerFactory', () => {
  let factory: HandlerFactory;
  let mockSourceManager: jest.Mocked<OmniSourceManager>;
  let mockMCPServerManager: jest.Mocked<MCPServerManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSourceManager = new MockOmniSourceManager() as jest.Mocked<OmniSourceManager>;
    mockMCPServerManager = new MockMCPServerManager() as jest.Mocked<MCPServerManager>;
    
    factory = new HandlerFactory(mockSourceManager, mockMCPServerManager);
  });

  describe('constructor', () => {
    it('should initialize with source manager and MCP server manager', () => {
      expect(factory).toBeInstanceOf(HandlerFactory);
    });

    it('should store references to managers', () => {
      // Verify that the factory was created with the managers
      expect(factory).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create MCPHandler for CLAUDE client type', () => {
      const handler = factory.create(ClientType.CLAUDE);
      
      expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, mockMCPServerManager);
      expect(handler).toBeInstanceOf(MockMCPHandler);
    });

    it('should create LSPHandler for CURSOR client type', () => {
      const handler = factory.create(ClientType.CURSOR);
      
      expect(MockLSPHandler).toHaveBeenCalledWith();
      expect(handler).toBeInstanceOf(MockLSPHandler);
    });

    it('should create LSPHandler for COPILOT client type', () => {
      const handler = factory.create(ClientType.COPILOT);
      
      expect(MockLSPHandler).toHaveBeenCalledWith();
      expect(handler).toBeInstanceOf(MockLSPHandler);
    });

    it('should create RESTHandler for CHATGPT client type', () => {
      const handler = factory.create(ClientType.CHATGPT);
      
      expect(MockRESTHandler).toHaveBeenCalledWith();
      expect(handler).toBeInstanceOf(MockRESTHandler);
    });

    it('should create RESTHandler for REST client type', () => {
      const handler = factory.create(ClientType.REST);
      
      expect(MockRESTHandler).toHaveBeenCalledWith();
      expect(handler).toBeInstanceOf(MockRESTHandler);
    });

    it('should throw error for unsupported client type', () => {
      expect(() => factory.create(ClientType.UNKNOWN)).toThrow('Unsupported client type: unknown');
    });

    it('should throw error for invalid client type', () => {
      expect(() => factory.create('invalid' as ClientType)).toThrow('Unsupported client type: invalid');
    });

    it('should create different handler instances for same client type', () => {
      const handler1 = factory.create(ClientType.CLAUDE);
      const handler2 = factory.create(ClientType.CLAUDE);
      
      expect(MockMCPHandler).toHaveBeenCalledTimes(2);
      expect(handler1).not.toBe(handler2);
    });

    it('should pass correct parameters to MCPHandler', () => {
      factory.create(ClientType.CLAUDE);
      
      expect(MockMCPHandler).toHaveBeenCalledWith(
        mockSourceManager,
        mockMCPServerManager
      );
    });

    it('should not pass parameters to LSPHandler', () => {
      factory.create(ClientType.CURSOR);
      
      expect(MockLSPHandler).toHaveBeenCalledWith();
    });

    it('should not pass parameters to RESTHandler', () => {
      factory.create(ClientType.CHATGPT);
      
      expect(MockRESTHandler).toHaveBeenCalledWith();
    });
  });

  describe('getSupportedTypes', () => {
    it('should return all supported client types', () => {
      const supportedTypes = HandlerFactory.getSupportedTypes();
      
      expect(supportedTypes).toEqual([
        ClientType.CLAUDE,
        ClientType.CURSOR,
        ClientType.COPILOT,
        ClientType.CHATGPT,
        ClientType.REST
      ]);
    });

    it('should return array of ClientType values', () => {
      const supportedTypes = HandlerFactory.getSupportedTypes();
      
      expect(Array.isArray(supportedTypes)).toBe(true);
      supportedTypes.forEach(type => {
        expect(Object.values(ClientType)).toContain(type);
      });
    });

    it('should be static method', () => {
      expect(typeof HandlerFactory.getSupportedTypes).toBe('function');
      
      // Should be callable without instance
      const supportedTypes = HandlerFactory.getSupportedTypes();
      expect(supportedTypes.length).toBeGreaterThan(0);
    });

    it('should not include UNKNOWN client type', () => {
      const supportedTypes = HandlerFactory.getSupportedTypes();
      
      expect(supportedTypes).not.toContain(ClientType.UNKNOWN);
    });

    it('should return consistent results across calls', () => {
      const types1 = HandlerFactory.getSupportedTypes();
      const types2 = HandlerFactory.getSupportedTypes();
      
      expect(types1).toEqual(types2);
    });
  });

  describe('static create method', () => {
    it('should create factory and return handler', () => {
      const handler = HandlerFactory.create(mockSourceManager, mockMCPServerManager, ClientType.CLAUDE);
      
      expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, mockMCPServerManager);
      expect(handler).toBeInstanceOf(MockMCPHandler);
    });

    it('should work for all supported types', () => {
      const supportedTypes = HandlerFactory.getSupportedTypes();
      
      supportedTypes.forEach(type => {
        jest.clearAllMocks();
        
        const handler = HandlerFactory.create(mockSourceManager, mockMCPServerManager, type);
        expect(handler).toBeDefined();
      });
    });

    it('should throw error for unsupported types', () => {
      expect(() => 
        HandlerFactory.create(mockSourceManager, mockMCPServerManager, ClientType.UNKNOWN)
      ).toThrow('Unsupported client type: unknown');
    });

    it('should create new factory instance each time', () => {
      const handler1 = HandlerFactory.create(mockSourceManager, mockMCPServerManager, ClientType.CLAUDE);
      const handler2 = HandlerFactory.create(mockSourceManager, mockMCPServerManager, ClientType.CLAUDE);
      
      expect(MockMCPHandler).toHaveBeenCalledTimes(2);
    });

    it('should pass managers correctly to created handlers', () => {
      HandlerFactory.create(mockSourceManager, mockMCPServerManager, ClientType.CLAUDE);
      
      expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, mockMCPServerManager);
    });
  });

  describe('handler creation patterns', () => {
    it('should create MCP handlers with dependencies', () => {
      const mcpTypes = [ClientType.CLAUDE];
      
      mcpTypes.forEach(type => {
        jest.clearAllMocks();
        
        factory.create(type);
        expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, mockMCPServerManager);
      });
    });

    it('should create LSP handlers without dependencies', () => {
      const lspTypes = [ClientType.CURSOR, ClientType.COPILOT];
      
      lspTypes.forEach(type => {
        jest.clearAllMocks();
        
        factory.create(type);
        expect(MockLSPHandler).toHaveBeenCalledWith();
      });
    });

    it('should create REST handlers without dependencies', () => {
      const restTypes = [ClientType.CHATGPT, ClientType.REST];
      
      restTypes.forEach(type => {
        jest.clearAllMocks();
        
        factory.create(type);
        expect(MockRESTHandler).toHaveBeenCalledWith();
      });
    });
  });

  describe('error handling', () => {
    it('should handle null source manager gracefully', () => {
      const factoryWithNullSource = new HandlerFactory(null as any, mockMCPServerManager);
      
      // Should still create handler, let handler handle null dependency
      const handler = factoryWithNullSource.create(ClientType.CLAUDE);
      expect(MockMCPHandler).toHaveBeenCalledWith(null, mockMCPServerManager);
    });

    it('should handle null MCP server manager gracefully', () => {
      const factoryWithNullMCP = new HandlerFactory(mockSourceManager, null as any);
      
      const handler = factoryWithNullMCP.create(ClientType.CLAUDE);
      expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, null);
    });

    it('should handle undefined client type', () => {
      expect(() => factory.create(undefined as any)).toThrow('Unsupported client type: undefined');
    });

    it('should handle null client type', () => {
      expect(() => factory.create(null as any)).toThrow('Unsupported client type: null');
    });

    it('should provide meaningful error messages', () => {
      const invalidType = 'invalid-type' as ClientType;
      
      expect(() => factory.create(invalidType)).toThrow('Unsupported client type: invalid-type');
    });
  });

  describe('integration scenarios', () => {
    it('should support creating multiple handler types', () => {
      const claudeHandler = factory.create(ClientType.CLAUDE);
      const cursorHandler = factory.create(ClientType.CURSOR);
      const chatgptHandler = factory.create(ClientType.CHATGPT);
      
      expect(MockMCPHandler).toHaveBeenCalledTimes(1);
      expect(MockLSPHandler).toHaveBeenCalledTimes(1);
      expect(MockRESTHandler).toHaveBeenCalledTimes(1);
    });

    it('should maintain dependency injection consistency', () => {
      // Create multiple Claude handlers
      factory.create(ClientType.CLAUDE);
      factory.create(ClientType.CLAUDE);
      
      expect(MockMCPHandler).toHaveBeenCalledTimes(2);
      expect(MockMCPHandler).toHaveBeenNthCalledWith(1, mockSourceManager, mockMCPServerManager);
      expect(MockMCPHandler).toHaveBeenNthCalledWith(2, mockSourceManager, mockMCPServerManager);
    });

    it('should work with different manager instances', () => {
      const altSourceManager = new MockOmniSourceManager() as jest.Mocked<OmniSourceManager>;
      const altMCPManager = new MockMCPServerManager() as jest.Mocked<MCPServerManager>;
      
      const altFactory = new HandlerFactory(altSourceManager, altMCPManager);
      altFactory.create(ClientType.CLAUDE);
      
      expect(MockMCPHandler).toHaveBeenLastCalledWith(altSourceManager, altMCPManager);
    });
  });

  describe('type safety', () => {
    it('should enforce ClientType enum values', () => {
      const supportedTypes = HandlerFactory.getSupportedTypes();
      
      supportedTypes.forEach(type => {
        expect(() => factory.create(type)).not.toThrow();
      });
    });

    it('should reject non-enum values', () => {
      const invalidValues = ['invalid', 'nonexistent', 'wrong'];
      
      invalidValues.forEach(value => {
        expect(() => factory.create(value as ClientType)).toThrow();
      });
    });
  });
});