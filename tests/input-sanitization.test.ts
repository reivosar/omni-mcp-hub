import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InputSanitizer,
  InputValidator,
  InputSecurityManager,
  ValidationRule,
  SanitizationConfig
} from '../src/security/input-sanitization.js';

describe('Input Sanitization and Validation System', () => {
  describe('InputSanitizer', () => {
    let sanitizer: InputSanitizer;

    beforeEach(() => {
      sanitizer = new InputSanitizer();
    });

    describe('Basic Sanitization', () => {
      it('should sanitize string inputs', () => {
        const input = 'Hello World';
        const result = sanitizer.sanitizeString(input);
        expect(typeof result).toBe('string');
        expect(result).toBeDefined();
      });

      it('should handle non-string inputs', () => {
        const result = sanitizer.sanitizeString(123 as any);
        expect(typeof result).toBe('string');
      });

      it('should trim whitespace', () => {
        const input = '  Hello World  ';
        const result = sanitizer.sanitizeString(input);
        expect(result).not.toMatch(/^\s|\s$/);
      });

      it('should enforce length limits', () => {
        const config: Partial<SanitizationConfig> = {
          maxStringLength: 10
        };
        const limitedSanitizer = new InputSanitizer(config);
        
        const longString = 'a'.repeat(20);
        const result = limitedSanitizer.sanitizeString(longString);
        expect(result.length).toBeLessThanOrEqual(10);
      });
    });

    describe('Security Pattern Detection', () => {
      it('should detect SQL injection patterns', () => {
        const maliciousInputs = [
          "'; DROP TABLE users; --",
          "admin' OR '1'='1"
        ];

        for (const input of maliciousInputs) {
          const result = sanitizer.sanitizeString(input);
          expect(result).toContain('[SQL_BLOCKED]');
        }

        const metrics = sanitizer.getMetrics();
        expect(metrics.injectionAttemptsBlocked).toBeGreaterThan(0);
      });

      it('should detect XSS patterns', () => {
        const maliciousInputs = [
          "<script>alert('xss')</script>",
          "javascript:alert('xss')"
        ];

        for (const input of maliciousInputs) {
          const result = sanitizer.sanitizeString(input);
          // Check that the input has been processed/blocked in some way
          expect(result).toContain('BLOCKED');
        }
      });

      it('should detect command injection patterns', () => {
        const maliciousInputs = [
          "; rm -rf /",
          "| cat /etc/passwd"
        ];

        for (const input of maliciousInputs) {
          const result = sanitizer.sanitizeString(input);
          expect(result).toContain('[CMD_BLOCKED]');
        }
      });

      it('should detect path traversal patterns', () => {
        const maliciousInputs = [
          "../../../etc/passwd",
          "..\\..\\windows\\system32"
        ];

        for (const input of maliciousInputs) {
          const result = sanitizer.sanitizeString(input);
          // Check that the input has been processed/blocked in some way
          expect(result).toContain('BLOCKED');
        }
      });
    });

    describe('File Path Sanitization', () => {
      it('should sanitize safe file paths', () => {
        const safePaths = ['document.txt', 'folder/file.json'];
        
        for (const path of safePaths) {
          const result = sanitizer.sanitizeFilePath(path);
          expect(result).toBe(path);
        }
      });

      it('should reject dangerous file extensions', () => {
        const dangerousPaths = ['malware.exe', 'script.bat'];
        
        for (const path of dangerousPaths) {
          const result = sanitizer.sanitizeFilePath(path);
          expect(result).toBe('');
        }
      });
    });

    describe('Object Sanitization', () => {
      it('should sanitize nested objects', () => {
        const input = {
          name: "John",
          data: {
            query: "safe query",
            list: ["item1", "item2"]
          }
        };

        const result = sanitizer.sanitizeObject(input);
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
      });

      it('should handle depth limits', () => {
        const config: Partial<SanitizationConfig> = {
          maxObjectDepth: 2
        };
        const depthLimitedSanitizer = new InputSanitizer(config);

        const deepObject = {
          level1: {
            level2: {
              level3: { value: 'too deep' }
            }
          }
        };

        const result = depthLimitedSanitizer.sanitizeObject(deepObject) as any;
        expect(result.level1.level2.level3).toBe('[DEPTH_EXCEEDED]');
      });
    });

    describe('Metrics', () => {
      it('should track sanitization metrics', () => {
        sanitizer.sanitizeString('test input');
        
        const metrics = sanitizer.getMetrics();
        expect(metrics.sanitizationAttempts).toBeGreaterThan(0);
      });

      it('should reset metrics', () => {
        sanitizer.sanitizeString('test input');
        sanitizer.resetMetrics();
        
        const metrics = sanitizer.getMetrics();
        expect(metrics.sanitizationAttempts).toBe(0);
      });
    });
  });

  describe('InputValidator', () => {
    let validator: InputValidator;

    beforeEach(() => {
      validator = new InputValidator();
    });

    describe('String Validation', () => {
      it('should validate string types', () => {
        const rule: ValidationRule = { type: 'string', required: true };
        
        const validResult = validator.validate('test string', rule);
        expect(validResult.isValid).toBe(true);
        
        const invalidResult = validator.validate(123, rule);
        expect(invalidResult.isValid).toBe(false);
      });

      it('should validate string length', () => {
        const rule: ValidationRule = { 
          type: 'string', 
          minLength: 5, 
          maxLength: 10 
        };
        
        const validResult = validator.validate('hello', rule);
        expect(validResult.isValid).toBe(true);
        
        const shortResult = validator.validate('hi', rule);
        expect(shortResult.isValid).toBe(false);
        
        const longResult = validator.validate('this is too long', rule);
        expect(longResult.isValid).toBe(false);
      });
    });

    describe('Number Validation', () => {
      it('should validate numbers', () => {
        const rule: ValidationRule = { type: 'number' };
        
        const validResult = validator.validate(42, rule);
        expect(validResult.isValid).toBe(true);
        
        const stringNumberResult = validator.validate('123', rule);
        expect(stringNumberResult.isValid).toBe(true);
        expect(stringNumberResult.value).toBe(123);
      });

      it('should validate number ranges', () => {
        const rule: ValidationRule = { 
          type: 'number', 
          min: 10, 
          max: 100 
        };
        
        const validResult = validator.validate(50, rule);
        expect(validResult.isValid).toBe(true);
        
        const tooSmallResult = validator.validate(5, rule);
        expect(tooSmallResult.isValid).toBe(false);
      });
    });

    describe('Email Validation', () => {
      it('should validate email addresses', () => {
        const rule: ValidationRule = { type: 'email' };
        
        const validResult = validator.validate('test@example.com', rule);
        expect(validResult.isValid).toBe(true);
        
        const invalidResult = validator.validate('not an email', rule);
        expect(invalidResult.isValid).toBe(false);
      });
    });

    describe('Array Validation', () => {
      it('should validate arrays', () => {
        const rule: ValidationRule = { type: 'array' };
        
        const validResult = validator.validate([1, 2, 3], rule);
        expect(validResult.isValid).toBe(true);
        
        const invalidResult = validator.validate('not an array', rule);
        expect(invalidResult.isValid).toBe(false);
      });
    });

    describe('Object Validation', () => {
      it('should validate objects', () => {
        const rule: ValidationRule = { 
          type: 'object',
          properties: {
            name: { type: 'string', required: true },
            age: { type: 'number', min: 0 }
          }
        };
        
        const validResult = validator.validate({ name: 'John', age: 30 }, rule);
        expect(validResult.isValid).toBe(true);
      });
    });

    describe('Batch Validation', () => {
      it('should validate multiple fields', () => {
        const data = {
          name: 'John',
          age: 30,
          email: 'john@example.com'
        };
        
        const rules = {
          name: { type: 'string' as const, required: true },
          age: { type: 'number' as const, min: 0 },
          email: { type: 'email' as const }
        };
        
        const result = validator.validateBatch(data, rules);
        expect(result.isValid).toBe(true);
      });
    });

    describe('Required Fields', () => {
      it('should handle required fields', () => {
        const rule: ValidationRule = { type: 'string', required: true };
        
        const validResult = validator.validate('valid value', rule);
        expect(validResult.isValid).toBe(true);
        
        const nullResult = validator.validate(null, rule);
        expect(nullResult.isValid).toBe(false);
        expect(nullResult.errors).toContain('Value is required');
      });
    });
  });

  describe('InputSecurityManager', () => {
    let securityManager: InputSecurityManager;

    beforeEach(() => {
      securityManager = new InputSecurityManager();
    });

    afterEach(() => {
      securityManager.removeAllListeners();
    });

    it('should provide integrated sanitization and validation', () => {
      const rule: ValidationRule = { type: 'string' };
      
      const result = securityManager.validate('test input', rule);
      expect(result.isValid).toBe(true);
    });

    it('should sanitize inputs', () => {
      const maliciousInput = "'; DROP TABLE users; --";
      const result = securityManager.sanitize(maliciousInput);
      expect(typeof result).toBe('string');
    });

    it('should provide access to underlying components', () => {
      expect(securityManager.getSanitizer()).toBeDefined();
      expect(securityManager.getValidator()).toBeDefined();
    });

    it('should track security metrics', () => {
      securityManager.sanitize("test input");
      
      const metrics = securityManager.getMetrics();
      expect(metrics.sanitizationAttempts).toBeGreaterThan(0);
    });

    it('should handle batch validation', () => {
      const data = { username: 'testuser', password: 'secure123' };
      const rules = {
        username: { type: 'string' as const, minLength: 3 },
        password: { type: 'string' as const, minLength: 8 }
      };

      const result = securityManager.validateBatch(data, rules);
      expect(result.isValid).toBe(true);
    });

    it('should reset metrics', () => {
      securityManager.sanitize('test');
      securityManager.resetMetrics();

      const metrics = securityManager.getMetrics();
      expect(metrics.sanitizationAttempts).toBe(0);
    });

    it('should emit security events', (done) => {
      securityManager.on('security-violation', (data) => {
        expect(data.type).toBeDefined();
        done();
      });

      // This should trigger some security pattern
      securityManager.sanitize("'; DROP TABLE users; --");
    }, 2000);
  });

  describe('Edge Cases', () => {
    let sanitizer: InputSanitizer;
    let validator: InputValidator;

    beforeEach(() => {
      sanitizer = new InputSanitizer();
      validator = new InputValidator();
    });

    it('should handle null and undefined inputs', () => {
      expect(sanitizer.sanitizeObject(null)).toBe(null);
      expect(sanitizer.sanitizeObject(undefined)).toBe(undefined);
      
      const rule: ValidationRule = { type: 'string' };
      const result = validator.validate(null, rule);
      expect(result.isValid).toBe(true); // Not required
    });

    it('should handle empty strings', () => {
      const allowEmptyRule: ValidationRule = { 
        type: 'string', 
        allowEmpty: true 
      };
      
      const result = validator.validate('', allowEmptyRule);
      expect(result.isValid).toBe(true);
    });

    it('should handle large inputs efficiently', () => {
      const largeString = 'a'.repeat(10000);
      
      const startTime = Date.now();
      const result = sanitizer.sanitizeString(largeString);
      const endTime = Date.now();
      
      expect(typeof result).toBe('string');
      expect(endTime - startTime).toBeLessThan(1000); // Should complete quickly
    });

    it('should handle special characters', () => {
      const specialChars = '™®©±²³¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊË🚀🎉💻';
      const result = sanitizer.sanitizeString(specialChars);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle boolean conversion', () => {
      const rule: ValidationRule = { type: 'boolean' };
      
      const trueResult = validator.validate('true', rule);
      expect(trueResult.isValid).toBe(true);
      expect(trueResult.value).toBe(true);
      
      const falseResult = validator.validate('false', rule);
      expect(falseResult.isValid).toBe(true);
      expect(falseResult.value).toBe(false);
    });

    it('should handle JSON validation', () => {
      const rule: ValidationRule = { type: 'json' };
      
      const validJson = '{"name": "test", "value": 123}';
      const result = validator.validate(validJson, rule);
      
      expect(result.isValid).toBe(true);
      expect(result.value).toEqual({ name: 'test', value: 123 });
    });

    it('should validate file paths', () => {
      const rule: ValidationRule = { type: 'filepath' };
      
      const validResult = validator.validate('document.txt', rule);
      expect(validResult.isValid).toBe(true);
    });

    it('should create validation schemas', () => {
      const schema = InputValidator.createSchema({
        name: { type: 'string', required: true },
        age: { type: 'number', min: 0 }
      });
      
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    });
  });
});