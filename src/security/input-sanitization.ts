/**
 * Input Sanitization and Validation System
 * Provides comprehensive input validation, sanitization, and security filtering
 */

import * as path from 'path';
import { EventEmitter } from 'events';
import { ILogger, SilentLogger } from '../utils/logger.js';

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'url' | 'filepath' | 'json' | 'regex' | 'custom';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
  sanitize?: boolean;
  custom?: (value: unknown) => ValidationResult;
  items?: ValidationRule; // For arrays
  properties?: Record<string, ValidationRule>; // For objects
  allowAdditionalProperties?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  value?: unknown;
  errors: string[];
  warnings: string[];
}

export interface SanitizationConfig {
  enableHtmlEscape: boolean;
  enableSqlInjectionPrevention: boolean;
  enableXssProtection: boolean;
  enableCommandInjectionPrevention: boolean;
  enablePathTraversalPrevention: boolean;
  maxStringLength: number;
  maxObjectDepth: number;
  allowedFileExtensions: string[];
  blockedPatterns: RegExp[];
  customSanitizers: Array<(input: string) => string>;
}

export interface SecurityMetrics {
  validationAttempts: number;
  validationFailures: number;
  sanitizationAttempts: number;
  injectionAttemptsBlocked: number;
  pathTraversalAttemptsBlocked: number;
  xssAttemptsBlocked: number;
  lastValidationTime?: Date;
  suspiciousPatterns: Array<{
    pattern: string;
    count: number;
    lastSeen: Date;
  }>;
}

export class InputSanitizer extends EventEmitter {
  private config: SanitizationConfig;
  private logger: ILogger;
  private metrics: SecurityMetrics;

