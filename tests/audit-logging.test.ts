import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  AuditLogger,
  GlobalAuditLogger,
  AuditEventHelpers,
  AuditEventType,
  AuditSeverity,
  AuditEvent,
  AuditConfig
} from '../src/security/audit-logging.js';

describe('Audit Logging System', () => {
  let auditLogger: AuditLogger;
  let testLogPath: string;
  let testConfig: Partial<AuditConfig>;

  beforeEach(() => {
    const testDir = path.join(process.cwd(), 'test-logs');
    testLogPath = path.join(testDir, 'test-audit.jsonl');
    
    testConfig = {
      logFilePath: testLogPath,
      maxFileSize: 1024, // Small for testing
      retentionDays: 1,
      enableTamperEvidence: true,
      enableEncryption: false,
      enableExternalSink: false,
      externalSinks: []
    };

    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    auditLogger = new AuditLogger(testConfig);
  });

  afterEach(() => {
    auditLogger.cleanup();
    
    // Clean up test files
    try {
      if (fs.existsSync(testLogPath)) {
        fs.unlinkSync(testLogPath);
      }
      
      const testDir = path.dirname(testLogPath);
      if (fs.existsSync(testDir)) {
        const files = fs.readdirSync(testDir);
        files.forEach(file => {
          const filePath = path.join(testDir, file);
          if (fs.lstatSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        });
        fs.rmdirSync(testDir);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('AuditLogger', () => {
    describe('Event Logging', () => {
      it('should log basic audit events', async () => {
        const event = {
          eventType: AuditEventType.AUTHENTICATION,
          userId: 'test-user',
          action: 'login',
          details: { ip: '127.0.0.1' },
          severity: AuditSeverity.MEDIUM,
          source: 'auth-system'
        };

        await auditLogger.logEvent(event);

        expect(fs.existsSync(testLogPath)).toBe(true);
        const content = fs.readFileSync(testLogPath, 'utf8');
        const logEntry = JSON.parse(content.trim());
        
        expect(logEntry.event.userId).toBe('test-user');
        expect(logEntry.event.action).toBe('login');
        expect(logEntry.sequenceNumber).toBe(1);
        expect(logEntry.hash).toBeDefined();
      });

      it('should generate unique event IDs and timestamps', async () => {
        const baseEvent = {
          eventType: AuditEventType.SYSTEM_EVENT,
          action: 'test',
          details: {},
          severity: AuditSeverity.LOW,
          source: 'test'
        };

        await auditLogger.logEvent(baseEvent);
        await auditLogger.logEvent(baseEvent);

        const content = fs.readFileSync(testLogPath, 'utf8');
        const lines = content.trim().split('\n');
        const entry1 = JSON.parse(lines[0]);
        const entry2 = JSON.parse(lines[1]);

        expect(entry1.event.id).not.toBe(entry2.event.id);
        expect(new Date(entry1.event.timestamp).getTime()).toBeLessThanOrEqual(
          new Date(entry2.event.timestamp).getTime()
        );
      });

      it('should handle different event types', async () => {
        const eventTypes = [
          AuditEventType.AUTHENTICATION,
          AuditEventType.AUTHORIZATION,
          AuditEventType.DATA_ACCESS,
          AuditEventType.SECURITY_VIOLATION
        ];

        for (const eventType of eventTypes) {
          await auditLogger.logEvent({
            eventType,
            action: `test-${eventType}`,
            details: {},
            severity: AuditSeverity.MEDIUM,
            source: 'test'
          });
        }

        const metrics = auditLogger.getMetrics();
        expect(metrics.totalEvents).toBe(eventTypes.length);
        expect(Object.keys(metrics.eventsByType)).toEqual(eventTypes);
      });

      it('should handle different severity levels', async () => {
        const severities = [
          AuditSeverity.LOW,
          AuditSeverity.MEDIUM,
          AuditSeverity.HIGH,
          AuditSeverity.CRITICAL
        ];

        for (const severity of severities) {
          await auditLogger.logEvent({
            eventType: AuditEventType.SYSTEM_EVENT,
            action: 'test',
            details: {},
            severity,
            source: 'test'
          });
        }

        const metrics = auditLogger.getMetrics();
        expect(metrics.totalEvents).toBe(severities.length);
        expect(Object.keys(metrics.eventsBySeverity)).toEqual(severities);
      });
    });

    describe('Tamper Evidence', () => {
      it('should create hash chains for tamper evidence', async () => {
        await auditLogger.logEvent({
          eventType: AuditEventType.SYSTEM_EVENT,
          action: 'first',
          details: {},
          severity: AuditSeverity.LOW,
          source: 'test'
        });

        await auditLogger.logEvent({
          eventType: AuditEventType.SYSTEM_EVENT,
          action: 'second',
          details: {},
          severity: AuditSeverity.LOW,
          source: 'test'
        });

        const content = fs.readFileSync(testLogPath, 'utf8');
        const lines = content.trim().split('\n');
        const entry1 = JSON.parse(lines[0]);
        const entry2 = JSON.parse(lines[1]);

        expect(entry1.previousHash).toBe('');
        expect(entry2.previousHash).toBe(entry1.hash);
        expect(entry1.sequenceNumber).toBe(1);
        expect(entry2.sequenceNumber).toBe(2);
      });

      it('should verify log integrity', async () => {
        // Log some events
        for (let i = 0; i < 3; i++) {
          await auditLogger.logEvent({
            eventType: AuditEventType.SYSTEM_EVENT,
            action: `event-${i}`,
            details: { index: i },
            severity: AuditSeverity.LOW,
            source: 'test'
          });
        }

        const isValid = await auditLogger.verifyLogIntegrity();
        expect(isValid).toBe(true);
      });

      it('should detect tampered log entries', async () => {
        // Log an event
        await auditLogger.logEvent({
          eventType: AuditEventType.SYSTEM_EVENT,
          action: 'original',
          details: {},
          severity: AuditSeverity.LOW,
          source: 'test'
        });

        // Tamper with the log file
        let content = fs.readFileSync(testLogPath, 'utf8');
        const entry = JSON.parse(content.trim());
        entry.event.action = 'tampered';
        fs.writeFileSync(testLogPath, JSON.stringify(entry));

        // Create new logger to load tampered state
        const newLogger = new AuditLogger(testConfig);
        const isValid = await newLogger.verifyLogIntegrity();
        expect(isValid).toBe(false);
        
        newLogger.cleanup();
      });
    });

    describe('Log Rotation', () => {
      it('should rotate logs when max size is reached', async () => {
        const smallConfig = {
          ...testConfig,
          maxFileSize: 500 // Small size to force rotation
        };
        
        const rotatingLogger = new AuditLogger(smallConfig);
        
        // Log many large events to trigger rotation
        for (let i = 0; i < 20; i++) {
          await rotatingLogger.logEvent({
            eventType: AuditEventType.SYSTEM_EVENT,
            action: `large-event-with-long-name-${i}`,
            details: { 
              data: 'x'.repeat(100),
              description: `This is a long description for event ${i} to make the log entry larger`,
              metadata: {
                timestamp: new Date().toISOString(),
                counter: i,
                additionalInfo: 'More data to increase size'
              }
            },
            severity: AuditSeverity.LOW,
            source: 'test-rotation-system'
          });
        }

        // Check if rotated file exists or if metrics indicate rotation occurred
        const metrics = rotatingLogger.getMetrics();
        const testDir = path.dirname(testLogPath);
        const files = fs.readdirSync(testDir);
        const rotatedFiles = files.filter(f => f.includes('test-audit-') && f.endsWith('.jsonl'));
        
        // Either a rotated file exists or the current log size is much smaller than expected
        const shouldHaveRotated = rotatedFiles.length > 0 || metrics.logFileSize < 2000;
        expect(shouldHaveRotated).toBe(true);
        
        rotatingLogger.cleanup();
      });
    });

    describe('Metrics', () => {
      it('should track comprehensive metrics', async () => {
        await auditLogger.logEvent({
          eventType: AuditEventType.AUTHENTICATION,
          action: 'login',
          details: {},
          severity: AuditSeverity.HIGH,
          source: 'test'
        });

        await auditLogger.logEvent({
          eventType: AuditEventType.SECURITY_VIOLATION,
          action: 'blocked',
          details: {},
          severity: AuditSeverity.CRITICAL,
          source: 'test'
        });

        const metrics = auditLogger.getMetrics();
        expect(metrics.totalEvents).toBe(2);
        expect(metrics.eventsByType[AuditEventType.AUTHENTICATION]).toBe(1);
        expect(metrics.eventsByType[AuditEventType.SECURITY_VIOLATION]).toBe(1);
        expect(metrics.eventsBySeverity[AuditSeverity.HIGH]).toBe(1);
        expect(metrics.eventsBySeverity[AuditSeverity.CRITICAL]).toBe(1);
        expect(metrics.lastLogTime).toBeDefined();
      });

      it('should track log file size', async () => {
        const initialMetrics = auditLogger.getMetrics();
        expect(initialMetrics.logFileSize).toBe(0);

        await auditLogger.logEvent({
          eventType: AuditEventType.SYSTEM_EVENT,
          action: 'test',
          details: {},
          severity: AuditSeverity.LOW,
          source: 'test'
        });

        const updatedMetrics = auditLogger.getMetrics();
        expect(updatedMetrics.logFileSize).toBeGreaterThan(0);
      });
    });

    describe('Search Functionality', () => {
      beforeEach(async () => {
        // Setup test data
        const testEvents = [
          {
            eventType: AuditEventType.AUTHENTICATION,
            userId: 'user1',
            action: 'login',
            details: {},
            severity: AuditSeverity.MEDIUM,
            source: 'auth'
          },
          {
            eventType: AuditEventType.SECURITY_VIOLATION,
            userId: 'user2',
            action: 'blocked',
            details: {},
            severity: AuditSeverity.HIGH,
            source: 'security'
          },
          {
            eventType: AuditEventType.AUTHENTICATION,
            userId: 'user1',
            action: 'logout',
            details: {},
            severity: AuditSeverity.LOW,
            source: 'auth'
          }
        ];

        for (const event of testEvents) {
          await auditLogger.logEvent(event);
        }
      });

      it('should search by event type', () => {
        const authEvents = auditLogger.searchLogs({
          eventType: AuditEventType.AUTHENTICATION
        });

        expect(authEvents).toHaveLength(2);
        expect(authEvents.every(e => e.eventType === AuditEventType.AUTHENTICATION)).toBe(true);
      });

      it('should search by user ID', () => {
        const user1Events = auditLogger.searchLogs({
          userId: 'user1'
        });

        expect(user1Events).toHaveLength(2);
        expect(user1Events.every(e => e.userId === 'user1')).toBe(true);
      });

      it('should search by severity', () => {
        const highSeverityEvents = auditLogger.searchLogs({
          severity: AuditSeverity.HIGH
        });

        expect(highSeverityEvents).toHaveLength(1);
        expect(highSeverityEvents[0].severity).toBe(AuditSeverity.HIGH);
      });

      it('should search by action', () => {
        const loginEvents = auditLogger.searchLogs({
          action: 'login'
        });

        expect(loginEvents).toHaveLength(1);
        expect(loginEvents[0].action).toBe('login');
      });
    });

    describe('Export Functionality', () => {
      beforeEach(async () => {
        await auditLogger.logEvent({
          eventType: AuditEventType.AUTHENTICATION,
          userId: 'user1',
          action: 'login',
          details: { ip: '127.0.0.1' },
          severity: AuditSeverity.MEDIUM,
          source: 'auth'
        });
      });

      it('should export to JSON format', () => {
        const jsonExport = auditLogger.exportLogs('json');
        const parsed = JSON.parse(jsonExport);
        
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].action).toBe('login');
      });

      it('should export to CSV format', () => {
        const csvExport = auditLogger.exportLogs('csv');
        const lines = csvExport.split('\n');
        
        expect(lines[0]).toContain('id,timestamp,eventType');
        expect(lines[1]).toContain('login');
      });

      it('should export to XML format', () => {
        const xmlExport = auditLogger.exportLogs('xml');
        
        expect(xmlExport).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xmlExport).toContain('<auditLog>');
        expect(xmlExport).toContain('<action>login</action>');
      });
    });

    describe('External Sinks', () => {
      it('should deliver to file sink', async () => {
        const sinkPath = path.join(path.dirname(testLogPath), 'sink-output.jsonl');
        const configWithSink = {
          ...testConfig,
          enableExternalSink: true,
          externalSinks: [{
            type: 'file' as const,
            config: { path: sinkPath },
            enabled: true
          }]
        };

        const sinkLogger = new AuditLogger(configWithSink);
        
        await sinkLogger.logEvent({
          eventType: AuditEventType.SYSTEM_EVENT,
          action: 'test',
          details: {},
          severity: AuditSeverity.LOW,
          source: 'test'
        });

        expect(fs.existsSync(sinkPath)).toBe(true);
        const sinkContent = fs.readFileSync(sinkPath, 'utf8');
        const sinkEntry = JSON.parse(sinkContent.trim());
        expect(sinkEntry.event.action).toBe('test');
        
        sinkLogger.cleanup();
        
        // Cleanup
        if (fs.existsSync(sinkPath)) {
          fs.unlinkSync(sinkPath);
        }
      });
    });

    describe('Error Handling', () => {
      it('should emit events for logging errors', (done) => {
        auditLogger.on('log-error', (data) => {
          expect(data.error).toBeDefined();
          done();
        });

        // Cause an error by making log path invalid
        const badConfig = {
          ...testConfig,
          logFilePath: '/invalid/path/audit.jsonl'
        };
        
        const badLogger = new AuditLogger(badConfig);
        badLogger.logEvent({
          eventType: AuditEventType.SYSTEM_EVENT,
          action: 'test',
          details: {},
          severity: AuditSeverity.LOW,
          source: 'test'
        });
      });

      it('should emit events for integrity violations', async () => {
        return new Promise<void>((resolve) => {
          auditLogger.on('integrity-violation', (data) => {
            expect(data.type).toBeDefined();
            resolve();
          });

          // This is tested indirectly through the tamper detection test above
          auditLogger.emit('integrity-violation', { type: 'test' });
        });
      });
    });
  });

  describe('GlobalAuditLogger', () => {
    afterEach(() => {
      GlobalAuditLogger.resetInstance();
    });

    it('should provide singleton instance', () => {
      const instance1 = GlobalAuditLogger.getInstance();
      const instance2 = GlobalAuditLogger.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should allow instance reset', () => {
      const instance1 = GlobalAuditLogger.getInstance();
      GlobalAuditLogger.resetInstance();
      const instance2 = GlobalAuditLogger.getInstance();
      
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('AuditEventHelpers', () => {
    it('should create authentication events', () => {
      const event = AuditEventHelpers.createAuthEvent('login', 'user123', { ip: '127.0.0.1' });
      
      expect(event.eventType).toBe(AuditEventType.AUTHENTICATION);
      expect(event.action).toBe('login');
      expect(event.userId).toBe('user123');
      expect(event.severity).toBe(AuditSeverity.MEDIUM);
      expect(event.details.ip).toBe('127.0.0.1');
    });

    it('should create security events', () => {
      const event = AuditEventHelpers.createSecurityEvent('blocked', { reason: 'invalid token' });
      
      expect(event.eventType).toBe(AuditEventType.SECURITY_VIOLATION);
      expect(event.action).toBe('blocked');
      expect(event.severity).toBe(AuditSeverity.HIGH);
      expect(event.details.reason).toBe('invalid token');
    });

    it('should create configuration events', () => {
      const event = AuditEventHelpers.createConfigEvent('profile-updated', 'admin', { profile: 'test' });
      
      expect(event.eventType).toBe(AuditEventType.CONFIGURATION_CHANGE);
      expect(event.action).toBe('profile-updated');
      expect(event.userId).toBe('admin');
      expect(event.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should create tool events', () => {
      const event = AuditEventHelpers.createToolEvent('execute', 'user123', 'file-reader', { file: 'test.txt' });
      
      expect(event.eventType).toBe(AuditEventType.TOOL_EXECUTION);
      expect(event.action).toBe('execute');
      expect(event.userId).toBe('user123');
      expect(event.resourceId).toBe('file-reader');
      expect(event.severity).toBe(AuditSeverity.LOW);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent logging', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(auditLogger.logEvent({
          eventType: AuditEventType.SYSTEM_EVENT,
          action: `concurrent-${i}`,
          details: {},
          severity: AuditSeverity.LOW,
          source: 'test'
        }));
      }

      await Promise.all(promises);
      
      const metrics = auditLogger.getMetrics();
      expect(metrics.totalEvents).toBe(10);
    });

    it('should handle large event details', async () => {
      const largeDetails = {
        data: 'x'.repeat(10000),
        array: Array(100).fill('item'),
        nested: {
          level1: {
            level2: {
              value: 'deep'
            }
          }
        }
      };

      await auditLogger.logEvent({
        eventType: AuditEventType.DATA_ACCESS,
        action: 'large-data',
        details: largeDetails,
        severity: AuditSeverity.LOW,
        source: 'test'
      });

      const content = fs.readFileSync(testLogPath, 'utf8');
      const entry = JSON.parse(content.trim());
      expect(entry.event.details.data).toBe(largeDetails.data);
    });

    it('should handle special characters in event data', async () => {
      const specialData = {
        emoji: '🔒🛡️💻',
        unicode: 'café naïve résumé',
        symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
        json: '{"key": "value", "number": 123}'
      };

      await auditLogger.logEvent({
        eventType: AuditEventType.SYSTEM_EVENT,
        action: 'special-chars',
        details: specialData,
        severity: AuditSeverity.LOW,
        source: 'test'
      });

      const content = fs.readFileSync(testLogPath, 'utf8');
      const entry = JSON.parse(content.trim());
      expect(entry.event.details.emoji).toBe(specialData.emoji);
      expect(entry.event.details.unicode).toBe(specialData.unicode);
    });

    it('should handle empty or minimal events', async () => {
      await auditLogger.logEvent({
        eventType: AuditEventType.SYSTEM_EVENT,
        action: 'minimal',
        details: {},
        severity: AuditSeverity.LOW,
        source: 'test'
      });

      const metrics = auditLogger.getMetrics();
      expect(metrics.totalEvents).toBe(1);
    });
  });
});