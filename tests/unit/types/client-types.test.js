"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_types_1 = require("../../../src/types/client-types");
describe('ClientType', () => {
    describe('Enum Values', () => {
        it('should have correct enum values', () => {
            expect(client_types_1.ClientType.CLAUDE).toBe('claude');
            expect(client_types_1.ClientType.CURSOR).toBe('cursor');
            expect(client_types_1.ClientType.COPILOT).toBe('copilot');
            expect(client_types_1.ClientType.CHATGPT).toBe('chatgpt');
            expect(client_types_1.ClientType.REST).toBe('rest');
            expect(client_types_1.ClientType.UNKNOWN).toBe('unknown');
        });
        it('should have all expected client types', () => {
            const expectedTypes = ['claude', 'cursor', 'copilot', 'chatgpt', 'rest', 'unknown'];
            const actualTypes = Object.values(client_types_1.ClientType).filter(value => typeof value === 'string');
            expect(actualTypes).toEqual(expect.arrayContaining(expectedTypes));
            expect(actualTypes).toHaveLength(expectedTypes.length);
        });
    });
    describe('getProtocol method', () => {
        it('should return MCP for Claude', () => {
            expect(client_types_1.ClientType.getProtocol(client_types_1.ClientType.CLAUDE)).toBe(client_types_1.ProtocolType.MCP);
        });
        it('should return LSP for Cursor', () => {
            expect(client_types_1.ClientType.getProtocol(client_types_1.ClientType.CURSOR)).toBe(client_types_1.ProtocolType.LSP);
        });
        it('should return LSP for Copilot', () => {
            expect(client_types_1.ClientType.getProtocol(client_types_1.ClientType.COPILOT)).toBe(client_types_1.ProtocolType.LSP);
        });
        it('should return REST for ChatGPT', () => {
            expect(client_types_1.ClientType.getProtocol(client_types_1.ClientType.CHATGPT)).toBe(client_types_1.ProtocolType.REST);
        });
        it('should return REST for REST client', () => {
            expect(client_types_1.ClientType.getProtocol(client_types_1.ClientType.REST)).toBe(client_types_1.ProtocolType.REST);
        });
        it('should return REST for unknown client', () => {
            expect(client_types_1.ClientType.getProtocol(client_types_1.ClientType.UNKNOWN)).toBe(client_types_1.ProtocolType.REST);
        });
        it('should handle all client types', () => {
            const clientTypes = [
                client_types_1.ClientType.CLAUDE,
                client_types_1.ClientType.CURSOR,
                client_types_1.ClientType.COPILOT,
                client_types_1.ClientType.CHATGPT,
                client_types_1.ClientType.REST,
                client_types_1.ClientType.UNKNOWN
            ];
            clientTypes.forEach(clientType => {
                expect(() => client_types_1.ClientType.getProtocol(clientType)).not.toThrow();
            });
        });
    });
});
describe('ProtocolType', () => {
    describe('Enum Values', () => {
        it('should have correct enum values', () => {
            expect(client_types_1.ProtocolType.MCP).toBe('mcp');
            expect(client_types_1.ProtocolType.LSP).toBe('lsp');
            expect(client_types_1.ProtocolType.REST).toBe('rest');
            expect(client_types_1.ProtocolType.WEBSOCKET).toBe('websocket');
        });
        it('should have all expected protocol types', () => {
            const expectedTypes = ['mcp', 'lsp', 'rest', 'websocket'];
            const actualTypes = Object.values(client_types_1.ProtocolType);
            expect(actualTypes).toEqual(expect.arrayContaining(expectedTypes));
            expect(actualTypes).toHaveLength(expectedTypes.length);
        });
    });
});
describe('CLIENT_DETECTION_RULES', () => {
    it('should be an array of detection rules', () => {
        expect(Array.isArray(client_types_1.CLIENT_DETECTION_RULES)).toBe(true);
        expect(client_types_1.CLIENT_DETECTION_RULES.length).toBeGreaterThan(0);
    });
    it('should have a rule for each major client type except UNKNOWN', () => {
        const rulesClientTypes = client_types_1.CLIENT_DETECTION_RULES.map(rule => rule.type);
        expect(rulesClientTypes).toContain(client_types_1.ClientType.CLAUDE);
        expect(rulesClientTypes).toContain(client_types_1.ClientType.CURSOR);
        expect(rulesClientTypes).toContain(client_types_1.ClientType.COPILOT);
        expect(rulesClientTypes).toContain(client_types_1.ClientType.CHATGPT);
        expect(rulesClientTypes).toContain(client_types_1.ClientType.REST);
        expect(rulesClientTypes).not.toContain(client_types_1.ClientType.UNKNOWN);
    });
    describe('Claude detection rule', () => {
        const claudeRule = client_types_1.CLIENT_DETECTION_RULES.find(rule => rule.type === client_types_1.ClientType.CLAUDE);
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
        const cursorRule = client_types_1.CLIENT_DETECTION_RULES.find(rule => rule.type === client_types_1.ClientType.CURSOR);
        it('should exist', () => {
            expect(cursorRule).toBeDefined();
        });
        it('should have correct conditions', () => {
            expect(cursorRule?.conditions.userAgent).toContain('cursor');
            expect(cursorRule?.conditions.headers).toEqual({ 'x-lsp-client': 'cursor' });
        });
    });
    describe('Copilot detection rule', () => {
        const copilotRule = client_types_1.CLIENT_DETECTION_RULES.find(rule => rule.type === client_types_1.ClientType.COPILOT);
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
        const chatgptRule = client_types_1.CLIENT_DETECTION_RULES.find(rule => rule.type === client_types_1.ClientType.CHATGPT);
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
        const restRule = client_types_1.CLIENT_DETECTION_RULES.find(rule => rule.type === client_types_1.ClientType.REST);
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
        client_types_1.CLIENT_DETECTION_RULES.forEach(rule => {
            expect(rule).toHaveProperty('type');
            expect(rule).toHaveProperty('conditions');
            expect(Object.values(client_types_1.ClientType)).toContain(rule.type);
            expect(typeof rule.conditions).toBe('object');
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
        const customRule = {
            type: client_types_1.ClientType.UNKNOWN,
            conditions: {
                userAgent: ['custom-client'],
                headers: { 'x-custom': 'true' },
                path: ['/custom'],
                contentType: ['application/custom']
            }
        };
        expect(customRule.type).toBe(client_types_1.ClientType.UNKNOWN);
        expect(customRule.conditions.userAgent).toContain('custom-client');
        expect(customRule.conditions.headers?.['x-custom']).toBe('true');
        expect(customRule.conditions.path).toContain('/custom');
        expect(customRule.conditions.contentType).toContain('application/custom');
    });
    it('should allow partial conditions', () => {
        const partialRule = {
            type: client_types_1.ClientType.UNKNOWN,
            conditions: {
                userAgent: ['test-agent']
            }
        };
        expect(partialRule.type).toBe(client_types_1.ClientType.UNKNOWN);
        expect(partialRule.conditions.userAgent).toContain('test-agent');
        expect(partialRule.conditions.headers).toBeUndefined();
    });
});