  // Common injection patterns
  private readonly SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)|('|(\\|;|--|\/\*|\*\/))/gi,
    /((%27)|('))(.*)((%27)|('))/gi,
    /exec(\s|\+)+(s|x)p\w+/gi,
    /union.*(select|all|from)/gi
  ];

  private readonly XSS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /expression\s*\(/gi,
    /<style[^>]*>.*?<\/style>/gi
  ];

  private readonly COMMAND_INJECTION_PATTERNS = [
    /[;&|`$<>]/g,
    /\b(rm|del|format|shutdown|reboot|kill|ps|ls|dir|cat|type|more|less|head|tail|grep|find|locate)\b/gi,
    /\|\s*(curl|wget|nc|netcat|telnet|ssh|scp|rsync)/gi,
    /(>|>>|\||&|;|`|\$\(|\${)/g
  ];

  private readonly PATH_TRAVERSAL_PATTERNS = [
    /\.\.[/\\]/g,
    /[/\\]\.\.[/\\]/g,
    /%2e%2e[/\\]/gi,
    /\.{2,}[/\\]/g,
    /[/\\]\.{2,}/g
  ];

  constructor(config?: Partial<SanitizationConfig>, logger?: ILogger) {
    super();
    this.logger = logger || new SilentLogger();
    
    this.config = {
      enableHtmlEscape: true,
      enableSqlInjectionPrevention: true,
      enableXssProtection: true,
      enableCommandInjectionPrevention: true,
      enablePathTraversalPrevention: true,
      maxStringLength: 10000,
      maxObjectDepth: 10,
      allowedFileExtensions: ['.txt', '.json', '.yaml', '.yml', '.md', '.csv'],
      blockedPatterns: [],
      customSanitizers: [],
      ...config
    };

    this.metrics = {
      validationAttempts: 0,
      validationFailures: 0,
      sanitizationAttempts: 0,
      injectionAttemptsBlocked: 0,
      pathTraversalAttemptsBlocked: 0,
      xssAttemptsBlocked: 0,
      suspiciousPatterns: []
    };
  }

  /**
   * Sanitize a string input
   */
  sanitizeString(input: string): string {
    if (typeof input !== 'string') {
      return String(input);
    }

    this.metrics.sanitizationAttempts++;
    let sanitized = input;

    try {
      // Trim whitespace
      sanitized = sanitized.trim();

      // Length check
      if (sanitized.length > this.config.maxStringLength) {
        sanitized = sanitized.substring(0, this.config.maxStringLength);
        this.logger.warn(`String truncated to ${this.config.maxStringLength} characters`);
      }

      // SQL injection prevention (before HTML escaping to catch raw patterns)
      if (this.config.enableSqlInjectionPrevention) {
        sanitized = this.preventSqlInjection(sanitized);
      }

      // XSS protection (before HTML escaping to catch raw patterns)
      if (this.config.enableXssProtection) {
        sanitized = this.preventXss(sanitized);
      }

      // Command injection prevention (before HTML escaping)
      if (this.config.enableCommandInjectionPrevention) {
        sanitized = this.preventCommandInjection(sanitized);
      }

      // Path traversal prevention (before HTML escaping)
      if (this.config.enablePathTraversalPrevention) {
        sanitized = this.preventPathTraversal(sanitized);
      }

      // HTML escape (after security checks to avoid interfering with pattern matching)
      if (this.config.enableHtmlEscape) {
        sanitized = this.escapeHtml(sanitized);
      }

      // Custom sanitizers
      for (const customSanitizer of this.config.customSanitizers) {
        sanitized = customSanitizer(sanitized);
      }

      // Check for blocked patterns
      for (const pattern of this.config.blockedPatterns) {
        if (pattern.test(sanitized)) {
          this.recordSuspiciousPattern(pattern.toString());
          sanitized = sanitized.replace(pattern, '[BLOCKED]');
        }
      }

      return sanitized;
    } catch (error) {
      this.logger.error('Error during string sanitization:', error);
      return '[SANITIZATION_ERROR]';
    }
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  private preventSqlInjection(input: string): string {
    let sanitized = input;
    let detected = false;

    for (const pattern of this.SQL_INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        detected = true;
        sanitized = sanitized.replace(pattern, '[SQL_BLOCKED]');
      }
    }

    if (detected) {
      this.metrics.injectionAttemptsBlocked++;
      this.emit('injection-attempt', { type: 'sql', input, sanitized });
      this.logger.warn('SQL injection attempt detected and blocked');
    }

    return sanitized;
  }

  private preventXss(input: string): string {
    let sanitized = input;
    let detected = false;

    for (const pattern of this.XSS_PATTERNS) {
      if (pattern.test(sanitized)) {
        detected = true;
        sanitized = sanitized.replace(pattern, '[XSS_BLOCKED]');
      }
    }

    if (detected) {
      this.metrics.xssAttemptsBlocked++;
      this.emit('xss-attempt', { input, sanitized });
      this.logger.warn('XSS attempt detected and blocked');
    }

    return sanitized;
  }

  private preventCommandInjection(input: string): string {
    let sanitized = input;
    let detected = false;

    for (const pattern of this.COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        detected = true;
        sanitized = sanitized.replace(pattern, '[CMD_BLOCKED]');
      }
    }

    if (detected) {
      this.metrics.injectionAttemptsBlocked++;
      this.emit('command-injection-attempt', { input, sanitized });
      this.logger.warn('Command injection attempt detected and blocked');
    }

    return sanitized;
  }

  private preventPathTraversal(input: string): string {
    let sanitized = input;
    let detected = false;

    for (const pattern of this.PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(sanitized)) {
        detected = true;
        sanitized = sanitized.replace(pattern, '[PATH_BLOCKED]');
      }
    }

    if (detected) {
      this.metrics.pathTraversalAttemptsBlocked++;
      this.emit('path-traversal-attempt', { input, sanitized });
      this.logger.warn('Path traversal attempt detected and blocked');
    }

    return sanitized;
  }

  private recordSuspiciousPattern(pattern: string): void {
    const existing = this.metrics.suspiciousPatterns.find(p => p.pattern === pattern);
    if (existing) {
      existing.count++;
      existing.lastSeen = new Date();
    } else {
      this.metrics.suspiciousPatterns.push({
        pattern,
        count: 1,
        lastSeen: new Date()
      });
    }
  }

  /**
   * Sanitize file path
   */
  sanitizeFilePath(filePath: string): string {
    if (typeof filePath !== 'string') {
      return '';
    }

    let sanitized = filePath.trim();

    // Normalize path
    sanitized = path.normalize(sanitized);

    // Remove path traversal attempts
    sanitized = this.preventPathTraversal(sanitized);

    // Check file extension
    const ext = path.extname(sanitized).toLowerCase();
    if (this.config.allowedFileExtensions.length > 0 && !this.config.allowedFileExtensions.includes(ext)) {
      this.logger.warn(`File extension ${ext} not allowed`);
      return '';
    }

    return sanitized;
  }

  /**
   * Sanitize object recursively
   */
  sanitizeObject(obj: unknown, depth: number = 0): unknown {
    if (depth > this.config.maxObjectDepth) {
      this.logger.warn(`Object depth exceeded limit of ${this.config.maxObjectDepth}`);
      return '[DEPTH_EXCEEDED]';
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, depth + 1));
    }

    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value, depth + 1);
      }
      return sanitized;
    }

    return String(obj);
  }

  /**
   * Get security metrics
   */
  getMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      validationAttempts: 0,
      validationFailures: 0,
      sanitizationAttempts: 0,
      injectionAttemptsBlocked: 0,
      pathTraversalAttemptsBlocked: 0,
      xssAttemptsBlocked: 0,
      suspiciousPatterns: []
    };
  }
}

