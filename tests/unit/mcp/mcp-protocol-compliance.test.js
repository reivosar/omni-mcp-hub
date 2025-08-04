"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_handler_1 = require("../../../src/handlers/mcp-handler");
const source_manager_1 = require("../../../src/sources/source-manager");
const content_validator_1 = require("../../../src/utils/content-validator");
const mcp_server_manager_1 = require("../../../src/mcp/mcp-server-manager");
jest.mock('../../../src/utils/content-validator');
jest.mock('../../../src/mcp/mcp-server-manager');
jest.mock('../../../src/sources/source-manager');
const MockContentValidator = content_validator_1.ContentValidator;
const MockMCPServerManager = mcp_server_manager_1.MCPServerManager;
const MockOmniSourceManager = source_manager_1.OmniSourceManager;
describe('MCP Protocol Compliance Tests', () => {
    let handler;
    let mockServerManager;
    beforeEach(() => {
        mockServerManager = {
            startServer: jest.fn(),
            stopServer: jest.fn(),
            stopAllServers: jest.fn(),
            getServer: jest.fn(),
            getAllServers: jest.fn().mockReturnValue([]),
            getAllTools: jest.fn().mockResolvedValue([
                {
                    name: 'test-server__search',
                    description: 'Search tool',
                    _server: 'test-server',
                    _originalName: 'search',
                    input_schema: {
                        type: 'object',
                        properties: {
                            query: { type: 'string' }
                        }
                    }
                }
            ]),
            callTool: jest.fn().mockResolvedValue({ result: 'tool executed' }),
            initializeServers: jest.fn(),
            ensureInstalledSecurely: jest.fn()
        };
        MockMCPServerManager.mockImplementation(() => mockServerManager);
        const mockValidator = {
            validate: jest.fn().mockResolvedValue({
                isValid: true,
                flaggedPatterns: []
            })
        };
        MockContentValidator.mockImplementation(() => mockValidator);
        const mockSourceManager = {
            sourceManager: null,
            sources: new Map(),
            configLoader: null,
            initializeSources: jest.fn(),
            getFiles: jest.fn(),
            getFile: jest.fn(),
            listFiles: jest.fn(),
            getSourceInfo: jest.fn(),
            getBundleMode: jest.fn().mockReturnValue(false),
            getSourceNames: jest.fn().mockReturnValue([]),
            listSourceFiles: jest.fn().mockResolvedValue([]),
            getSourceFile: jest.fn().mockResolvedValue(null),
            getSourceFiles: jest.fn().mockResolvedValue(new Map()),
            getFilePatterns: jest.fn().mockReturnValue(['*.md'])
        };
        MockOmniSourceManager.mockImplementation(() => mockSourceManager);
        handler = new mcp_handler_1.MCPHandler(mockSourceManager, mockServerManager);
        jest.clearAllMocks();
    });
    describe('Protocol Version Compliance', () => {
        test('should support MCP protocol version 2025-06-18', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            };
            const response = await handler.handleMessage(request);
            expect(response.result).toBeDefined();
            expect(response.result.protocolVersion).toBe('2025-06-18');
            expect(response.result.capabilities).toBeDefined();
            expect(response.result.serverInfo).toBeDefined();
            expect(response.result.serverInfo.name).toBe('omni-mcp-hub');
        });
        test('should accept any protocol version (no validation)', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-01-01',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            };
            const response = await handler.handleMessage(request);
            expect(response.error).toBeUndefined();
            expect(response.result).toBeDefined();
            expect(response.result.protocolVersion).toBe('2025-06-18');
        });
        test('should handle missing protocol version', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    capabilities: { tools: {} },
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            };
            const response = await handler.handleMessage(request);
            expect(response.error).toBeUndefined();
            expect(response.result).toBeDefined();
            expect(response.result.protocolVersion).toBe('2025-06-18');
        });
    });
    describe('JSON-RPC 2.0 Compliance', () => {
        test('should handle requests without jsonrpc field', async () => {
            const request = {
                id: 1,
                method: 'initialize',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.jsonrpc).toBe('2.0');
            expect(response.id).toBe(1);
        });
        test('should handle incorrect jsonrpc version', async () => {
            const request = {
                jsonrpc: '1.0',
                id: 1,
                method: 'initialize',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.jsonrpc).toBe('2.0');
            expect(response.id).toBe(1);
        });
        test('should handle requests without id (notifications)', async () => {
            const request = {
                jsonrpc: '2.0',
                method: 'initialized',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.jsonrpc).toBe('2.0');
            expect(response.id).toBeUndefined();
        });
        test('should preserve request id in response', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 12345,
                method: 'ping',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.id).toBe(12345);
        });
        test('should handle string ids', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 'test-request-id',
                method: 'ping',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.id).toBe('test-request-id');
        });
        test('should handle null ids', async () => {
            const request = {
                jsonrpc: '2.0',
                id: null,
                method: 'ping',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.id).toBeNull();
        });
    });
    describe('Core MCP Methods', () => {
        test('should handle ping method', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'ping',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.result).toEqual({});
            expect(response.error).toBeUndefined();
        });
        test('should not require initialization before other methods', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.error).toBeUndefined();
            expect(response.result).toBeDefined();
            expect(response.result.tools).toBeDefined();
        });
        test('should handle initialized notification', async () => {
            await handler.handleMessage({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            });
            const request = {
                jsonrpc: '2.0',
                method: 'initialized',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.jsonrpc).toBe('2.0');
            expect(response.id).toBeUndefined();
        });
        test('should list tools without requiring initialization', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.result).toBeDefined();
            expect(response.result.tools).toBeDefined();
            expect(Array.isArray(response.result.tools)).toBe(true);
            expect(mockServerManager.getAllTools).toHaveBeenCalled();
        });
        test('should call tools with proper parameters', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'test-server__search',
                    arguments: { query: 'test query' }
                }
            };
            const response = await handler.handleMessage(request);
            expect(response.result).toBeDefined();
            expect(mockServerManager.callTool).toHaveBeenCalledWith('test-server__search', { query: 'test query' });
        });
        test('should handle missing tool name in tools/call', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    arguments: { query: 'test query' }
                }
            };
            const response = await handler.handleMessage(request);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32603);
            expect(response.error.message).toContain('Cannot read properties of undefined');
        });
    });
    describe('Error Handling Compliance', () => {
        test('should return proper error for unknown methods', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'unknown/method',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32601);
            expect(response.error.message).toBe('Method not found: unknown/method');
        });
        test('should handle internal errors gracefully', async () => {
            mockServerManager.getAllTools.mockRejectedValueOnce(new Error('Internal server error'));
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.error).toBeUndefined();
            expect(response.result).toBeDefined();
            expect(response.result.tools).toBeDefined();
            expect(response.result.tools.length).toBeGreaterThan(0);
        });
        test('should handle malformed requests', async () => {
            await expect(handler.handleMessage(null)).rejects.toThrow();
        });
        test('should validate tool call arguments', async () => {
            mockServerManager.callTool.mockRejectedValueOnce(new Error('Invalid arguments'));
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'test-server__search',
                    arguments: { invalid: 'args' }
                }
            };
            const response = await handler.handleMessage(request);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32603);
            expect(response.error.message).toBe('Invalid arguments');
        });
    });
    describe('Capabilities Declaration', () => {
        test('should declare proper server capabilities', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            };
            const response = await handler.handleMessage(request);
            expect(response.result.capabilities).toBeDefined();
            expect(response.result.capabilities.tools).toBeDefined();
            expect(response.result.capabilities.tools.listChanged).toBe(true);
        });
        test('should include server info', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            };
            const response = await handler.handleMessage(request);
            expect(response.result.serverInfo).toBeDefined();
            expect(response.result.serverInfo.name).toBe('omni-mcp-hub');
            expect(response.result.serverInfo.version).toBe('1.0.0');
        });
    });
    describe('Tool Schema Validation', () => {
        test('should return tools with proper schema', async () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.result.tools).toBeDefined();
            expect(response.result.tools.length).toBeGreaterThan(0);
            const builtInTool = response.result.tools.find((t) => t.name === 'list_sources');
            expect(builtInTool).toBeDefined();
            expect(builtInTool.name).toBe('list_sources');
            expect(builtInTool.description).toBeDefined();
            expect(builtInTool.inputSchema).toBeDefined();
            expect(builtInTool.inputSchema.type).toBe('object');
            const mcpTool = response.result.tools.find((t) => t.name === 'test-server__search');
            expect(mcpTool).toBeDefined();
            expect(mcpTool.input_schema).toBeDefined();
            expect(mcpTool.input_schema.type).toBe('object');
        });
        test('should handle tools without schemas gracefully', async () => {
            mockServerManager.getAllTools.mockResolvedValueOnce([
                {
                    name: 'test-server__minimal',
                    _server: 'test-server',
                    _originalName: 'minimal'
                }
            ]);
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
            };
            const response = await handler.handleMessage(request);
            expect(response.result.tools).toBeDefined();
            expect(response.result.tools.length).toBeGreaterThan(4);
            const mcpTool = response.result.tools.find((t) => t.name === 'test-server__minimal');
            expect(mcpTool).toBeDefined();
            expect(mcpTool.name).toBe('test-server__minimal');
        });
    });
    describe('State Management', () => {
        test('should not track initialization state', async () => {
            let request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
            };
            let response = await handler.handleMessage(request);
            expect(response.error).toBeUndefined();
            expect(response.result).toBeDefined();
            expect(response.result.tools).toBeDefined();
            await handler.handleMessage({
                jsonrpc: '2.0',
                id: 2,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            });
            request = {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/list',
                params: {}
            };
            response = await handler.handleMessage(request);
            expect(response.error).toBeUndefined();
            expect(response.result).toBeDefined();
        });
        test('should allow multiple initialization calls', async () => {
            const initRequest = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            };
            const response1 = await handler.handleMessage(initRequest);
            expect(response1.error).toBeUndefined();
            const response2 = await handler.handleMessage({
                ...initRequest,
                id: 2
            });
            expect(response2.error).toBeUndefined();
        });
    });
    describe('Concurrency and Performance', () => {
        test('should handle multiple concurrent requests', async () => {
            const requests = Array.from({ length: 10 }, (_, i) => ({
                jsonrpc: '2.0',
                id: i + 1,
                method: 'ping',
                params: {}
            }));
            const responses = await Promise.all(requests.map(req => handler.handleMessage(req)));
            expect(responses).toHaveLength(10);
            responses.forEach((response, index) => {
                expect(response.id).toBe(index + 1);
                expect(response.error).toBeUndefined();
                expect(response.result).toEqual({});
            });
        });
        test('should handle rapid tool calls', async () => {
            const toolCalls = Array.from({ length: 5 }, (_, i) => ({
                jsonrpc: '2.0',
                id: i + 1,
                method: 'tools/call',
                params: {
                    name: 'test-server__search',
                    arguments: { query: `query-${i}` }
                }
            }));
            const responses = await Promise.all(toolCalls.map(req => handler.handleMessage(req)));
            expect(responses).toHaveLength(5);
            expect(mockServerManager.callTool).toHaveBeenCalledTimes(5);
            responses.forEach((response) => {
                expect(response.error).toBeUndefined();
                expect(response.result).toBeDefined();
            });
        });
    });
});
