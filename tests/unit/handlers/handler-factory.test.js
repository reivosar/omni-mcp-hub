"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const handler_factory_1 = require("../../../src/handlers/handler-factory");
const client_types_1 = require("../../../src/types/client-types");
const mcp_handler_1 = require("../../../src/handlers/mcp-handler");
const lsp_handler_1 = require("../../../src/handlers/lsp-handler");
const rest_handler_1 = require("../../../src/handlers/rest-handler");
const source_manager_1 = require("../../../src/sources/source-manager");
const mcp_server_manager_1 = require("../../../src/mcp/mcp-server-manager");
jest.mock('../../../src/handlers/mcp-handler');
jest.mock('../../../src/handlers/lsp-handler');
jest.mock('../../../src/handlers/rest-handler');
jest.mock('../../../src/sources/source-manager');
jest.mock('../../../src/mcp/mcp-server-manager');
const MockMCPHandler = mcp_handler_1.MCPHandler;
const MockLSPHandler = lsp_handler_1.LSPHandler;
const MockRESTHandler = rest_handler_1.RESTHandler;
const MockOmniSourceManager = source_manager_1.OmniSourceManager;
const MockMCPServerManager = mcp_server_manager_1.MCPServerManager;
describe('HandlerFactory', () => {
    let factory;
    let mockSourceManager;
    let mockMCPServerManager;
    beforeEach(() => {
        jest.clearAllMocks();
        mockSourceManager = new MockOmniSourceManager();
        mockMCPServerManager = new MockMCPServerManager();
        factory = new handler_factory_1.HandlerFactory(mockSourceManager, mockMCPServerManager);
    });
    describe('constructor', () => {
        it('should initialize with source manager and MCP server manager', () => {
            expect(factory).toBeInstanceOf(handler_factory_1.HandlerFactory);
        });
        it('should store references to managers', () => {
            expect(factory).toBeDefined();
        });
    });
    describe('create', () => {
        it('should create MCPHandler for CLAUDE client type', () => {
            const handler = factory.create(client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, mockMCPServerManager);
            expect(handler).toBeInstanceOf(MockMCPHandler);
        });
        it('should create LSPHandler for CURSOR client type', () => {
            const handler = factory.create(client_types_1.ClientType.CURSOR);
            expect(MockLSPHandler).toHaveBeenCalledWith();
            expect(handler).toBeInstanceOf(MockLSPHandler);
        });
        it('should create LSPHandler for COPILOT client type', () => {
            const handler = factory.create(client_types_1.ClientType.COPILOT);
            expect(MockLSPHandler).toHaveBeenCalledWith();
            expect(handler).toBeInstanceOf(MockLSPHandler);
        });
        it('should create RESTHandler for CHATGPT client type', () => {
            const handler = factory.create(client_types_1.ClientType.CHATGPT);
            expect(MockRESTHandler).toHaveBeenCalledWith();
            expect(handler).toBeInstanceOf(MockRESTHandler);
        });
        it('should create RESTHandler for REST client type', () => {
            const handler = factory.create(client_types_1.ClientType.REST);
            expect(MockRESTHandler).toHaveBeenCalledWith();
            expect(handler).toBeInstanceOf(MockRESTHandler);
        });
        it('should throw error for unsupported client type', () => {
            expect(() => factory.create(client_types_1.ClientType.UNKNOWN)).toThrow('Unsupported client type: unknown');
        });
        it('should throw error for invalid client type', () => {
            expect(() => factory.create('invalid')).toThrow('Unsupported client type: invalid');
        });
        it('should create different handler instances for same client type', () => {
            const handler1 = factory.create(client_types_1.ClientType.CLAUDE);
            const handler2 = factory.create(client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenCalledTimes(2);
            expect(handler1).not.toBe(handler2);
        });
        it('should pass correct parameters to MCPHandler', () => {
            factory.create(client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, mockMCPServerManager);
        });
        it('should not pass parameters to LSPHandler', () => {
            factory.create(client_types_1.ClientType.CURSOR);
            expect(MockLSPHandler).toHaveBeenCalledWith();
        });
        it('should not pass parameters to RESTHandler', () => {
            factory.create(client_types_1.ClientType.CHATGPT);
            expect(MockRESTHandler).toHaveBeenCalledWith();
        });
    });
    describe('getSupportedTypes', () => {
        it('should return all supported client types', () => {
            const supportedTypes = handler_factory_1.HandlerFactory.getSupportedTypes();
            expect(supportedTypes).toEqual([
                client_types_1.ClientType.CLAUDE,
                client_types_1.ClientType.CURSOR,
                client_types_1.ClientType.COPILOT,
                client_types_1.ClientType.CHATGPT,
                client_types_1.ClientType.REST
            ]);
        });
        it('should return array of ClientType values', () => {
            const supportedTypes = handler_factory_1.HandlerFactory.getSupportedTypes();
            expect(Array.isArray(supportedTypes)).toBe(true);
            supportedTypes.forEach(type => {
                expect(Object.values(client_types_1.ClientType)).toContain(type);
            });
        });
        it('should be static method', () => {
            expect(typeof handler_factory_1.HandlerFactory.getSupportedTypes).toBe('function');
            const supportedTypes = handler_factory_1.HandlerFactory.getSupportedTypes();
            expect(supportedTypes.length).toBeGreaterThan(0);
        });
        it('should not include UNKNOWN client type', () => {
            const supportedTypes = handler_factory_1.HandlerFactory.getSupportedTypes();
            expect(supportedTypes).not.toContain(client_types_1.ClientType.UNKNOWN);
        });
        it('should return consistent results across calls', () => {
            const types1 = handler_factory_1.HandlerFactory.getSupportedTypes();
            const types2 = handler_factory_1.HandlerFactory.getSupportedTypes();
            expect(types1).toEqual(types2);
        });
    });
    describe('static create method', () => {
        it('should create factory and return handler', () => {
            const handler = handler_factory_1.HandlerFactory.create(mockSourceManager, mockMCPServerManager, client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, mockMCPServerManager);
            expect(handler).toBeInstanceOf(MockMCPHandler);
        });
        it('should work for all supported types', () => {
            const supportedTypes = handler_factory_1.HandlerFactory.getSupportedTypes();
            supportedTypes.forEach(type => {
                jest.clearAllMocks();
                const handler = handler_factory_1.HandlerFactory.create(mockSourceManager, mockMCPServerManager, type);
                expect(handler).toBeDefined();
            });
        });
        it('should throw error for unsupported types', () => {
            expect(() => handler_factory_1.HandlerFactory.create(mockSourceManager, mockMCPServerManager, client_types_1.ClientType.UNKNOWN)).toThrow('Unsupported client type: unknown');
        });
        it('should create new factory instance each time', () => {
            const handler1 = handler_factory_1.HandlerFactory.create(mockSourceManager, mockMCPServerManager, client_types_1.ClientType.CLAUDE);
            const handler2 = handler_factory_1.HandlerFactory.create(mockSourceManager, mockMCPServerManager, client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenCalledTimes(2);
        });
        it('should pass managers correctly to created handlers', () => {
            handler_factory_1.HandlerFactory.create(mockSourceManager, mockMCPServerManager, client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, mockMCPServerManager);
        });
    });
    describe('handler creation patterns', () => {
        it('should create MCP handlers with dependencies', () => {
            const mcpTypes = [client_types_1.ClientType.CLAUDE];
            mcpTypes.forEach(type => {
                jest.clearAllMocks();
                factory.create(type);
                expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, mockMCPServerManager);
            });
        });
        it('should create LSP handlers without dependencies', () => {
            const lspTypes = [client_types_1.ClientType.CURSOR, client_types_1.ClientType.COPILOT];
            lspTypes.forEach(type => {
                jest.clearAllMocks();
                factory.create(type);
                expect(MockLSPHandler).toHaveBeenCalledWith();
            });
        });
        it('should create REST handlers without dependencies', () => {
            const restTypes = [client_types_1.ClientType.CHATGPT, client_types_1.ClientType.REST];
            restTypes.forEach(type => {
                jest.clearAllMocks();
                factory.create(type);
                expect(MockRESTHandler).toHaveBeenCalledWith();
            });
        });
    });
    describe('error handling', () => {
        it('should handle null source manager gracefully', () => {
            const factoryWithNullSource = new handler_factory_1.HandlerFactory(null, mockMCPServerManager);
            const handler = factoryWithNullSource.create(client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenCalledWith(null, mockMCPServerManager);
        });
        it('should handle null MCP server manager gracefully', () => {
            const factoryWithNullMCP = new handler_factory_1.HandlerFactory(mockSourceManager, null);
            const handler = factoryWithNullMCP.create(client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenCalledWith(mockSourceManager, null);
        });
        it('should handle undefined client type', () => {
            expect(() => factory.create(undefined)).toThrow('Unsupported client type: undefined');
        });
        it('should handle null client type', () => {
            expect(() => factory.create(null)).toThrow('Unsupported client type: null');
        });
        it('should provide meaningful error messages', () => {
            const invalidType = 'invalid-type';
            expect(() => factory.create(invalidType)).toThrow('Unsupported client type: invalid-type');
        });
    });
    describe('integration scenarios', () => {
        it('should support creating multiple handler types', () => {
            const claudeHandler = factory.create(client_types_1.ClientType.CLAUDE);
            const cursorHandler = factory.create(client_types_1.ClientType.CURSOR);
            const chatgptHandler = factory.create(client_types_1.ClientType.CHATGPT);
            expect(MockMCPHandler).toHaveBeenCalledTimes(1);
            expect(MockLSPHandler).toHaveBeenCalledTimes(1);
            expect(MockRESTHandler).toHaveBeenCalledTimes(1);
        });
        it('should maintain dependency injection consistency', () => {
            factory.create(client_types_1.ClientType.CLAUDE);
            factory.create(client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenCalledTimes(2);
            expect(MockMCPHandler).toHaveBeenNthCalledWith(1, mockSourceManager, mockMCPServerManager);
            expect(MockMCPHandler).toHaveBeenNthCalledWith(2, mockSourceManager, mockMCPServerManager);
        });
        it('should work with different manager instances', () => {
            const altSourceManager = new MockOmniSourceManager();
            const altMCPManager = new MockMCPServerManager();
            const altFactory = new handler_factory_1.HandlerFactory(altSourceManager, altMCPManager);
            altFactory.create(client_types_1.ClientType.CLAUDE);
            expect(MockMCPHandler).toHaveBeenLastCalledWith(altSourceManager, altMCPManager);
        });
    });
    describe('type safety', () => {
        it('should enforce ClientType enum values', () => {
            const supportedTypes = handler_factory_1.HandlerFactory.getSupportedTypes();
            supportedTypes.forEach(type => {
                expect(() => factory.create(type)).not.toThrow();
            });
        });
        it('should reject non-enum values', () => {
            const invalidValues = ['invalid', 'nonexistent', 'wrong'];
            invalidValues.forEach(value => {
                expect(() => factory.create(value)).toThrow();
            });
        });
    });
});