export class InputValidator extends EventEmitter {
  private logger: ILogger;
  private sanitizer: InputSanitizer;

  constructor(sanitizer?: InputSanitizer, logger?: ILogger) {
    super();
    this.logger = logger || new SilentLogger();
    this.sanitizer = sanitizer || new InputSanitizer();
  }

  /**
   * Validate input against a rule
   */
  validate(value: unknown, rule: ValidationRule): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      value,
      errors: [],
      warnings: []
    };

    try {
      // Check if required
      if (rule.required && (value === null || value === undefined)) {
        result.errors.push('Value is required');
        result.isValid = false;
        return result;
      }

      // Skip validation for null/undefined if not required
      if (value === null || value === undefined) {
        return result;
      }

      // Sanitize if requested
      if (rule.sanitize) {
        result.value = this.sanitizer.sanitizeObject(value);
        value = result.value;
      }

      // Type-specific validation
      switch (rule.type) {
        case 'string':
          return this.validateString(value, rule, result);
        case 'number':
          return this.validateNumber(value, rule, result);
        case 'boolean':
          return this.validateBoolean(value, rule, result);
        case 'array':
          return this.validateArray(value, rule, result);
        case 'object':
          return this.validateObject(value, rule, result);
        case 'email':
          return this.validateEmail(value, rule, result);
        case 'url':
          return this.validateUrl(value, rule, result);
        case 'filepath':
          return this.validateFilePath(value, rule, result);
        case 'json':
          return this.validateJson(value, rule, result);
        case 'regex':
          return this.validateRegex(value, rule, result);
        case 'custom':
          return rule.custom ? rule.custom(value) : result;
        default:
          result.errors.push(`Unknown validation type: ${rule.type}`);
          result.isValid = false;
      }

      return result;
    } catch (error) {
      result.errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.isValid = false;
      return result;
    }
  }

  private validateString(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    if (typeof value !== 'string') {
      result.errors.push('Value must be a string');
      result.isValid = false;
      return result;
    }

    const str = value as string;

    // Empty string check
    if (!rule.allowEmpty && str.length === 0) {
      result.errors.push('String cannot be empty');
      result.isValid = false;
    }

    // Length checks
    if (rule.minLength !== undefined && str.length < rule.minLength) {
      result.errors.push(`String must be at least ${rule.minLength} characters long`);
      result.isValid = false;
    }

    if (rule.maxLength !== undefined && str.length > rule.maxLength) {
      result.errors.push(`String must not exceed ${rule.maxLength} characters`);
      result.isValid = false;
    }

    // Pattern check
    if (rule.pattern && !rule.pattern.test(str)) {
      result.errors.push('String does not match required pattern');
      result.isValid = false;
    }

    return result;
  }

  private validateNumber(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    const num = Number(value);
    if (isNaN(num)) {
      result.errors.push('Value must be a number');
      result.isValid = false;
      return result;
    }

    result.value = num;

    if (rule.min !== undefined && num < rule.min) {
      result.errors.push(`Number must be at least ${rule.min}`);
      result.isValid = false;
    }

    if (rule.max !== undefined && num > rule.max) {
      result.errors.push(`Number must not exceed ${rule.max}`);
      result.isValid = false;
    }

    return result;
  }

  private validateBoolean(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    if (typeof value === 'boolean') {
      return result;
    }

    if (typeof value === 'string') {
      const lowerStr = value.toLowerCase();
      if (lowerStr === 'true' || lowerStr === '1' || lowerStr === 'yes') {
        result.value = true;
        return result;
      }
      if (lowerStr === 'false' || lowerStr === '0' || lowerStr === 'no') {
        result.value = false;
        return result;
      }
    }

    result.errors.push('Value must be a boolean');
    result.isValid = false;
    return result;
  }

  private validateArray(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    if (!Array.isArray(value)) {
      result.errors.push('Value must be an array');
      result.isValid = false;
      return result;
    }

    const arr = value as unknown[];

    // Length checks
    if (rule.minLength !== undefined && arr.length < rule.minLength) {
      result.errors.push(`Array must contain at least ${rule.minLength} items`);
      result.isValid = false;
    }

    if (rule.maxLength !== undefined && arr.length > rule.maxLength) {
      result.errors.push(`Array must not contain more than ${rule.maxLength} items`);
      result.isValid = false;
    }

    // Validate items if rule specified
    if (rule.items) {
      const validatedItems = [];
      let hasErrors = false;

      for (let i = 0; i < arr.length; i++) {
        const itemResult = this.validate(arr[i], rule.items);
        validatedItems.push(itemResult.value);

        if (!itemResult.isValid) {
          hasErrors = true;
          result.errors.push(`Item ${i}: ${itemResult.errors.join(', ')}`);
        }
      }

      if (hasErrors) {
        result.isValid = false;
      }

      result.value = validatedItems;
    }

    return result;
  }

  private validateObject(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      result.errors.push('Value must be an object');
      result.isValid = false;
      return result;
    }

    const obj = value as Record<string, unknown>;
    const validatedObj: Record<string, unknown> = {};

    if (rule.properties) {
      // Validate defined properties
      for (const [propName, propRule] of Object.entries(rule.properties)) {
        const propResult = this.validate(obj[propName], propRule);
        validatedObj[propName] = propResult.value;

        if (!propResult.isValid) {
          result.isValid = false;
          result.errors.push(`Property '${propName}': ${propResult.errors.join(', ')}`);
        }
      }

      // Check for additional properties
      if (!rule.allowAdditionalProperties) {
        for (const key of Object.keys(obj)) {
          if (!(key in rule.properties)) {
            result.warnings.push(`Unexpected property '${key}' will be ignored`);
          }
        }
      } else {
        // Copy additional properties
        for (const [key, val] of Object.entries(obj)) {
          if (!(key in rule.properties)) {
            validatedObj[key] = val;
          }
        }
      }

      result.value = validatedObj;
    }

    return result;
  }

  private validateEmail(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    if (typeof value !== 'string') {
      result.errors.push('Email must be a string');
      result.isValid = false;
      return result;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      result.errors.push('Invalid email format');
      result.isValid = false;
    }

    return result;
  }

  private validateUrl(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    if (typeof value !== 'string') {
      result.errors.push('URL must be a string');
      result.isValid = false;
      return result;
    }

    try {
      new URL(value);
    } catch {
      result.errors.push('Invalid URL format');
      result.isValid = false;
    }

    return result;
  }

  private validateFilePath(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    if (typeof value !== 'string') {
      result.errors.push('File path must be a string');
      result.isValid = false;
      return result;
    }

    const sanitizedPath = this.sanitizer.sanitizeFilePath(value);
    if (sanitizedPath === '') {
      result.errors.push('Invalid or unsafe file path');
      result.isValid = false;
    } else {
      result.value = sanitizedPath;
    }

    return result;
  }

  private validateJson(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    if (typeof value === 'object') {
      return result; // Already parsed
    }

    if (typeof value !== 'string') {
      result.errors.push('JSON must be a string or object');
      result.isValid = false;
      return result;
    }

    try {
      const parsed = JSON.parse(value);
      result.value = parsed;
    } catch {
      result.errors.push('Invalid JSON format');
      result.isValid = false;
    }

    return result;
  }

  private validateRegex(value: unknown, rule: ValidationRule, result: ValidationResult): ValidationResult {
    if (typeof value !== 'string') {
      result.errors.push('Value must be a string for regex validation');
      result.isValid = false;
      return result;
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      result.errors.push('Value does not match required pattern');
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate multiple values against rules
   */
  validateBatch(data: Record<string, unknown>, rules: Record<string, ValidationRule>): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      value: {},
      errors: [],
      warnings: []
    };

    const validatedData: Record<string, unknown> = {};

    for (const [key, rule] of Object.entries(rules)) {
      const fieldResult = this.validate(data[key], rule);
      validatedData[key] = fieldResult.value;

      if (!fieldResult.isValid) {
        result.isValid = false;
        result.errors.push(`Field '${key}': ${fieldResult.errors.join(', ')}`);
      }

      result.warnings.push(...fieldResult.warnings);
    }

    result.value = validatedData;
    return result;
  }

  /**
   * Create validation schema
   */
  static createSchema(properties: Record<string, ValidationRule>): ValidationRule {
    return {
      type: 'object',
      properties,
      allowAdditionalProperties: false
    };
  }
}

