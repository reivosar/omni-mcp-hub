import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaValidator } from '../../src/validation/schema-validator.js';
import { Logger } from '../../src/utils/logger.js';

vi.mock('../../src/utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    }))
  }
}));

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    const mockLogger = Logger.getInstance();
    validator = new SchemaValidator(mockLogger);
  });

  describe('constructor', () => {
    it('should create validator instance', () => {
      expect(validator).toBeInstanceOf(SchemaValidator);
    });
  });

  describe('initialize', () => {
    it('should initialize validator', async () => {
      await expect(validator.initialize()).resolves.not.toThrow();
    });
  });

  describe('validateConfig', () => {
    it('should handle non-existent config file', async () => {
      const result = await validator.validateConfig('/non/existent/path.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('root');
    });
  });
});