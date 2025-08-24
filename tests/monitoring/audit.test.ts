import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger, audit, setAuditLogger } from '../../src/monitoring/audit.js';
import { ILogger } from '../../src/utils/logger.js';

describe('Audit Logging', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    vi.clearAllMocks();
  });

  describe('AuditLogger', () => {
    it('should log applied events', () => {
      const auditLogger = new AuditLogger(mockLogger);
      
      auditLogger.logApplied({
        actor: 'test-user',
        profile: 'test-profile',
        hash: 'abcd1234',
        durationMs: 150,
        sourcePath: '/test/profile.md'
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('"result":"applied"')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('"actor":"test-user"')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('"profile":"test-profile"')
      );
    });

    it('should log noop events', () => {
      const auditLogger = new AuditLogger(mockLogger);
      
      auditLogger.logNoop({
        actor: 'test-user',
        profile: 'test-profile',
        hash: 'abcd1234',
        durationMs: 5
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('"result":"noop"')
      );
    });

    it('should log rolled back events as errors', () => {
      const auditLogger = new AuditLogger(mockLogger);
      
      auditLogger.logRolledBack({
        actor: 'test-user',
        profile: 'test-profile',
        hash: 'abcd1234',
        durationMs: 200,
        error: 'Generation failed'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('"result":"rolled_back"')
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('"error":"Generation failed"')
      );
    });

    it('should log general errors', () => {
      const auditLogger = new AuditLogger(mockLogger);
      
      auditLogger.logError({
        actor: 'test-user',
        profile: 'test-profile',
        hash: 'unknown',
        durationMs: 50,
        error: 'File not found'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('"result":"error"')
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('"error":"File not found"')
      );
    });

    it('should include all required fields in JSON', () => {
      const auditLogger = new AuditLogger(mockLogger);
      
      auditLogger.logApplied({
        actor: 'test-user',
        profile: 'test-profile',
        hash: 'abcd1234',
        durationMs: 150,
        metadata: { test: 'value' }
      });

      const logCall = vi.mocked(mockLogger.info).mock.calls[0][0];
      const logData = JSON.parse(logCall);

      expect(logData).toHaveProperty('level', 'info');
      expect(logData).toHaveProperty('component', 'profile-apply');
      expect(logData.event).toHaveProperty('ts');
      expect(logData.event).toHaveProperty('actor', 'test-user');
      expect(logData.event).toHaveProperty('profile', 'test-profile');
      expect(logData.event).toHaveProperty('hash', 'abcd1234');
      expect(logData.event).toHaveProperty('result', 'applied');
      expect(logData.event).toHaveProperty('durationMs', 150);
      expect(logData.event.metadata).toEqual({ test: 'value' });
    });

    it('should generate valid ISO timestamps', () => {
      const auditLogger = new AuditLogger(mockLogger);
      
      auditLogger.logApplied({
        actor: 'test-user',
        profile: 'test-profile',
        hash: 'abcd1234',
        durationMs: 150
      });

      const logCall = vi.mocked(mockLogger.info).mock.calls[0][0];
      const logData = JSON.parse(logCall);
      const timestamp = logData.event.ts;

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('should create event base structure correctly', () => {
      const auditLogger = new AuditLogger(mockLogger);
      
      const event = auditLogger.createEvent(
        'test-actor',
        'test-profile',
        'test-hash',
        100,
        { sourcePath: '/test/path', metadata: { extra: 'data' } }
      );

      expect(event).toEqual({
        actor: 'test-actor',
        profile: 'test-profile',
        hash: 'test-hash',
        durationMs: 100,
        sourcePath: '/test/path',
        metadata: { extra: 'data' }
      });
    });
  });

  describe('Global audit instance', () => {
    it('should use global audit instance', () => {
      setAuditLogger(mockLogger);
      
      audit.logApplied({
        actor: 'global-user',
        profile: 'global-profile',
        hash: 'global-hash',
        durationMs: 75
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('"actor":"global-user"')
      );
    });

    it('should handle silent logger by default', () => {
      // Should not throw when using default silent logger
      audit.logApplied({
        actor: 'silent-user',
        profile: 'silent-profile',
        hash: 'silent-hash',
        durationMs: 25
      });
    });
  });

  describe('JSON structure validation', () => {
    it('should produce valid JSON for all log types', () => {
      const auditLogger = new AuditLogger(mockLogger);
      
      const testCases = [
        () => auditLogger.logApplied({
          actor: 'user', profile: 'profile', hash: 'hash', durationMs: 100
        }),
        () => auditLogger.logNoop({
          actor: 'user', profile: 'profile', hash: 'hash', durationMs: 100
        }),
        () => auditLogger.logRolledBack({
          actor: 'user', profile: 'profile', hash: 'hash', durationMs: 100, error: 'test error'
        }),
        () => auditLogger.logError({
          actor: 'user', profile: 'profile', hash: 'hash', durationMs: 100, error: 'test error'
        })
      ];

      testCases.forEach((testCase, index) => {
        testCase();
        
        const calls = [...vi.mocked(mockLogger.info).mock.calls, ...vi.mocked(mockLogger.error).mock.calls];
        const logCall = calls[calls.length - 1][0];
        
        expect(() => JSON.parse(logCall)).not.toThrow(`Test case ${index} should produce valid JSON`);
      });
    });

    it('should handle special characters in strings', () => {
      const auditLogger = new AuditLogger(mockLogger);
      
      auditLogger.logError({
        actor: 'user with "quotes"',
        profile: 'profile\nwith\nnewlines',
        hash: 'hash\\with\\backslashes',
        durationMs: 100,
        error: 'Error with\ttabs and 🚨 emoji'
      });

      const logCall = vi.mocked(mockLogger.error).mock.calls[0][0];
      expect(() => JSON.parse(logCall)).not.toThrow();
      
      const logData = JSON.parse(logCall);
      expect(logData.event.actor).toBe('user with "quotes"');
      expect(logData.event.profile).toBe('profile\nwith\nnewlines');
      expect(logData.event.error).toBe('Error with\ttabs and 🚨 emoji');
    });
  });
});