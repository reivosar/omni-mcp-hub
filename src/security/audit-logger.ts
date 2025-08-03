import * as fs from 'fs';
import * as path from 'path';
import { CommandExecution } from './command-validator';

export interface AuditLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
  event: string;
  execution?: CommandExecution;
  message: string;
  metadata?: Record<string, any>;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private logPath: string;
  private maxLogSize: number = 10 * 1024 * 1024; // 10MB
  private maxLogFiles: number = 5;
  
  private constructor() {
    this.logPath = path.join(process.cwd(), 'logs', 'security-audit.log');
    this.ensureLogDirectory();
  }
  
  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }
  
  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
  
  private writeLog(entry: AuditLogEntry): void {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      
      // Check if log rotation is needed
      if (fs.existsSync(this.logPath)) {
        const stats = fs.statSync(this.logPath);
        if (stats.size >= this.maxLogSize) {
          this.rotateLog();
        }
      }
      
      fs.appendFileSync(this.logPath, logLine, 'utf8');
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }
  
  private rotateLog(): void {
    try {
      // Rotate existing log files
      for (let i = this.maxLogFiles - 1; i >= 1; i--) {
        const oldFile = `${this.logPath}.${i}`;
        const newFile = `${this.logPath}.${i + 1}`;
        
        if (fs.existsSync(oldFile)) {
          if (i === this.maxLogFiles - 1) {
            fs.unlinkSync(oldFile); // Delete oldest
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }
      
      // Move current log to .1
      if (fs.existsSync(this.logPath)) {
        fs.renameSync(this.logPath, `${this.logPath}.1`);
      }
    } catch (error) {
      console.error('Failed to rotate audit log:', error);
    }
  }
  
  public logValidationAttempt(execution: CommandExecution): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event: 'COMMAND_VALIDATION_ATTEMPT',
      execution,
      message: `Validating command execution: ${execution.command}`,
      metadata: {
        source: execution.source,
        requestId: execution.requestId
      }
    });
  }
  
  public logValidationSuccess(execution: CommandExecution): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event: 'COMMAND_VALIDATION_SUCCESS',
      execution,
      message: `Command validation passed: ${execution.command}`,
      metadata: {
        source: execution.source,
        requestId: execution.requestId
      }
    });
  }
  
  public logSecurityViolation(execution: CommandExecution, reason: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'SECURITY',
      event: 'SECURITY_VIOLATION',
      execution,
      message: `Security violation detected: ${reason}`,
      metadata: {
        source: execution.source,
        requestId: execution.requestId,
        violationType: 'COMMAND_BLOCKED'
      }
    });
  }
  
  public logCommandExecution(execution: CommandExecution, pid?: number): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event: 'COMMAND_EXECUTED',
      execution,
      message: `Command executed: ${execution.command}`,
      metadata: {
        source: execution.source,
        requestId: execution.requestId,
        pid
      }
    });
  }
  
  public logCommandFailure(execution: CommandExecution, error: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'COMMAND_EXECUTION_FAILED',
      execution,
      message: `Command execution failed: ${error}`,
      metadata: {
        source: execution.source,
        requestId: execution.requestId
      }
    });
  }
  
  public logConfigurationValidation(config: any, result: boolean, reason?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: result ? 'INFO' : 'WARN',
      event: 'CONFIGURATION_VALIDATION',
      message: result 
        ? `Configuration validation passed for: ${config.name}`
        : `Configuration validation failed for: ${config.name} - ${reason}`,
      metadata: {
        configName: config.name,
        configCommand: config.command,
        validationResult: result,
        failureReason: reason
      }
    });
  }
  
  public logPolicyUpdate(changes: Record<string, any>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      event: 'SECURITY_POLICY_UPDATE',
      message: 'Security policy updated',
      metadata: {
        changes
      }
    });
  }
  
  public logSuspiciousActivity(activity: string, metadata?: Record<string, any>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'SECURITY',
      event: 'SUSPICIOUS_ACTIVITY',
      message: `Suspicious activity detected: ${activity}`,
      metadata
    });
  }
  
  /**
   * Get recent audit logs for monitoring
   */
  public getRecentLogs(limit: number = 100): AuditLogEntry[] {
    try {
      if (!fs.existsSync(this.logPath)) {
        return [];
      }
      
      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      // Get last N lines
      const recentLines = lines.slice(-limit);
      
      return recentLines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return {
            timestamp: new Date().toISOString(),
            level: 'ERROR' as const,
            event: 'LOG_PARSE_ERROR',
            message: `Failed to parse log line: ${line}`,
            metadata: {}
          };
        }
      });
    } catch (error) {
      console.error('Failed to read audit logs:', error);
      return [];
    }
  }
  
  /**
   * Get security violations from logs
   */
  public getSecurityViolations(hours: number = 24): AuditLogEntry[] {
    const logs = this.getRecentLogs(1000);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return logs.filter(log => {
      const logTime = new Date(log.timestamp);
      return logTime >= cutoff && log.level === 'SECURITY';
    });
  }
}