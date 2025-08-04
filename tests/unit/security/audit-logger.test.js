"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const audit_logger_1 = require("../../../src/security/audit-logger");
const fs = __importStar(require("fs"));
jest.mock('fs');
describe('AuditLogger', () => {
    let auditLogger;
    let mockFs;
    beforeEach(() => {
        audit_logger_1.AuditLogger.instance = null;
        mockFs = fs;
        jest.spyOn(mockFs, 'existsSync').mockImplementation(() => true);
        jest.spyOn(mockFs, 'mkdirSync').mockImplementation(() => undefined);
        jest.spyOn(mockFs, 'appendFileSync').mockImplementation(() => undefined);
        jest.spyOn(mockFs, 'statSync').mockImplementation(() => ({ size: 1000 }));
        jest.spyOn(mockFs, 'renameSync').mockImplementation(() => undefined);
        jest.spyOn(mockFs, 'unlinkSync').mockImplementation(() => undefined);
        jest.spyOn(mockFs, 'readFileSync').mockImplementation(() => '');
        auditLogger = audit_logger_1.AuditLogger.getInstance();
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('Singleton Pattern', () => {
        test('should return same instance', () => {
            const instance1 = audit_logger_1.AuditLogger.getInstance();
            const instance2 = audit_logger_1.AuditLogger.getInstance();
            expect(instance1).toBe(instance2);
        });
        test('should create log directory if it does not exist', () => {
            audit_logger_1.AuditLogger.instance = null;
            jest.spyOn(mockFs, 'existsSync').mockReturnValue(false);
            audit_logger_1.AuditLogger.getInstance();
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs'), { recursive: true });
        });
    });
    describe('Log Writing', () => {
        beforeEach(() => {
            jest.spyOn(mockFs, 'existsSync').mockReturnValue(true);
            jest.spyOn(mockFs, 'statSync').mockReturnValue({ size: 1000 });
        });
        test('should log validation attempts', () => {
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test',
                requestId: 'req-123'
            };
            auditLogger.logValidationAttempt(execution);
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"event":"COMMAND_VALIDATION_ATTEMPT"'), 'utf8');
        });
        test('should log validation success', () => {
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test',
                requestId: 'req-123'
            };
            auditLogger.logValidationSuccess(execution);
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"event":"COMMAND_VALIDATION_SUCCESS"'), 'utf8');
        });
        test('should log security violations', () => {
            const execution = {
                command: 'rm',
                args: ['-rf', '/'],
                source: 'test',
                requestId: 'req-123'
            };
            auditLogger.logSecurityViolation(execution, 'Blocked dangerous command');
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"level":"SECURITY"'), 'utf8');
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('Blocked dangerous command'), 'utf8');
        });
        test('should log command execution', () => {
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test',
                requestId: 'req-123'
            };
            auditLogger.logCommandExecution(execution, 12345);
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"event":"COMMAND_EXECUTED"'), 'utf8');
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"pid":12345'), 'utf8');
        });
        test('should log command failures', () => {
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test',
                requestId: 'req-123'
            };
            auditLogger.logCommandFailure(execution, 'Process spawn failed');
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"level":"ERROR"'), 'utf8');
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('Process spawn failed'), 'utf8');
        });
        test('should log configuration validation', () => {
            const config = {
                name: 'test-server',
                command: 'python',
                enabled: true
            };
            auditLogger.logConfigurationValidation(config, true);
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"event":"CONFIGURATION_VALIDATION"'), 'utf8');
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('test-server'), 'utf8');
        });
        test('should log policy updates', () => {
            const changes = {
                maxArguments: 100,
                sandboxEnabled: false
            };
            auditLogger.logPolicyUpdate(changes);
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"event":"SECURITY_POLICY_UPDATE"'), 'utf8');
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"maxArguments":100'), 'utf8');
        });
        test('should log suspicious activity', () => {
            const activity = 'Multiple failed validation attempts';
            const metadata = {
                attempts: 5,
                timespan: '60s'
            };
            auditLogger.logSuspiciousActivity(activity, metadata);
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('"level":"SECURITY"'), 'utf8');
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('security-audit.log'), expect.stringContaining('Multiple failed validation attempts'), 'utf8');
        });
        test('should handle write errors gracefully', () => {
            mockFs.appendFileSync.mockImplementation(() => {
                throw new Error('Disk full');
            });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test'
            };
            expect(() => {
                auditLogger.logValidationAttempt(execution);
            }).not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith('Failed to write audit log:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
    describe('Log Rotation', () => {
        test('should rotate logs when size limit exceeded', () => {
            mockFs.existsSync.mockReturnValue(true);
            jest.spyOn(mockFs, 'statSync').mockReturnValue({ size: 15 * 1024 * 1024 });
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test'
            };
            auditLogger.logValidationAttempt(execution);
            expect(mockFs.renameSync).toHaveBeenCalled();
        });
        test('should delete oldest log files during rotation', () => {
            jest.spyOn(mockFs, 'existsSync').mockImplementation((path) => {
                const pathStr = path.toString();
                return pathStr.includes('security-audit.log') && !pathStr.includes('.log.5');
            });
            jest.spyOn(mockFs, 'statSync').mockReturnValue({ size: 15 * 1024 * 1024 });
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test'
            };
            auditLogger.logValidationAttempt(execution);
            expect(mockFs.unlinkSync).toHaveBeenCalled();
        });
        test('should handle rotation errors gracefully', () => {
            mockFs.existsSync.mockReturnValue(true);
            jest.spyOn(mockFs, 'statSync').mockReturnValue({ size: 15 * 1024 * 1024 });
            mockFs.renameSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const execution = {
                command: 'python',
                args: ['-V'],
                source: 'test'
            };
            expect(() => {
                auditLogger.logValidationAttempt(execution);
            }).not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith('Failed to rotate audit log:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
    describe('Log Reading', () => {
        test('should read recent logs', () => {
            const mockLogContent = [
                JSON.stringify({
                    timestamp: '2024-01-01T12:00:00.000Z',
                    level: 'INFO',
                    event: 'COMMAND_VALIDATION_ATTEMPT',
                    message: 'Test message 1'
                }),
                JSON.stringify({
                    timestamp: '2024-01-01T12:01:00.000Z',
                    level: 'SECURITY',
                    event: 'SECURITY_VIOLATION',
                    message: 'Test message 2'
                })
            ].join('\n');
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(mockLogContent);
            const logs = auditLogger.getRecentLogs(10);
            expect(logs).toHaveLength(2);
            expect(logs[0].event).toBe('COMMAND_VALIDATION_ATTEMPT');
            expect(logs[1].event).toBe('SECURITY_VIOLATION');
        });
        test('should limit number of returned logs', () => {
            const mockLogContent = Array.from({ length: 50 }, (_, i) => JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'INFO',
                event: 'TEST_EVENT',
                message: `Test message ${i}`
            })).join('\n');
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(mockLogContent);
            const logs = auditLogger.getRecentLogs(10);
            expect(logs).toHaveLength(10);
        });
        test('should handle malformed log lines gracefully', () => {
            const mockLogContent = [
                JSON.stringify({ valid: 'log', event: 'VALID' }),
                'invalid json line',
                JSON.stringify({ another: 'valid', event: 'VALID2' })
            ].join('\n');
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(mockLogContent);
            const logs = auditLogger.getRecentLogs(10);
            expect(logs).toHaveLength(3);
            expect(logs[0].event).toBe('VALID');
            expect(logs[1].event).toBe('LOG_PARSE_ERROR');
            expect(logs[2].event).toBe('VALID2');
        });
        test('should return empty array when log file does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);
            const logs = auditLogger.getRecentLogs();
            expect(logs).toEqual([]);
        });
        test('should handle read errors gracefully', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const logs = auditLogger.getRecentLogs();
            expect(logs).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith('Failed to read audit logs:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
    describe('Security Violation Filtering', () => {
        test('should filter security violations by time', () => {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
            const mockLogContent = [
                JSON.stringify({
                    timestamp: twoHoursAgo.toISOString(),
                    level: 'SECURITY',
                    event: 'SECURITY_VIOLATION',
                    message: 'Old violation'
                }),
                JSON.stringify({
                    timestamp: oneHourAgo.toISOString(),
                    level: 'SECURITY',
                    event: 'SECURITY_VIOLATION',
                    message: 'Recent violation'
                }),
                JSON.stringify({
                    timestamp: oneHourAgo.toISOString(),
                    level: 'INFO',
                    event: 'COMMAND_EXECUTED',
                    message: 'Normal log'
                })
            ].join('\n');
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(mockLogContent);
            const violations = auditLogger.getSecurityViolations(1);
            expect(violations).toHaveLength(1);
            expect(violations[0].message).toBe('Recent violation');
        });
        test('should only return security-level logs', () => {
            const now = new Date();
            const mockLogContent = [
                JSON.stringify({
                    timestamp: now.toISOString(),
                    level: 'INFO',
                    event: 'COMMAND_EXECUTED',
                    message: 'Normal log'
                }),
                JSON.stringify({
                    timestamp: now.toISOString(),
                    level: 'SECURITY',
                    event: 'SECURITY_VIOLATION',
                    message: 'Security violation'
                }),
                JSON.stringify({
                    timestamp: now.toISOString(),
                    level: 'ERROR',
                    event: 'COMMAND_FAILED',
                    message: 'Command failed'
                })
            ].join('\n');
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(mockLogContent);
            const violations = auditLogger.getSecurityViolations(24);
            expect(violations).toHaveLength(1);
            expect(violations[0].level).toBe('SECURITY');
        });
    });
});
