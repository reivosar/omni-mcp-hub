"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const base_handler_1 = require("../../../src/handlers/base-handler");
const client_types_1 = require("../../../src/types/client-types");
class TestHandler extends base_handler_1.BaseClientHandler {
    constructor(clientType, protocolType) {
        super(clientType, protocolType);
    }
    async process(req, res) {
        res.json({ message: 'test' });
    }
    getSupportedMethods() {
        return ['test', 'ping'];
    }
}
describe('BaseClientHandler', () => {
    let handler;
    let mockRequest;
    let mockResponse;
    beforeEach(() => {
        handler = new TestHandler(client_types_1.ClientType.CLAUDE, client_types_1.ProtocolType.MCP);
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
            const claudeHandler = new TestHandler(client_types_1.ClientType.CLAUDE, client_types_1.ProtocolType.MCP);
            expect(claudeHandler.getClientType()).toBe(client_types_1.ClientType.CLAUDE);
            expect(claudeHandler.getProtocolType()).toBe(client_types_1.ProtocolType.MCP);
        });
        it('should work with different client and protocol combinations', () => {
            const restHandler = new TestHandler(client_types_1.ClientType.REST, client_types_1.ProtocolType.REST);
            expect(restHandler.getClientType()).toBe(client_types_1.ClientType.REST);
            expect(restHandler.getProtocolType()).toBe(client_types_1.ProtocolType.REST);
            const lspHandler = new TestHandler(client_types_1.ClientType.CURSOR, client_types_1.ProtocolType.LSP);
            expect(lspHandler.getClientType()).toBe(client_types_1.ClientType.CURSOR);
            expect(lspHandler.getProtocolType()).toBe(client_types_1.ProtocolType.LSP);
        });
    });
    describe('getClientType', () => {
        it('should return the client type set in constructor', () => {
            expect(handler.getClientType()).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should return correct type for different clients', () => {
            const cursorHandler = new TestHandler(client_types_1.ClientType.CURSOR, client_types_1.ProtocolType.LSP);
            expect(cursorHandler.getClientType()).toBe(client_types_1.ClientType.CURSOR);
            const restHandler = new TestHandler(client_types_1.ClientType.REST, client_types_1.ProtocolType.REST);
            expect(restHandler.getClientType()).toBe(client_types_1.ClientType.REST);
            const unknownHandler = new TestHandler(client_types_1.ClientType.UNKNOWN, client_types_1.ProtocolType.REST);
            expect(unknownHandler.getClientType()).toBe(client_types_1.ClientType.UNKNOWN);
        });
    });
    describe('getProtocolType', () => {
        it('should return the protocol type set in constructor', () => {
            expect(handler.getProtocolType()).toBe(client_types_1.ProtocolType.MCP);
        });
        it('should return correct protocol for different types', () => {
            const lspHandler = new TestHandler(client_types_1.ClientType.CURSOR, client_types_1.ProtocolType.LSP);
            expect(lspHandler.getProtocolType()).toBe(client_types_1.ProtocolType.LSP);
            const restHandler = new TestHandler(client_types_1.ClientType.REST, client_types_1.ProtocolType.REST);
            expect(restHandler.getProtocolType()).toBe(client_types_1.ProtocolType.REST);
            const wsHandler = new TestHandler(client_types_1.ClientType.UNKNOWN, client_types_1.ProtocolType.WEBSOCKET);
            expect(wsHandler.getProtocolType()).toBe(client_types_1.ProtocolType.WEBSOCKET);
        });
    });
    describe('Abstract Methods Implementation', () => {
        it('should implement process method', async () => {
            await handler.process(mockRequest, mockResponse);
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
            expect(handler.getClientType()).toBeDefined();
            expect(handler.getProtocolType()).toBeDefined();
        });
    });
    describe('Inheritance', () => {
        it('should be extendable by concrete classes', () => {
            expect(handler).toBeInstanceOf(base_handler_1.BaseClientHandler);
            expect(handler).toBeInstanceOf(TestHandler);
        });
        it('should enforce abstract method implementation', () => {
            expect(typeof handler.process).toBe('function');
            expect(typeof handler.getSupportedMethods).toBe('function');
        });
    });
    describe('Type Safety', () => {
        it('should work with all valid ClientType values', () => {
            const clientTypes = [
                client_types_1.ClientType.CLAUDE,
                client_types_1.ClientType.CURSOR,
                client_types_1.ClientType.COPILOT,
                client_types_1.ClientType.CHATGPT,
                client_types_1.ClientType.REST,
                client_types_1.ClientType.UNKNOWN
            ];
            clientTypes.forEach(clientType => {
                const testHandler = new TestHandler(clientType, client_types_1.ProtocolType.REST);
                expect(testHandler.getClientType()).toBe(clientType);
            });
        });
        it('should work with all valid ProtocolType values', () => {
            const protocolTypes = [
                client_types_1.ProtocolType.MCP,
                client_types_1.ProtocolType.LSP,
                client_types_1.ProtocolType.REST,
                client_types_1.ProtocolType.WEBSOCKET
            ];
            protocolTypes.forEach(protocolType => {
                const testHandler = new TestHandler(client_types_1.ClientType.UNKNOWN, protocolType);
                expect(testHandler.getProtocolType()).toBe(protocolType);
            });
        });
    });
    describe('Method Signatures', () => {
        it('should have correct method signatures', () => {
            expect(handler.getClientType.length).toBe(0);
            expect(handler.getProtocolType.length).toBe(0);
            expect(handler.getSupportedMethods.length).toBe(0);
            expect(handler.process.length).toBe(2);
        });
        it('should return correct types', () => {
            expect(typeof handler.getClientType()).toBe('string');
            expect(typeof handler.getProtocolType()).toBe('string');
            expect(Array.isArray(handler.getSupportedMethods())).toBe(true);
        });
    });
});
describe('BaseClientHandler Abstract Class', () => {
    it('should be an abstract class', () => {
        expect(base_handler_1.BaseClientHandler.prototype.constructor).toBe(base_handler_1.BaseClientHandler);
        expect(typeof base_handler_1.BaseClientHandler).toBe('function');
    });
    it('should define abstract methods that must be implemented', () => {
        expect(base_handler_1.BaseClientHandler.prototype.process).toBeUndefined();
        expect(base_handler_1.BaseClientHandler.prototype.getSupportedMethods).toBeUndefined();
    });
    it('should have concrete implementations for getter methods', () => {
        expect(typeof base_handler_1.BaseClientHandler.prototype.getClientType).toBe('function');
        expect(typeof base_handler_1.BaseClientHandler.prototype.getProtocolType).toBe('function');
    });
});
describe('Multiple Handler Instances', () => {
    it('should support multiple handlers with different configurations', () => {
        const handler1 = new TestHandler(client_types_1.ClientType.CLAUDE, client_types_1.ProtocolType.MCP);
        const handler2 = new TestHandler(client_types_1.ClientType.CURSOR, client_types_1.ProtocolType.LSP);
        const handler3 = new TestHandler(client_types_1.ClientType.REST, client_types_1.ProtocolType.REST);
        expect(handler1.getClientType()).toBe(client_types_1.ClientType.CLAUDE);
        expect(handler1.getProtocolType()).toBe(client_types_1.ProtocolType.MCP);
        expect(handler2.getClientType()).toBe(client_types_1.ClientType.CURSOR);
        expect(handler2.getProtocolType()).toBe(client_types_1.ProtocolType.LSP);
        expect(handler3.getClientType()).toBe(client_types_1.ClientType.REST);
        expect(handler3.getProtocolType()).toBe(client_types_1.ProtocolType.REST);
    });
    it('should maintain separate state for each instance', () => {
        const handlers = [
            new TestHandler(client_types_1.ClientType.CLAUDE, client_types_1.ProtocolType.MCP),
            new TestHandler(client_types_1.ClientType.CURSOR, client_types_1.ProtocolType.LSP),
            new TestHandler(client_types_1.ClientType.COPILOT, client_types_1.ProtocolType.LSP),
            new TestHandler(client_types_1.ClientType.CHATGPT, client_types_1.ProtocolType.REST),
            new TestHandler(client_types_1.ClientType.REST, client_types_1.ProtocolType.REST),
            new TestHandler(client_types_1.ClientType.UNKNOWN, client_types_1.ProtocolType.WEBSOCKET)
        ];
        const expectedPairs = [
            [client_types_1.ClientType.CLAUDE, client_types_1.ProtocolType.MCP],
            [client_types_1.ClientType.CURSOR, client_types_1.ProtocolType.LSP],
            [client_types_1.ClientType.COPILOT, client_types_1.ProtocolType.LSP],
            [client_types_1.ClientType.CHATGPT, client_types_1.ProtocolType.REST],
            [client_types_1.ClientType.REST, client_types_1.ProtocolType.REST],
            [client_types_1.ClientType.UNKNOWN, client_types_1.ProtocolType.WEBSOCKET]
        ];
        handlers.forEach((handler, index) => {
            const [expectedClient, expectedProtocol] = expectedPairs[index];
            expect(handler.getClientType()).toBe(expectedClient);
            expect(handler.getProtocolType()).toBe(expectedProtocol);
        });
    });
});
