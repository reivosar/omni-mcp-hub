/**
 * Secrets Scanner - Detects and prevents secrets/credentials leakage
 * Implements comprehensive pattern matching for various secret types
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ILogger, SilentLogger } from '../utils/logger.js';

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  falsePositiveCheck?: (match: string, context: string) => boolean;
}

export interface SecretFinding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  column: number;
  match: string;
  context: string;
  timestamp: Date;
}

export interface ScanResult {
  findings: SecretFinding[];
  filesScanned: number;
  timeElapsed: number;
  blocked: boolean;
}

export interface ScanOptions {
  blockOnDetection?: boolean;
  includeTests?: boolean;
  customPatterns?: SecretPattern[];
  excludePaths?: string[];
  maxFileSizeBytes?: number;
  enableContextAnalysis?: boolean;
}

// Comprehensive secret patterns database
const DEFAULT_SECRET_PATTERNS: SecretPattern[] = [
  // API Keys
  {
    name: 'AWS Access Key ID',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/gi,
    severity: 'critical',
    description: 'AWS Access Key ID detected'
  },
  {
    name: 'AWS Secret Access Key',
    pattern: /\b([0-9a-zA-Z/+=]{40})\b/g,
    severity: 'critical',
    description: 'Potential AWS Secret Access Key',
    falsePositiveCheck: (_match, context) => {
      // Check if it's in a known AWS context
      return !context.toLowerCase().includes('aws') && !context.includes('secret');
    }
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /\b(ghp_[a-zA-Z0-9]{36})\b/gi,
    severity: 'critical',
    description: 'GitHub Personal Access Token detected'
  },
  {
    name: 'GitHub OAuth Token',
    pattern: /\b(gho_[a-zA-Z0-9]{36})\b/gi,
    severity: 'critical',
    description: 'GitHub OAuth Token detected'
  },
  {
    name: 'GitHub App Token',
    pattern: /\b(ghs_[a-zA-Z0-9]{36})\b/gi,
    severity: 'critical',
    description: 'GitHub App Token detected'
  },
  {
    name: 'GitHub Refresh Token',
    pattern: /\b(ghr_[a-zA-Z0-9]{36})\b/gi,
    severity: 'critical',
    description: 'GitHub Refresh Token detected'
  },
  {
    name: 'Slack Token',
    pattern: /\b(xox[baprs]-[0-9]{10,48})\b/gi,
    severity: 'high',
    description: 'Slack API Token detected'
  },
  {
    name: 'Slack Webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]{8}\/B[a-zA-Z0-9_]{8}\/[a-zA-Z0-9_]{24}/gi,
    severity: 'high',
    description: 'Slack Webhook URL detected'
  },
  {
    name: 'Google API Key',
    pattern: /\b(AIza[0-9A-Za-z\\-_]{35})\b/gi,
    severity: 'high',
    description: 'Google API Key detected'
  },
  {
    name: 'Google Cloud Platform API Key',
    pattern: /\b(AIza[0-9A-Za-z\\-_]{35})\b/gi,
    severity: 'critical',
    description: 'Google Cloud Platform API Key detected'
  },
  {
    name: 'Stripe API Key',
    pattern: /\b(sk_live_[0-9a-zA-Z]{24,})\b/gi,
    severity: 'critical',
    description: 'Stripe Live API Key detected'
  },
  {
    name: 'Stripe Test Key',
    pattern: /\b(sk_test_[0-9a-zA-Z]{24,})\b/gi,
    severity: 'medium',
    description: 'Stripe Test API Key detected'
  },
  {
    name: 'PayPal/Braintree Access Token',
    pattern: /access_token\$production\$[0-9a-z]{16}\$[0-9a-f]{32}/gi,
    severity: 'critical',
    description: 'PayPal/Braintree Access Token detected'
  },
  {
    name: 'Square Access Token',
    pattern: /\b(sq0atp-[0-9A-Za-z\\-_]{22})\b/gi,
    severity: 'critical',
    description: 'Square Access Token detected'
  },
  {
    name: 'Square OAuth Secret',
    pattern: /\b(sq0csp-[0-9A-Za-z\\-_]{43})\b/gi,
    severity: 'critical',
    description: 'Square OAuth Secret detected'
  },
  {
    name: 'Twilio API Key',
    pattern: /\b(SK[0-9a-fA-F]{32})\b/g,
    severity: 'high',
    description: 'Twilio API Key detected'
  },
  {
    name: 'MailChimp API Key',
    pattern: /\b([0-9a-f]{32}-us[0-9]{1,2})\b/gi,
    severity: 'high',
    description: 'MailChimp API Key detected'
  },
  {
    name: 'SendGrid API Key',
    pattern: /\b(SG\.[0-9A-Za-z\\-_]{22}\.[0-9A-Za-z\\-_]{43})\b/gi,
    severity: 'high',
    description: 'SendGrid API Key detected'
  },
  {
    name: 'Heroku API Key',
    pattern: /\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b/g,
    severity: 'high',
    description: 'Potential Heroku API Key (UUID format)',
    falsePositiveCheck: (_match, context) => {
      return !context.toLowerCase().includes('heroku');
    }
  },
  
  // Private Keys & Certificates
  {
    name: 'RSA Private Key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/gi,
    severity: 'critical',
    description: 'RSA Private Key detected'
  },
  {
    name: 'DSA Private Key',
    pattern: /-----BEGIN DSA PRIVATE KEY-----/gi,
    severity: 'critical',
    description: 'DSA Private Key detected'
  },
  {
    name: 'EC Private Key',
    pattern: /-----BEGIN EC PRIVATE KEY-----/gi,
    severity: 'critical',
    description: 'EC Private Key detected'
  },
  {
    name: 'PGP Private Key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/gi,
    severity: 'critical',
    description: 'PGP Private Key detected'
  },
  {
    name: 'OpenSSH Private Key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/gi,
    severity: 'critical',
    description: 'OpenSSH Private Key detected'
  },
  {
    name: 'SSH Private Key',
    pattern: /-----BEGIN PRIVATE KEY-----/gi,
    severity: 'critical',
    description: 'SSH Private Key detected'
  },
  
  // Database Connection Strings
  {
    name: 'PostgreSQL Connection String',
    pattern: /postgres:\/\/[^:]+:[^@]+@[^/]+\/\w+/gi,
    severity: 'critical',
    description: 'PostgreSQL connection string with credentials'
  },
  {
    name: 'MySQL Connection String',
    pattern: /mysql:\/\/[^:]+:[^@]+@[^/]+\/\w+/gi,
    severity: 'critical',
    description: 'MySQL connection string with credentials'
  },
  {
    name: 'MongoDB Connection String',
    pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@[^/]+/gi,
    severity: 'critical',
    description: 'MongoDB connection string with credentials'
  },
  {
    name: 'Redis Connection String',
    pattern: /redis:\/\/:[^@]+@[^:]+:\d+/gi,
    severity: 'high',
    description: 'Redis connection string with password'
  },
  
  // Cloud Provider Secrets
  {
    name: 'Azure Storage Account Key',
    pattern: /\b([a-zA-Z0-9+/]{86}==)\b/g,
    severity: 'critical',
    description: 'Potential Azure Storage Account Key',
    falsePositiveCheck: (_match, _context) => {
      return !_context.toLowerCase().includes('azure') && !_context.includes('storage');
    }
  },
  {
    name: 'Azure SAS Token',
    pattern: /\?sv=[0-9]{4}-[0-9]{2}-[0-9]{2}&s[a-z]=/gi,
    severity: 'high',
    description: 'Azure SAS Token detected'
  },
  {
    name: 'GCP Service Account',
    pattern: /"type":\s*"service_account"/gi,
    severity: 'critical',
    description: 'GCP Service Account JSON detected'
  },
  
  // Authentication Tokens
  {
    name: 'JWT Token',
    pattern: /\beyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,
    severity: 'medium',
    description: 'JWT Token detected',
    falsePositiveCheck: (_match, context) => {
      // Check if it's an example or documentation
      return context.includes('example') || context.includes('test');
    }
  },
  {
    name: 'Basic Auth Header',
    pattern: /Authorization:\s*Basic\s+[A-Za-z0-9+/]+=*/gi,
    severity: 'high',
    description: 'Basic Authentication Header detected'
  },
  {
    name: 'Bearer Token',
    pattern: /Authorization:\s*Bearer\s+[A-Za-z0-9\\-_]+/gi,
    severity: 'high',
    description: 'Bearer Token detected'
  },
  
  // Environment Variables & Config
  {
    name: 'Generic API Key',
    pattern: /\b(api[_-]?key|apikey)\s*[:=]\s*["']?([a-zA-Z0-9\\-_]{20,})["']?/gi,
    severity: 'high',
    description: 'Generic API Key pattern detected'
  },
  {
    name: 'Generic Secret',
    pattern: /\b(secret|password|passwd|pwd)\s*[:=]\s*["']?([^\s"']{8,})["']?/gi,
    severity: 'high',
    description: 'Generic secret/password pattern detected',
    falsePositiveCheck: (_match, context) => {
      // Exclude common false positives
      const lowerMatch = _match.toLowerCase();
      return lowerMatch.includes('placeholder') || 
             lowerMatch.includes('example') ||
             lowerMatch.includes('changeme') ||
             lowerMatch.includes('your-');
    }
  },
  {
    name: 'Generic Token',
    pattern: /\b(token|auth)\s*[:=]\s*["']?([a-zA-Z0-9\\-_]{20,})["']?/gi,
    severity: 'high',
    description: 'Generic token pattern detected'
  },
  {
    name: 'Environment Variable with Secret',
    pattern: /export\s+[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z_]*=.+/gi,
    severity: 'high',
    description: 'Environment variable containing potential secret'
  },
  
  // Cryptocurrency
  {
    name: 'Bitcoin Private Key',
    pattern: /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g,
    severity: 'critical',
    description: 'Bitcoin Private Key detected'
  },
  {
    name: 'Ethereum Private Key',
    pattern: /0x[a-fA-F0-9]{64}/g,
    severity: 'critical',
    description: 'Potential Ethereum Private Key',
    falsePositiveCheck: (_match, context) => {
      return !context.toLowerCase().includes('private') && !context.includes('key');
    }
  }
];

export class SecretsScanner {
  private patterns: SecretPattern[];
  private logger: ILogger;
  private options: Required<ScanOptions>;

  constructor(options?: ScanOptions, logger?: ILogger) {
    this.logger = logger || new SilentLogger();
    this.options = {
      blockOnDetection: true,
      includeTests: false,
      customPatterns: [],
      excludePaths: ['node_modules', '.git', 'dist', 'build', 'coverage', '.vscode', '.idea'],
      maxFileSizeBytes: 1024 * 1024, // 1MB
      enableContextAnalysis: true,
      ...options
    };
    
    this.patterns = [...DEFAULT_SECRET_PATTERNS, ...this.options.customPatterns];
  }

  /**
   * Scan a single file for secrets
   */
  async scanFile(filePath: string): Promise<SecretFinding[]> {
    const findings: SecretFinding[] = [];
    
    try {
      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.options.maxFileSizeBytes) {
        this.logger.debug(`Skipping large file: ${filePath} (${stats.size} bytes)`);
        return findings;
      }
      
      // Skip excluded paths
      if (this.shouldExcludePath(filePath)) {
        return findings;
      }
      
      // Skip test files if not included
      if (!this.options.includeTests && this.isTestFile(filePath)) {
        return findings;
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (const pattern of this.patterns) {
        const matches = this.findMatches(content, pattern);
        
        for (const match of matches) {
          // Get line and column information
          const position = this.getPosition(content, match.index);
          const context = this.getContext(lines, position.line);
          
          // Check for false positives
          if (pattern.falsePositiveCheck && pattern.falsePositiveCheck(match.value, context)) {
            continue;
          }
          
          findings.push({
            type: pattern.name,
            severity: pattern.severity,
            file: filePath,
            line: position.line,
            column: position.column,
            match: this.redactSecret(match.value),
            context: context,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      this.logger.debug(`Error scanning file ${filePath}: ${error}`);
    }
    
    return findings;
  }

  /**
   * Scan a directory recursively for secrets
   */
  async scanDirectory(dirPath: string): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: SecretFinding[] = [];
    let filesScanned = 0;
    
    const scanRecursive = async (currentPath: string) => {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          
          if (this.shouldExcludePath(fullPath)) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scanRecursive(fullPath);
          } else if (entry.isFile()) {
            const fileFindings = await this.scanFile(fullPath);
            findings.push(...fileFindings);
            filesScanned++;
            
            // Block immediately on critical findings if configured
            if (this.options.blockOnDetection && fileFindings.some(f => f.severity === 'critical')) {
              this.logger.error(`Critical secret detected in ${fullPath} - blocking operation`);
              break;
            }
          }
        }
      } catch (error) {
        this.logger.debug(`Error scanning directory ${currentPath}: ${error}`);
      }
    };
    
    await scanRecursive(dirPath);
    
    const blocked = this.options.blockOnDetection && findings.some(f => f.severity === 'critical');
    
    return {
      findings,
      filesScanned,
      timeElapsed: Date.now() - startTime,
      blocked
    };
  }

  /**
   * Scan content string for secrets
   */
  scanContent(content: string, sourceName: string = 'inline'): SecretFinding[] {
    const findings: SecretFinding[] = [];
    const lines = content.split('\n');
    
    for (const pattern of this.patterns) {
      const matches = this.findMatches(content, pattern);
      
      for (const match of matches) {
        const position = this.getPosition(content, match.index);
        const context = this.getContext(lines, position.line);
        
        if (pattern.falsePositiveCheck && pattern.falsePositiveCheck(match.value, context)) {
          continue;
        }
        
        findings.push({
          type: pattern.name,
          severity: pattern.severity,
          file: sourceName,
          line: position.line,
          column: position.column,
          match: this.redactSecret(match.value),
          context: context,
          timestamp: new Date()
        });
      }
    }
    
    return findings;
  }

  /**
   * Pre-commit hook scan
   */
  async preCommitScan(files: string[]): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: SecretFinding[] = [];
    
    for (const file of files) {
      const fileFindings = await this.scanFile(file);
      findings.push(...fileFindings);
    }
    
    const blocked = findings.some(f => f.severity === 'critical' || f.severity === 'high');
    
    if (blocked) {
      this.logger.error('Secrets detected in commit - blocking');
      this.reportFindings(findings);
    }
    
    return {
      findings,
      filesScanned: files.length,
      timeElapsed: Date.now() - startTime,
      blocked
    };
  }

  /**
   * Report findings to logger
   */
  reportFindings(findings: SecretFinding[]): void {
    if (findings.length === 0) {
      this.logger.info('No secrets detected');
      return;
    }
    
    const grouped = this.groupFindingsBySeverity(findings);
    
    for (const [severity, items] of Object.entries(grouped)) {
      this.logger.error(`\n${severity.toUpperCase()} severity findings (${items.length}):`);
      for (const finding of items) {
        this.logger.error(`  - ${finding.type} in ${finding.file}:${finding.line}`);
        this.logger.error(`    Match: ${finding.match}`);
      }
    }
  }

  /**
   * Generate report in various formats
   */
  generateReport(findings: SecretFinding[], format: 'json' | 'markdown' | 'html' = 'json'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(findings, null, 2);
      
      case 'markdown':
        return this.generateMarkdownReport(findings);
      
      case 'html':
        return this.generateHtmlReport(findings);
      
      default:
        return JSON.stringify(findings, null, 2);
    }
  }

  private generateMarkdownReport(findings: SecretFinding[]): string {
    let report = '# Secrets Scan Report\n\n';
    report += `**Scan Date:** ${new Date().toISOString()}\n`;
    report += `**Total Findings:** ${findings.length}\n\n`;
    
    if (findings.length === 0) {
      report += '✅ No secrets detected\n';
      return report;
    }
    
    const grouped = this.groupFindingsBySeverity(findings);
    
    for (const [severity, items] of Object.entries(grouped)) {
      report += `## ${severity.toUpperCase()} Severity (${items.length})\n\n`;
      
      for (const finding of items) {
        report += `### ${finding.type}\n`;
        report += `- **File:** ${finding.file}\n`;
        report += `- **Line:** ${finding.line}:${finding.column}\n`;
        report += `- **Match:** \`${finding.match}\`\n`;
        report += `- **Context:** \`\`\`\n${finding.context}\n\`\`\`\n\n`;
      }
    }
    
    return report;
  }

  private generateHtmlReport(findings: SecretFinding[]): string {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Secrets Scan Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .critical { background-color: #ff4444; color: white; padding: 2px 6px; border-radius: 3px; }
    .high { background-color: #ff8800; color: white; padding: 2px 6px; border-radius: 3px; }
    .medium { background-color: #ffbb00; padding: 2px 6px; border-radius: 3px; }
    .low { background-color: #88cc00; padding: 2px 6px; border-radius: 3px; }
    .finding { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
    .code { background-color: #f5f5f5; padding: 10px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>Secrets Scan Report</h1>
  <p><strong>Scan Date:</strong> ${new Date().toISOString()}</p>
  <p><strong>Total Findings:</strong> ${findings.length}</p>
  
  ${findings.length === 0 ? '<p style="color: green;">✅ No secrets detected</p>' : ''}
  
  ${findings.map(f => `
    <div class="finding">
      <h3>${f.type} <span class="${f.severity}">${f.severity.toUpperCase()}</span></h3>
      <p><strong>File:</strong> ${f.file}</p>
      <p><strong>Location:</strong> Line ${f.line}, Column ${f.column}</p>
      <p><strong>Match:</strong> <code>${f.match}</code></p>
      <div class="code">${f.context}</div>
    </div>
  `).join('')}
</body>
</html>`;
    
    return html;
  }

  private findMatches(content: string, pattern: SecretPattern): Array<{value: string, index: number}> {
    const matches: Array<{value: string, index: number}> = [];
    let match;
    
    // Reset regex lastIndex
    pattern.pattern.lastIndex = 0;
    
    while ((match = pattern.pattern.exec(content)) !== null) {
      matches.push({
        value: match[0],
        index: match.index
      });
    }
    
    return matches;
  }

  private getPosition(content: string, index: number): {line: number, column: number} {
    const lines = content.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1
    };
  }

  private getContext(lines: string[], lineNumber: number, contextLines: number = 2): string {
    const start = Math.max(0, lineNumber - contextLines - 1);
    const end = Math.min(lines.length, lineNumber + contextLines);
    
    return lines.slice(start, end)
      .map((line, idx) => {
        const currentLine = start + idx + 1;
        const marker = currentLine === lineNumber ? '>' : ' ';
        return `${marker} ${currentLine}: ${line}`;
      })
      .join('\n');
  }

  private redactSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }
    
    const visibleChars = 4;
    const prefix = secret.substring(0, visibleChars);
    const suffix = secret.substring(secret.length - visibleChars);
    const redacted = '*'.repeat(Math.max(3, secret.length - (visibleChars * 2)));
    
    return `${prefix}${redacted}${suffix}`;
  }

  private shouldExcludePath(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return this.options.excludePaths.some(excludePath => 
      normalizedPath.includes(excludePath)
    );
  }

  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.(test|spec)\.[jt]sx?$/,
      /\/__tests__\//,
      /\/test\//,
      /\/tests\//,
      /\.test\./,
      /\.spec\./
    ];
    
    return testPatterns.some(pattern => pattern.test(filePath));
  }

  private groupFindingsBySeverity(findings: SecretFinding[]): Record<string, SecretFinding[]> {
    return findings.reduce((acc, finding) => {
      if (!acc[finding.severity]) {
        acc[finding.severity] = [];
      }
      acc[finding.severity].push(finding);
      return acc;
    }, {} as Record<string, SecretFinding[]>);
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: SecretPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Remove pattern by name
   */
  removePattern(name: string): void {
    this.patterns = this.patterns.filter(p => p.name !== name);
  }

  /**
   * Get all patterns
   */
  getPatterns(): SecretPattern[] {
    return [...this.patterns];
  }
}

// Export singleton instance for global use
export const defaultSecretsScanner = new SecretsScanner();