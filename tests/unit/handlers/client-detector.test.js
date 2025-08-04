"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_detector_1 = require("../../../src/handlers/client-detector");
const client_types_1 = require("../../../src/types/client-types");
describe('ClientTypeDetector', () => {
    let detector;
    beforeEach(() => {
        detector = new client_detector_1.ClientTypeDetector();
    });
    describe('constructor', () => {
        it('should initialize with default rules', () => {
            const rules = detector.getRules();
            expect(rules.length).toBeGreaterThan(0);
        });
        it('should initialize with custom rules', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        userAgent: ['custom-agent']
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
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
            };
            const result = detector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should detect by multiple conditions', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
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
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {
                    'user-agent': 'Claude/1.0',
                    'x-client-type': 'mcp',
                    'content-type': 'application/json'
                },
                path: '/mcp/test',
                url: '/mcp/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should return UNKNOWN for unmatched requests', () => {
            const req = {
                headers: {
                    'user-agent': 'Unknown/1.0'
                },
                path: '/unknown',
                url: '/unknown'
            };
            const result = detector.detect(req);
            expect(result).toBe(client_types_1.ClientType.UNKNOWN);
        });
        it('should handle missing user agent', () => {
            const req = {
                headers: {},
                path: '/test',
                url: '/test'
            };
            const result = detector.detect(req);
            expect(result).toBe(client_types_1.ClientType.UNKNOWN);
        });
        it('should be case insensitive for user agent matching', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        userAgent: ['CLAUDE']
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {
                    'user-agent': 'claude/1.0'
                },
                path: '/test',
                url: '/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should be case insensitive for content type matching', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        contentType: ['APPLICATION/JSON']
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {
                    'content-type': 'application/json; charset=utf-8'
                },
                path: '/test',
                url: '/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should match path prefixes', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        path: ['/api/mcp']
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {},
                path: '/api/mcp/tools',
                url: '/api/mcp/tools'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should handle headers with case insensitive keys', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        headers: {
                            'X-Client-Type': 'mcp'
                        }
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {
                    'x-client-type': 'mcp'
                },
                path: '/test',
                url: '/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should fail if any condition does not match', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        userAgent: ['claude'],
                        headers: {
                            'x-client-type': 'mcp'
                        }
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {
                    'user-agent': 'claude/1.0',
                    'x-client-type': 'rest'
                },
                path: '/test',
                url: '/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.UNKNOWN);
        });
        it('should match first rule in order', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        userAgent: ['test-agent']
                    }
                },
                {
                    type: client_types_1.ClientType.CURSOR,
                    conditions: {
                        userAgent: ['test-agent']
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {
                    'user-agent': 'test-agent/1.0'
                },
                path: '/test',
                url: '/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
    });
    describe('addRule', () => {
        it('should add a new detection rule', () => {
            const initialCount = detector.getRules().length;
            const newRule = {
                type: client_types_1.ClientType.COPILOT,
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
            const newRule = {
                type: client_types_1.ClientType.COPILOT,
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
            };
            const result = detector.detect(req);
            expect(result).toBe(client_types_1.ClientType.COPILOT);
        });
    });
    describe('removeRule', () => {
        it('should remove rules of specified type', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: { userAgent: ['claude1'] }
                },
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: { userAgent: ['claude2'] }
                },
                {
                    type: client_types_1.ClientType.CURSOR,
                    conditions: { userAgent: ['cursor'] }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            customDetector.removeRule(client_types_1.ClientType.CLAUDE);
            const rules = customDetector.getRules();
            expect(rules.length).toBe(1);
            expect(rules[0].type).toBe(client_types_1.ClientType.CURSOR);
        });
        it('should not affect detection after removing rules', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: { userAgent: ['claude'] }
                },
                {
                    type: client_types_1.ClientType.CURSOR,
                    conditions: { userAgent: ['cursor'] }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            customDetector.removeRule(client_types_1.ClientType.CLAUDE);
            const req = {
                headers: {
                    'user-agent': 'claude/1.0'
                },
                path: '/test',
                url: '/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.UNKNOWN);
        });
        it('should handle removing non-existent rule type', () => {
            const initialRules = detector.getRules();
            detector.removeRule(client_types_1.ClientType.UNKNOWN);
            const finalRules = detector.getRules();
            expect(finalRules).toEqual(initialRules);
        });
    });
    describe('getRules', () => {
        it('should return a copy of rules array', () => {
            const rules = detector.getRules();
            const originalLength = rules.length;
            rules.push({
                type: client_types_1.ClientType.UNKNOWN,
                conditions: {}
            });
            const rulesAgain = detector.getRules();
            expect(rulesAgain.length).toBe(originalLength);
        });
        it('should return current rules after modifications', () => {
            const initialRules = detector.getRules();
            const newRule = {
                type: client_types_1.ClientType.COPILOT,
                conditions: { userAgent: ['copilot'] }
            };
            detector.addRule(newRule);
            detector.removeRule(client_types_1.ClientType.CLAUDE);
            const finalRules = detector.getRules();
            expect(finalRules.length).toBe(initialRules.length);
            expect(finalRules.some(rule => rule.type === client_types_1.ClientType.COPILOT)).toBe(true);
            expect(finalRules.some(rule => rule.type === client_types_1.ClientType.CLAUDE)).toBe(false);
        });
    });
    describe('edge cases', () => {
        it('should handle empty conditions', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {}
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {},
                path: '/test',
                url: '/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should handle multiple user agents in condition', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        userAgent: ['claude', 'anthropic', 'assistant']
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {
                    'user-agent': 'anthropic/2.0'
                },
                path: '/test',
                url: '/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should handle multiple paths in condition', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        path: ['/api/mcp', '/api/claude', '/mcp']
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {},
                path: '/api/claude/test',
                url: '/api/claude/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
        it('should handle multiple content types in condition', () => {
            const customRules = [
                {
                    type: client_types_1.ClientType.CLAUDE,
                    conditions: {
                        contentType: ['application/json', 'application/jsonrpc', 'text/json']
                    }
                }
            ];
            const customDetector = new client_detector_1.ClientTypeDetector(customRules);
            const req = {
                headers: {
                    'content-type': 'application/jsonrpc+json'
                },
                path: '/test',
                url: '/test'
            };
            const result = customDetector.detect(req);
            expect(result).toBe(client_types_1.ClientType.CLAUDE);
        });
    });
});
