/**
 * Immutable Audit Logging System with Tamper Evidence
 * Provides comprehensive audit trail with integrity verification
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { EventEmitter } from "events";
import { ILogger, SilentLogger } from "../utils/logger.js";

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  userId?: string;
  sessionId?: string;
  resourceId?: string;
  action: string;
  details: Record<string, unknown>;
  severity: AuditSeverity;
  source: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export enum AuditEventType {
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  DATA_ACCESS = "data_access",
  DATA_MODIFICATION = "data_modification",
  CONFIGURATION_CHANGE = "configuration_change",
  SECURITY_VIOLATION = "security_violation",
  SYSTEM_EVENT = "system_event",
  PROFILE_APPLICATION = "profile_application",
  TOOL_EXECUTION = "tool_execution",
  RESOURCE_ACCESS = "resource_access",
  ERROR = "error",
  COMPLIANCE = "compliance",
}

export enum AuditSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface AuditLogEntry {
  event: AuditEvent;
  hash: string;
  previousHash: string;
  sequenceNumber: number;
  signature?: string;
}

export interface AuditConfig {
  logFilePath: string;
  maxFileSize: number;
  retentionDays: number;
  enableTamperEvidence: boolean;
  enableEncryption: boolean;
  enableExternalSink: boolean;
  externalSinks: ExternalSink[];
  compressionEnabled: boolean;
  backupEnabled: boolean;
  backupInterval: number;
}

export interface ExternalSink {
  type: "file" | "s3" | "cloudwatch" | "elasticsearch" | "webhook";
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface AuditMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  integrityViolations: number;
  lastLogTime: Date | null;
  logFileSize: number;
  failedSinkDeliveries: number;
}

export class AuditLogger extends EventEmitter {
  private config: AuditConfig;
  private logger: ILogger;
  private lastHash: string = "";
  private sequenceNumber: number = 0;
  private metrics: AuditMetrics;
  private rotationInProgress = false;
  private encryptionKey?: Buffer;

  constructor(config?: Partial<AuditConfig>, logger?: ILogger) {
    super();
    this.logger = logger || new SilentLogger();

    this.config = {
      logFilePath: path.join(process.cwd(), "logs", "audit.jsonl"),
      maxFileSize: 100 * 1024 * 1024, // 100MB
      retentionDays: 90,
      enableTamperEvidence: true,
      enableEncryption: false,
      enableExternalSink: false,
      externalSinks: [],
      compressionEnabled: true,
      backupEnabled: true,
      backupInterval: 24 * 60 * 60 * 1000, // 24 hours
      ...config,
    };

    this.metrics = {
      totalEvents: 0,
      eventsByType: {},
      eventsBySeverity: {},
      integrityViolations: 0,
      lastLogTime: null,
      logFileSize: 0,
      failedSinkDeliveries: 0,
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.config.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Initialize encryption key if enabled
      if (this.config.enableEncryption) {
        this.initializeEncryption();
      }

      // Load existing log state
      await this.loadLogState();

      // Start background tasks
      this.startBackgroundTasks();

      this.logger.info("Audit logging system initialized");
    } catch (error) {
      this.logger.error("Failed to initialize audit logging system:", error);
      this.emit("initialization-error", error);
    }
  }

  private initializeEncryption(): void {
    // In production, this should come from a secure key management system
    const keyEnv = process.env.AUDIT_ENCRYPTION_KEY;
    if (keyEnv) {
      this.encryptionKey = Buffer.from(keyEnv, "base64");
    } else {
      // Generate a new key for development (should be persisted securely)
      this.encryptionKey = crypto.randomBytes(32);
      this.logger.warn(
        "Generated new encryption key for audit logs. In production, use AUDIT_ENCRYPTION_KEY environment variable.",
      );
    }
  }

  private async loadLogState(): Promise<void> {
    try {
      if (!fs.existsSync(this.config.logFilePath)) {
        return; // New log file
      }

      const stats = fs.statSync(this.config.logFilePath);
      this.metrics.logFileSize = stats.size;

      // Read last few lines to get sequence number and hash
      const lastEntries = this.readLastEntries(10);
      if (lastEntries.length > 0) {
        const lastEntry = lastEntries[lastEntries.length - 1];
        this.lastHash = lastEntry.hash;
        this.sequenceNumber = lastEntry.sequenceNumber;
      }

      // Verify integrity of existing log
      await this.verifyLogIntegrity();
    } catch (error) {
      this.logger.error("Failed to load log state:", error);
    }
  }

  private readLastEntries(count: number): AuditLogEntry[] {
    try {
      const content = fs.readFileSync(this.config.logFilePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((line) => line.trim());
      const lastLines = lines.slice(-count);

      return lastLines
        .map((line) => {
          try {
            return JSON.parse(line) as AuditLogEntry;
          } catch {
            return null;
          }
        })
        .filter((entry) => entry !== null) as AuditLogEntry[];
    } catch {
      return [];
    }
  }

  /**
   * Log an audit event
   */
  async logEvent(event: Omit<AuditEvent, "id" | "timestamp">): Promise<void> {
    try {
      const fullEvent: AuditEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        ...event,
      };

      const logEntry = await this.createLogEntry(fullEvent);
      await this.writeLogEntry(logEntry);
      await this.deliverToExternalSinks(logEntry);

      this.updateMetrics(fullEvent);
      this.emit("event-logged", fullEvent);
    } catch (error) {
      this.logger.error("Failed to log audit event:", error);
      this.emit("log-error", { event, error });
    }
  }

  private async createLogEntry(event: AuditEvent): Promise<AuditLogEntry> {
    const eventData = JSON.stringify(event);
    const hash = this.calculateHash(eventData + this.lastHash);

    const logEntry: AuditLogEntry = {
      event,
      hash,
      previousHash: this.lastHash,
      sequenceNumber: ++this.sequenceNumber,
    };

    // Add digital signature if enabled
    if (this.config.enableTamperEvidence && this.encryptionKey) {
      logEntry.signature = this.signEntry(logEntry);
    }

    this.lastHash = hash;
    return logEntry;
  }

  private calculateHash(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  private signEntry(entry: AuditLogEntry): string {
    if (!this.encryptionKey) {
      return "";
    }

    const data = JSON.stringify({
      event: entry.event,
      hash: entry.hash,
      previousHash: entry.previousHash,
      sequenceNumber: entry.sequenceNumber,
    });

    const hmac = crypto.createHmac("sha256", this.encryptionKey);
    return hmac.update(data).digest("hex");
  }

  private async writeLogEntry(entry: AuditLogEntry): Promise<void> {
    const logLine = JSON.stringify(entry) + "\n";

    // Check if rotation is needed
    if (this.shouldRotateLog()) {
      await this.rotateLog();
    }

    // Encrypt if enabled
    const finalLogLine = this.config.enableEncryption
      ? this.encryptData(logLine) + "\n"
      : logLine;

    fs.appendFileSync(this.config.logFilePath, finalLogLine);
    this.metrics.logFileSize += finalLogLine.length;
  }

  private encryptData(data: string): string {
    if (!this.encryptionKey) {
      return data;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString("hex"),
      encrypted,
      authTag: authTag.toString("hex"),
    });
  }

  private shouldRotateLog(): boolean {
    return this.metrics.logFileSize >= this.config.maxFileSize;
  }

  private async rotateLog(): Promise<void> {
    if (this.rotationInProgress) {
      return;
    }

    this.rotationInProgress = true;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rotatedPath = this.config.logFilePath.replace(
        ".jsonl",
        `-${timestamp}.jsonl`,
      );

      fs.renameSync(this.config.logFilePath, rotatedPath);

      if (this.config.compressionEnabled) {
        await this.compressFile(rotatedPath);
      }

      this.metrics.logFileSize = 0;
      this.logger.info(`Audit log rotated: ${rotatedPath}`);
      this.emit("log-rotated", { rotatedPath });
    } catch (error) {
      this.logger.error("Failed to rotate audit log:", error);
    } finally {
      this.rotationInProgress = false;
    }
  }

  private async compressFile(filePath: string): Promise<void> {
    // Simple compression implementation - in production, use proper compression library
    try {
      const zlib = await import("zlib");
      const content = fs.readFileSync(filePath);
      const compressed = zlib.gzipSync(content);
      fs.writeFileSync(filePath + ".gz", compressed);
      fs.unlinkSync(filePath);
    } catch (error) {
      this.logger.error("Failed to compress audit log:", error);
    }
  }

  private async deliverToExternalSinks(entry: AuditLogEntry): Promise<void> {
    if (!this.config.enableExternalSink) {
      return;
    }

    for (const sink of this.config.externalSinks) {
      if (!sink.enabled) continue;

      try {
        await this.deliverToSink(sink, entry);
      } catch (error) {
        this.metrics.failedSinkDeliveries++;
        this.logger.error(
          `Failed to deliver to external sink ${sink.type}:`,
          error,
        );
        this.emit("sink-delivery-failed", { sink, entry, error });
      }
    }
  }

  private async deliverToSink(
    sink: ExternalSink,
    entry: AuditLogEntry,
  ): Promise<void> {
    switch (sink.type) {
      case "file":
        await this.deliverToFileSink(sink, entry);
        break;
      case "webhook":
        await this.deliverToWebhookSink(sink, entry);
        break;
      default:
        this.logger.warn(`Unsupported sink type: ${sink.type}`);
    }
  }

  private async deliverToFileSink(
    sink: ExternalSink,
    entry: AuditLogEntry,
  ): Promise<void> {
    const filePath = sink.config.path as string;
    if (!filePath) {
      throw new Error("File sink path not configured");
    }

    const logLine = JSON.stringify(entry) + "\n";
    fs.appendFileSync(filePath, logLine);
  }

  private async deliverToWebhookSink(
    sink: ExternalSink,
    entry: AuditLogEntry,
  ): Promise<void> {
    const url = sink.config.url as string;
    if (!url) {
      throw new Error("Webhook sink URL not configured");
    }

    // Simple webhook delivery - in production, add retry logic and proper error handling
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...((sink.config.headers as Record<string, string>) || {}),
      },
      body: JSON.stringify(entry),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook delivery failed: ${response.status} ${response.statusText}`,
      );
    }
  }

  private updateMetrics(event: AuditEvent): void {
    this.metrics.totalEvents++;
    this.metrics.lastLogTime = new Date();

    this.metrics.eventsByType[event.eventType] =
      (this.metrics.eventsByType[event.eventType] || 0) + 1;

    this.metrics.eventsBySeverity[event.severity] =
      (this.metrics.eventsBySeverity[event.severity] || 0) + 1;
  }

  /**
   * Verify the integrity of the audit log
   */
  async verifyLogIntegrity(): Promise<boolean> {
    try {
      const entries = this.readAllEntries();
      let previousHash = "";

      for (const entry of entries) {
        // Verify hash chain
        if (entry.previousHash !== previousHash) {
          this.metrics.integrityViolations++;
          this.emit("integrity-violation", {
            entry,
            expected: previousHash,
            actual: entry.previousHash,
          });
          return false;
        }

        // Verify entry hash
        const eventData = JSON.stringify(entry.event);
        const expectedHash = this.calculateHash(eventData + entry.previousHash);
        if (entry.hash !== expectedHash) {
          this.metrics.integrityViolations++;
          this.emit("integrity-violation", {
            entry,
            type: "hash-mismatch",
            expected: expectedHash,
            actual: entry.hash,
          });
          return false;
        }

        // Verify signature if present
        if (entry.signature && this.config.enableTamperEvidence) {
          const expectedSignature = this.signEntry(entry);
          if (entry.signature !== expectedSignature) {
            this.metrics.integrityViolations++;
            this.emit("integrity-violation", {
              entry,
              type: "signature-mismatch",
            });
            return false;
          }
        }

        previousHash = entry.hash;
      }

      return true;
    } catch (error) {
      this.logger.error("Error verifying log integrity:", error);
      return false;
    }
  }

  private readAllEntries(): AuditLogEntry[] {
    try {
      if (!fs.existsSync(this.config.logFilePath)) {
        return [];
      }

      const content = fs.readFileSync(this.config.logFilePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      return lines
        .map((line) => {
          try {
            return JSON.parse(line) as AuditLogEntry;
          } catch {
            return null;
          }
        })
        .filter((entry) => entry !== null) as AuditLogEntry[];
    } catch {
      return [];
    }
  }

  private startBackgroundTasks(): void {
    // Cleanup old logs
    setInterval(
      () => {
        this.cleanupOldLogs();
      },
      24 * 60 * 60 * 1000,
    ); // Daily

    // Backup logs
    if (this.config.backupEnabled) {
      setInterval(() => {
        this.backupLogs();
      }, this.config.backupInterval);
    }

    // Integrity verification
    setInterval(
      () => {
        this.verifyLogIntegrity();
      },
      4 * 60 * 60 * 1000,
    ); // Every 4 hours
  }

  private cleanupOldLogs(): void {
    try {
      const logDir = path.dirname(this.config.logFilePath);
      const files = fs.readdirSync(logDir);
      const cutoffTime =
        Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (
          file.includes("audit-") &&
          (file.endsWith(".jsonl") || file.endsWith(".jsonl.gz"))
        ) {
          const filePath = path.join(logDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(filePath);
            this.logger.info(`Deleted old audit log: ${file}`);
          }
        }
      }
    } catch (error) {
      this.logger.error("Failed to cleanup old logs:", error);
    }
  }

  private async backupLogs(): Promise<void> {
    try {
      const backupDir = path.join(
        path.dirname(this.config.logFilePath),
        "backup",
      );
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = path.join(
        backupDir,
        `audit-backup-${timestamp}.jsonl`,
      );

      if (fs.existsSync(this.config.logFilePath)) {
        fs.copyFileSync(this.config.logFilePath, backupPath);

        if (this.config.compressionEnabled) {
          await this.compressFile(backupPath);
        }

        this.logger.info(`Audit log backed up: ${backupPath}`);
      }
    } catch (error) {
      this.logger.error("Failed to backup audit logs:", error);
    }
  }

  /**
   * Get audit metrics
   */
  getMetrics(): AuditMetrics {
    return { ...this.metrics };
  }

  /**
   * Search audit logs
   */
  searchLogs(criteria: {
    eventType?: AuditEventType;
    severity?: AuditSeverity;
    userId?: string;
    startTime?: Date;
    endTime?: Date;
    action?: string;
  }): AuditEvent[] {
    const entries = this.readAllEntries();

    return entries
      .filter((entry) => {
        const event = entry.event;

        if (criteria.eventType && event.eventType !== criteria.eventType) {
          return false;
        }

        if (criteria.severity && event.severity !== criteria.severity) {
          return false;
        }

        if (criteria.userId && event.userId !== criteria.userId) {
          return false;
        }

        if (criteria.startTime && event.timestamp < criteria.startTime) {
          return false;
        }

        if (criteria.endTime && event.timestamp > criteria.endTime) {
          return false;
        }

        if (criteria.action && event.action !== criteria.action) {
          return false;
        }

        return true;
      })
      .map((entry) => entry.event);
  }

  /**
   * Export audit logs for compliance
   */
  exportLogs(format: "json" | "csv" | "xml" = "json"): string {
    const entries = this.readAllEntries();

    switch (format) {
      case "json":
        return JSON.stringify(
          entries.map((e) => e.event),
          null,
          2,
        );
      case "csv":
        return this.exportToCsv(entries.map((e) => e.event));
      case "xml":
        return this.exportToXml(entries.map((e) => e.event));
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private exportToCsv(events: AuditEvent[]): string {
    if (events.length === 0) return "";

    const headers = [
      "id",
      "timestamp",
      "eventType",
      "userId",
      "action",
      "severity",
      "source",
    ];
    const rows = events.map((event) => [
      event.id,
      new Date(event.timestamp).toISOString(),
      event.eventType,
      event.userId || "",
      event.action,
      event.severity,
      event.source,
    ]);

    return [headers, ...rows].map((row) => row.join(",")).join("\n");
  }

  private exportToXml(events: AuditEvent[]): string {
    const eventXml = events
      .map(
        (event) => `
      <event>
        <id>${event.id}</id>
        <timestamp>${new Date(event.timestamp).toISOString()}</timestamp>
        <eventType>${event.eventType}</eventType>
        <userId>${event.userId || ""}</userId>
        <action>${event.action}</action>
        <severity>${event.severity}</severity>
        <source>${event.source}</source>
        <details>${JSON.stringify(event.details)}</details>
      </event>
    `,
      )
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
    <auditLog>
      ${eventXml}
    </auditLog>`;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.removeAllListeners();
  }
}

