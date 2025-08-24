/**
 * Tests for fail-fast configuration validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FailFastValidator, validateConfigOnStartup, runConfigDoctor } from '../fail-fast.js';
import { SchemaValidator } from '../schema-validator.js';
import { Logger } from '../../utils/logger.js';
import * as process from 'process';

// Mock dependencies
vi.mock('../schema-validator.js');
vi.mock('../../utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn()
  },
  ILogger: {}
}));
vi.mock('chalk', () => ({
  default: {
    red: {
      bold: vi.fn((text) => text),
      _: vi.fn((text) => text)
    },
    green: vi.fn((text) => text),
    yellow: {
      bold: vi.fn((text) => text),
      _: vi.fn((text) => text)
    },
    blue: {
      bold: vi.fn((text) => text),
      _: vi.fn((text) => text)
    },
    cyan: vi.fn((text) => text),
    gray: vi.fn((text) => text)
  }
}));

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
  setLevel: vi.fn(),
  isEnabled: vi.fn(() => true),
  // Add other Logger properties/methods to satisfy the type
  winstonLogger: {},
  currentLevel: 'info' as const,
  enabled: true,
  config: {},
  levels: {}
} as unknown as Logger;

const mockValidator = {
  initialize: vi.fn(),
  validateConfig: vi.fn()
};

describe('FailFastValidator', () => {
  let validator: FailFastValidator;
  let exitSpy: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'getInstance').mockReturnValue(mockLogger);
    vi.mocked(SchemaValidator).mockImplementation(() => mockValidator as unknown as SchemaValidator);
    
    // Mock process.exit without actually exiting
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as unknown as (code?: string | number | null) => never);
    
    validator = new FailFastValidator();
  });

  afterEach(() => {
    (exitSpy as ReturnType<typeof vi.spyOn>)?.mockRestore?.();
  });

  describe('validateStartup', () => {
    it('should pass validation for valid config', async () => {
      const mockResult = {
        valid: true,
        errors: [],
        warnings: [],
        config: {
          mode: 'minimal',
          preset: 'claude-basic',
          logging: { level: 'info' }
        }
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      const result = await validator.validateStartup({
        configPath: 'test-config.yaml',
        exitOnError: false
      });

      expect(result.valid).toBe(true);
      expect(mockValidator.initialize).toHaveBeenCalled();
      expect(mockValidator.validateConfig).toHaveBeenCalledWith('test-config.yaml');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('SUCCESS Configuration validation passed'));
    });

    it('should fail validation and exit on invalid config', async () => {
      const mockResult = {
        valid: false,
        errors: [
          {
            field: 'mode',
            message: 'Invalid mode value',
            suggestedFix: 'Use minimal, standard, or advanced'
          }
        ],
        warnings: []
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      await expect(validator.validateStartup({
        configPath: 'test-config.yaml',
        exitOnError: true
      })).rejects.toThrow('process.exit called');

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('ALERT Configuration Validation Errors:'));
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('ERROR Configuration validation failed'));
    });

    it('should not exit when exitOnError is false', async () => {
      const mockResult = {
        valid: false,
        errors: [
          {
            field: 'mode',
            message: 'Invalid mode value',
            line: 5,
            column: 10,
            suggestedFix: 'Use minimal, standard, or advanced',
            value: 'invalid'
          }
        ],
        warnings: []
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      const result = await validator.validateStartup({
        configPath: 'test-config.yaml',
        exitOnError: false
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should display warnings when showWarnings is true', async () => {
      const mockResult = {
        valid: true,
        errors: [],
        warnings: [
          {
            field: 'logging.level',
            message: 'Consider using info level for production',
            suggestedFix: 'Set logging.level to info'
          }
        ],
        config: { mode: 'minimal' }
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      await validator.validateStartup({
        configPath: 'test-config.yaml',
        showWarnings: true,
        exitOnError: false
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('WARNING  Configuration Warnings:'));
    });

    it('should handle validation exceptions', async () => {
      const error = new Error('Schema validation failed');
      mockValidator.initialize.mockRejectedValue(error);

      await expect(validator.validateStartup({
        configPath: 'test-config.yaml',
        exitOnError: true
      })).rejects.toThrow('process.exit called');

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL Fatal configuration error'));
    });

    it('should display configuration summary for detailed output', async () => {
      const mockResult = {
        valid: true,
        errors: [],
        warnings: [],
        config: {
          mode: 'advanced',
          preset: 'claude-enterprise',
          autoLoad: {
            profiles: [
              { name: 'default', path: './CLAUDE.md' },
              { name: 'dev', path: './dev-config.md' }
            ]
          },
          externalServers: {
            enabled: true,
            servers: [
              { name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] }
            ]
          },
          logging: { level: 'debug' }
        }
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      await validator.validateStartup({
        configPath: 'test-config.yaml',
        exitOnError: false,
        detailedOutput: true
      });

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('LIST Configuration Summary:'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Mode: advanced'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Preset: claude-enterprise'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Profiles: 2 configured'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('External Servers: 1 configured'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Log Level: debug'));
    });
  });

  describe('validateOnly', () => {
    it('should validate without exiting or detailed output', async () => {
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
      expect(process.exit).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('SUCCESS Configuration validation passed'));
    });
  });

  describe('generateDoctorReport', () => {
    it('should generate healthy status report', async () => {
      const mockResult = {
        valid: true,
        errors: [],
        warnings: [],
        config: { mode: 'minimal' }
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      const report = await validator.generateDoctorReport('test-config.yaml');

      expect(report).toContain('INSIGHTS Omni MCP Hub Configuration Doctor');
      expect(report).toContain('SUCCESS Status: HEALTHY');
      expect(report).toContain(' Your configuration is in perfect health!');
    });

    it('should generate report with critical issues', async () => {
      const mockResult = {
        valid: false,
        errors: [
          {
            field: 'externalServers.servers[0].command',
            message: 'Command cannot be empty',
            suggestedFix: 'Provide a valid command path'
          }
        ],
        warnings: [],
        config: null
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      const report = await validator.generateDoctorReport('test-config.yaml');

      expect(report).toContain('ERROR Status: REQUIRES ATTENTION');
      expect(report).toContain('ALERT Critical Issues:');
      expect(report).toContain('💊 Treatment: Provide a valid command path');
      expect(report).toContain(' Configuration needs immediate attention');
    });

    it('should generate report with recommendations only', async () => {
      const mockResult = {
        valid: true,
        errors: [],
        warnings: [
          {
            field: 'logging.level',
            message: 'Consider using info level',
            suggestedFix: 'Set logging.level to info for better performance'
          }
        ],
        config: { mode: 'standard' }
      };

      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      const report = await validator.generateDoctorReport('test-config.yaml');

      expect(report).toContain('SUCCESS Status: HEALTHY');
      expect(report).toContain('WARNING  Recommendations:');
      expect(report).toContain('INFO Suggestion: Set logging.level to info for better performance');
      expect(report).toContain('NEW Configuration is valid but could be optimized');
    });

    it('should handle doctor analysis errors', async () => {
      const error = new Error('Cannot read config file');
      mockValidator.initialize.mockRejectedValue(error);

      const report = await validator.generateDoctorReport('missing-config.yaml');

      expect(report).toContain('CRITICAL Doctor failed to analyze configuration');
    });
  });
});

describe('Convenience Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'getInstance').mockReturnValue(mockLogger);
    vi.mocked(SchemaValidator).mockImplementation(() => mockValidator as unknown as SchemaValidator);
  });

  describe('validateConfigOnStartup', () => {
    it('should create validator and call validateStartup', async () => {
      const mockResult = { valid: true, errors: [], warnings: [] };
      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      const result = await validateConfigOnStartup({
        configPath: 'test.yaml',
        exitOnError: false,
        logger: mockLogger
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('runConfigDoctor', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should generate and display doctor report', async () => {
      const mockResult = { valid: true, errors: [], warnings: [] };
      mockValidator.initialize.mockResolvedValue(undefined);
      mockValidator.validateConfig.mockResolvedValue(mockResult);

      await runConfigDoctor('test-config.yaml', mockLogger);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('INSIGHTS Omni MCP Hub Configuration Doctor'));
    });
  });
});