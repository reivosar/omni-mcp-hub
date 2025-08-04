"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lsp_handler_1 = require("../../../src/handlers/lsp-handler");
const client_types_1 = require("../../../src/types/client-types");
describe('LSPHandler', () => {
    let handler;
    let mockReq;
    let mockRes;
    beforeEach(() => {
        handler = new lsp_handler_1.LSPHandler();
        mockReq = {
            body: {},
            headers: {},
            url: '/lsp',
            path: '/lsp'
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            setHeader: jest.fn().mockReturnThis()
        };
    });
    describe('constructor', () => {
        it('should initialize with correct client and protocol types', () => {
            expect(handler.getClientType()).toBe(client_types_1.ClientType.CURSOR);
            expect(handler.getProtocolType()).toBe(client_types_1.ProtocolType.LSP);
        });
        it('should extend BaseClientHandler', () => {
            expect(handler).toHaveProperty('getClientType');
            expect(handler).toHaveProperty('getProtocolType');
            expect(handler).toHaveProperty('getSupportedMethods');
        });
    });
    describe('process', () => {
        it('should return 501 Not Implemented status', async () => {
            await handler.process(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(501);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'LSP handler not implemented yet'
            });
        });
        it('should handle different request types consistently', async () => {
            const requests = [
                { ...mockReq, body: { method: 'textDocument/completion' } },
                { ...mockReq, body: { method: 'textDocument/hover' } },
                { ...mockReq, body: { method: 'workspace/symbol' } },
                { ...mockReq, body: { method: 'unknown/method' } }
            ];
            for (const req of requests) {
                const res = {
                    status: jest.fn().mockReturnThis(),
                    json: jest.fn().mockReturnThis()
                };
                await handler.process(req, res);
                expect(res.status).toHaveBeenCalledWith(501);
                expect(res.json).toHaveBeenCalledWith({
                    error: 'LSP handler not implemented yet'
                });
            }
        });
        it('should handle requests without body', async () => {
            const reqWithoutBody = { ...mockReq };
            delete reqWithoutBody.body;
            await handler.process(reqWithoutBody, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(501);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'LSP handler not implemented yet'
            });
        });
        it('should handle async processing', async () => {
            const startTime = Date.now();
            await handler.process(mockReq, mockRes);
            const endTime = Date.now();
            expect(endTime - startTime).toBeLessThan(100);
            expect(mockRes.status).toHaveBeenCalledWith(501);
        });
    });
    describe('getSupportedMethods', () => {
        it('should return LSP method names', () => {
            const methods = handler.getSupportedMethods();
            expect(methods).toEqual([
                'textDocument/completion',
                'textDocument/hover',
                'workspace/symbol'
            ]);
        });
        it('should return consistent methods across multiple calls', () => {
            const methods1 = handler.getSupportedMethods();
            const methods2 = handler.getSupportedMethods();
            expect(methods1).toEqual(methods2);
        });
        it('should return array of strings', () => {
            const methods = handler.getSupportedMethods();
            expect(Array.isArray(methods)).toBe(true);
            methods.forEach(method => {
                expect(typeof method).toBe('string');
            });
        });
        it('should include standard LSP methods', () => {
            const methods = handler.getSupportedMethods();
            methods.forEach(method => {
                expect(method).toMatch(/^(textDocument|workspace)\//);
            });
        });
    });
    describe('inheritance from BaseClientHandler', () => {
        it('should have correct client type', () => {
            expect(handler.getClientType()).toBe(client_types_1.ClientType.CURSOR);
        });
        it('should have correct protocol type', () => {
            expect(handler.getProtocolType()).toBe(client_types_1.ProtocolType.LSP);
        });
        it('should inherit base handler methods', () => {
            expect(typeof handler.getClientType).toBe('function');
            expect(typeof handler.getProtocolType).toBe('function');
            expect(typeof handler.process).toBe('function');
            expect(typeof handler.getSupportedMethods).toBe('function');
        });
    });
    describe('error handling', () => {
        it('should handle response object without status method', async () => {
            const brokenRes = {
                json: jest.fn()
            };
            await expect(handler.process(mockReq, brokenRes)).rejects.toThrow();
        });
        it('should handle response object without json method', async () => {
            const brokenRes = {
                status: jest.fn().mockReturnThis()
            };
            await expect(handler.process(mockReq, brokenRes)).rejects.toThrow();
        });
        it('should handle null/undefined request', async () => {
            await expect(handler.process(null, mockRes))
                .resolves.not.toThrow();
            expect(mockRes.status).toHaveBeenCalledWith(501);
        });
        it('should handle null/undefined response', async () => {
            await expect(handler.process(mockReq, null))
                .rejects.toThrow();
        });
    });
    describe('future implementation considerations', () => {
        it('should be ready for LSP protocol implementation', () => {
            expect(handler.getProtocolType()).toBe(client_types_1.ProtocolType.LSP);
            expect(handler.getSupportedMethods()).toContain('textDocument/completion');
            expect(handler.getSupportedMethods()).toContain('textDocument/hover');
            expect(handler.getSupportedMethods()).toContain('workspace/symbol');
        });
        it('should maintain consistent interface for future implementations', () => {
            const methods = handler.getSupportedMethods();
            methods.forEach(method => {
                expect(method).toMatch(/^[a-zA-Z]+\/[a-zA-Z]+$/);
            });
        });
    });
    describe('performance', () => {
        it('should respond quickly with not implemented error', async () => {
            const start = performance.now();
            await handler.process(mockReq, mockRes);
            const end = performance.now();
            expect(end - start).toBeLessThan(10);
        });
        it('should handle multiple concurrent requests', async () => {
            const requests = Array.from({ length: 10 }, () => handler.process(mockReq, {
                status: jest.fn().mockReturnThis(),
                json: jest.fn().mockReturnThis()
            }));
            await expect(Promise.all(requests)).resolves.toBeDefined();
        });
    });
});