// Singleton audit logger for global use
export class GlobalAuditLogger {
  private static instance: AuditLogger;

  static getInstance(
    config?: Partial<AuditConfig>,
    logger?: ILogger,
  ): AuditLogger {
    if (!GlobalAuditLogger.instance) {
      GlobalAuditLogger.instance = new AuditLogger(config, logger);
    }
    return GlobalAuditLogger.instance;
  }

  static resetInstance(): void {
    if (GlobalAuditLogger.instance) {
      GlobalAuditLogger.instance.cleanup();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    GlobalAuditLogger.instance = undefined as any;
  }
}

// Convenience functions for common audit events
export class AuditEventHelpers {
  static createAuthEvent(
    action: string,
    userId?: string,
    details: Record<string, unknown> = {},
  ): Omit<AuditEvent, "id" | "timestamp"> {
    return {
      eventType: AuditEventType.AUTHENTICATION,
      userId,
      action,
      details,
      severity: AuditSeverity.MEDIUM,
      source: "auth-system",
    };
  }

  static createSecurityEvent(
    action: string,
    details: Record<string, unknown> = {},
  ): Omit<AuditEvent, "id" | "timestamp"> {
    return {
      eventType: AuditEventType.SECURITY_VIOLATION,
      action,
      details,
      severity: AuditSeverity.HIGH,
      source: "security-system",
    };
  }

  static createConfigEvent(
    action: string,
    userId?: string,
    details: Record<string, unknown> = {},
  ): Omit<AuditEvent, "id" | "timestamp"> {
    return {
      eventType: AuditEventType.CONFIGURATION_CHANGE,
      userId,
      action,
      details,
      severity: AuditSeverity.MEDIUM,
      source: "config-system",
    };
  }

  static createToolEvent(
    action: string,
    userId?: string,
    toolName?: string,
    details: Record<string, unknown> = {},
  ): Omit<AuditEvent, "id" | "timestamp"> {
    return {
      eventType: AuditEventType.TOOL_EXECUTION,
      userId,
      resourceId: toolName,
      action,
      details,
      severity: AuditSeverity.LOW,
      source: "tool-system",
    };
  }
}
