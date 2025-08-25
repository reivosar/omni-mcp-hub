import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FailFastValidator } from '../../src/validation/fail-fast.js';
import { SchemaValidator } from '../../src/validation/schema-validator.js';
import { Logger } from '../../src/utils/logger.js';

vi.mock('../../src/validation/schema-validator.js');
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

const mockValidator = {
  initialize: vi.fn(),
  validateConfig: vi.fn()
};

describe('FailFastValidator', () => {
  let validator: FailFastValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(SchemaValidator).mockImplementation(() => mockValidator as any);
    validator = new FailFastValidator();
  });

  describe('constructor', () => {
    it('should create validator instance', () => {
      expect(validator).toBeInstanceOf(FailFastValidator);
    });
  });

  describe('validateOnly', () => {
    it('should validate without exiting', async () => {
      const mockResult = {
        valid: true,
        errors: [],
        warnings: [],
        config: { mode: 'minimal' }
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      const result = await validator.validateOnly('test-config.yaml');

      expect(result.valid).toBe(true);
      expect(mockValidator.initialize).toHaveBeenCalled();
      expect(mockValidator.validateConfig).toHaveBeenCalledWith('test-config.yaml');
    });
  });

  describe('generateDoctorReport', () => {
    it('should generate basic report', async () => {
      const mockResult = {
        valid: true,
        errors: [],
        warnings: [],
        config: { mode: 'minimal' }
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      const report = await validator.generateDoctorReport('test-config.yaml');

      expect(report).toContain('Configuration Doctor');
      expect(typeof report).toBe('string');
    });
  });
});