// Combined input security manager
export class InputSecurityManager extends EventEmitter {
  private sanitizer: InputSanitizer;
  private validator: InputValidator;
  private logger: ILogger;

  constructor(config?: Partial<SanitizationConfig>, logger?: ILogger) {
    super();
    this.logger = logger || new SilentLogger();
    this.sanitizer = new InputSanitizer(config, logger);
    this.validator = new InputValidator(this.sanitizer, logger);

    // Forward events
    this.sanitizer.on('injection-attempt', (data) => this.emit('security-violation', { type: 'injection', ...data }));
    this.sanitizer.on('xss-attempt', (data) => this.emit('security-violation', { type: 'xss', ...data }));
    this.sanitizer.on('command-injection-attempt', (data) => this.emit('security-violation', { type: 'command-injection', ...data }));
    this.sanitizer.on('path-traversal-attempt', (data) => this.emit('security-violation', { type: 'path-traversal', ...data }));
  }

  /**
   * Sanitize input
   */
  sanitize(input: unknown): unknown {
    return this.sanitizer.sanitizeObject(input);
  }

  /**
   * Validate input
   */
  validate(value: unknown, rule: ValidationRule): ValidationResult {
    return this.validator.validate(value, rule);
  }

  /**
   * Sanitize and validate input
   */
  sanitizeAndValidate(value: unknown, rule: ValidationRule): ValidationResult {
    const sanitized = this.sanitizer.sanitizeObject(value);
    return this.validator.validate(sanitized, rule);
  }

  /**
   * Validate batch data
   */
  validateBatch(data: Record<string, unknown>, rules: Record<string, ValidationRule>): ValidationResult {
    return this.validator.validateBatch(data, rules);
  }

  /**
   * Get comprehensive security metrics
   */
  getMetrics(): SecurityMetrics {
    return this.sanitizer.getMetrics();
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.sanitizer.resetMetrics();
  }

  /**
   * Get sanitizer instance
   */
  getSanitizer(): InputSanitizer {
    return this.sanitizer;
  }

  /**
   * Get validator instance
   */
  getValidator(): InputValidator {
    return this.validator;
  }
}