/**
 * Structured audit logging for profile application operations
 */

import { ILogger, SilentLogger } from "../utils/logger.js";

export interface AuditEvent {
  ts: string;
  actor: string;
  profile: string;
  sourcePath?: string;
  hash: string;
  result: "applied" | "noop" | "rolled_back" | "error";
  durationMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export class AuditLogger {
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger || new SilentLogger();
  }

  /**
   * Log successful application
   */
  logApplied(event: Omit<AuditEvent, "ts" | "result">): void {
    this.log({
      ...event,
      ts: new Date().toISOString(),
      result: "applied",
    });
  }

  /**
   * Log no-operation (unchanged hash)
   */
  logNoop(event: Omit<AuditEvent, "ts" | "result">): void {
    this.log({
      ...event,
      ts: new Date().toISOString(),
      result: "noop",
    });
  }

  /**
   * Log rollback due to error
   */
  logRolledBack(
    event: Omit<AuditEvent, "ts" | "result"> & { error: string },
  ): void {
    this.log({
      ...event,
      ts: new Date().toISOString(),
      result: "rolled_back",
    });
  }

  /**
   * Log general error
   */
  logError(event: Omit<AuditEvent, "ts" | "result"> & { error: string }): void {
    this.log({
      ...event,
      ts: new Date().toISOString(),
      result: "error",
    });
  }

  /**
   * Write structured log entry
   */
  private log(event: AuditEvent): void {
    // Structured JSON logging
    const logEntry = {
      level:
        event.result === "error" || event.result === "rolled_back"
          ? "error"
          : "info",
      component: "profile-apply",
      event,
    };

    if (event.result === "error" || event.result === "rolled_back") {
      this.logger.error(JSON.stringify(logEntry));
    } else {
      this.logger.info(JSON.stringify(logEntry));
    }
  }

  /**
   * Create audit event base structure
   */
  createEvent(
    actor: string,
    profile: string,
    hash: string,
    durationMs: number,
    additional?: Partial<AuditEvent>,
  ): Omit<AuditEvent, "ts" | "result"> {
    return {
      actor,
      profile,
      hash,
      durationMs,
      ...additional,
    };
  }
}

// Global audit logger instance
export const audit = new AuditLogger();

/**
 * Set audit logger instance
 */
export function setAuditLogger(logger: ILogger): void {
  audit["logger"] = logger;
}
