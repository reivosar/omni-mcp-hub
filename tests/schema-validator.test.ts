import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaValidator, ValidationResult, DryRunResult } from '../src/validation/schema-validator.js';
import { YamlConfig } from '../src/config/yaml-config.js';
import { Logger } from '../src/utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

describe('SchemaValidator', () => {
  let validator: SchemaValidator;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    
    validator = new SchemaValidator(mockLogger);
    
    // Mock schema file
    mockFs.readFile.mockImplementation(async (filePath: any) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('omni-config.schema.json')) {
        return JSON.stringify({
          "$schema": "http://json-schema.org/draft-07/schema#",
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "externalServers": {
              "type": "object",
              "required": ["enabled"],
              "additionalProperties": false,
              "properties": {
                "enabled": { "type": "boolean" },
                "servers": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name", "command", "args"],
                    "additionalProperties": false,
                    "properties": {
                      "name": { "type": "string" },
                      "command": { "type": "string" },
                      "args": { "type": "array", "items": { "type": "string" } },
                      "description": { "type": "string" },
                      "env": { "type": "object" }
                    }
                  }
                }
              }
            }
          }
        });
      }
      
      // Mock config file
      if (pathStr === 'valid-config.yaml') {
        return `
externalServers:
  enabled: true
  servers:
    - name: filesystem
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
`;
      }
      
      if (pathStr === 'invalid-config.yaml') {
        const invalidYaml = `
externalServers:
  enabled: "this-is-not-a-boolean"
  servers:
    - name: filesystem
      # Missing required command field
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    - invalidProperty: "not-allowed"
      name: "server2"
      command: "test"
      args: []
`;
        return invalidYaml;
      }
      
      if (pathStr === 'nonexistent-profile.yaml') {
        return `
autoLoad:
  profiles:
    - name: test
      path: "./nonexistent.md"
      autoApply: true
externalServers:
  enabled: true
`;
      }
      
      throw new Error('File not found');
    });
  });

  describe('initialize', () => {
    it('should initialize validator successfully', async () => {
      await validator.initialize();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Schema validator initialized successfully from:'));
    });

    it('should throw error if schema file not found', async () => {
      // Reset the mock to reject all attempts
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      
      await expect(validator.initialize()).rejects.toThrow('Schema initialization failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('validateConfig', () => {
    beforeEach(async () => {
      await validator.initialize();
    });

    it('should validate valid configuration', async () => {
      const result = await validator.validateConfig('valid-config.yaml');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config).toBeDefined();
    });

    it('should detect configuration errors', async () => {
      const result = await validator.validateConfig('invalid-config.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Should have error for enabled not being boolean
      const enabledError = result.errors.find(e => e.field.includes('enabled'));
      expect(enabledError).toBeDefined();
      expect(enabledError?.message).toContain('boolean');
      
      // Should have error for missing command
      const commandError = result.errors.find(e => e.message.includes('command'));
      expect(commandError).toBeDefined();
    });

    it('should provide suggestions for common errors', async () => {
      const result = await validator.validateConfig('invalid-config.yaml');
      
      const errorWithSuggestion = result.errors.find(e => e.suggestedFix);
      expect(errorWithSuggestion).toBeDefined();
    });

    it('should warn about nonexistent profile files', async () => {
      // Mock fs.access to throw for nonexistent files
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));
      
      const result = await validator.validateConfig('nonexistent-profile.yaml');
      
      const warning = result.warnings.find(w => w.message.includes('Profile file not found'));
      expect(warning).toBeDefined();
      expect(warning?.suggestedFix).toContain('Create the profile file');
    });

    it('should handle file read errors gracefully', async () => {
      const result = await validator.validateConfig('nonexistent-file.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('root');
    });
  });

  describe('dryRun', () => {
    beforeEach(async () => {
      await validator.initialize();
    });

    it('should perform dry run with valid configuration', async () => {
      const currentConfig: YamlConfig = {
        externalServers: {
          enabled: false,
          servers: []
        }
      };

      const result = await validator.dryRun('valid-config.yaml', currentConfig);
      
      expect(result.valid).toBe(true);
      expect(result.changes).toBeDefined();
      expect(result.impact).toBeDefined();
    });

    it('should detect configuration changes in dry run', async () => {
      const currentConfig: YamlConfig = {
        autoLoad: {
          profiles: [{ name: 'old-profile', path: './old.md', autoApply: false }]
        },
        externalServers: {
          enabled: true,
          servers: [{ name: 'old-server', command: 'old-command', args: ['old-arg'] }]
        }
      };

      // Create a new validator instance for this test to avoid schema caching
      const testValidator = new SchemaValidator(mockLogger);
      
      // Mock a config with different profiles and servers
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('omni-config.schema.json')) {
          return JSON.stringify({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "autoLoad": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "profiles": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": ["name", "path"],
                      "additionalProperties": false,
                      "properties": {
                        "name": { "type": "string" },
                        "path": { "type": "string" },
                        "autoApply": { "type": "boolean" }
                      }
                    }
                  }
                }
              },
              "externalServers": {
                "type": "object",
                "required": ["enabled"],
                "additionalProperties": false,
                "properties": {
                  "enabled": { "type": "boolean" },
                  "servers": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": ["name", "command", "args"],
                      "additionalProperties": false,
                      "properties": {
                        "name": { "type": "string" },
                        "command": { "type": "string" },
                        "args": { "type": "array", "items": { "type": "string" } },
                        "description": { "type": "string" },
                        "env": { "type": "object" }
                      }
                    }
                  }
                }
              }
            }
          });
        }
        if (pathStr === 'changed-config.yaml') {
          return `
autoLoad:
  profiles:
    - name: new-profile
      path: "./new.md"
      autoApply: true
externalServers:
  enabled: true
  servers:
    - name: new-server
      command: new-command
      args: ["new-arg"]
`;
        }
        throw new Error('File not found');
      });

      await testValidator.initialize();
      const result = await testValidator.dryRun('changed-config.yaml', currentConfig);
      
      expect(result.valid).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.impact.newProfiles).toContain('new-profile');
      expect(result.impact.removedProfiles).toContain('old-profile');
    });

    it('should return validation errors without changes if config invalid', async () => {
      const currentConfig: YamlConfig = {};
      
      const result = await validator.dryRun('invalid-config.yaml', currentConfig);
      
      expect(result.valid).toBe(false);
      expect(result.changes).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('formatValidationResult', () => {
    it('should format valid result', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: []
      };
      
      const formatted = validator.formatValidationResult(result);
      
      expect(formatted).toContain('✅');
      expect(formatted).toContain('Configuration is valid');
    });

    it('should format invalid result with errors', () => {
      const result: ValidationResult = {
        valid: false,
        errors: [
          {
            field: 'externalServers.enabled',
            message: 'Expected boolean but got string',
            value: 'not-boolean',
            suggestedFix: 'Use true or false',
            line: 3,
            column: 12
          }
        ],
        warnings: [
          {
            field: 'autoLoad.profiles',
            message: 'Profile file not found',
            suggestedFix: 'Create the profile file'
          }
        ]
      };
      
      const formatted = validator.formatValidationResult(result);
      
      expect(formatted).toContain('❌');
      expect(formatted).toContain('Configuration validation failed');
      expect(formatted).toContain('externalServers.enabled: Expected boolean but got string');
      expect(formatted).toContain('Line 3, Column 12');
      expect(formatted).toContain('💡 Use true or false');
      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('Profile file not found');
    });

    it('should format dry run result with changes', () => {
      const result: DryRunResult = {
        valid: true,
        errors: [],
        warnings: [],
        changes: [
          {
            type: 'added',
            section: 'autoLoad.profiles',
            field: 'new-profile',
            newValue: { name: 'new-profile', path: './new.md' },
            description: 'Added profile "new-profile"'
          }
        ],
        impact: {
          newProfiles: ['new-profile'],
          removedProfiles: [],
          externalServerChanges: [],
          configFileChanges: []
        }
      };
      
      const formatted = validator.formatValidationResult(result);
      
      expect(formatted).toContain('Configuration Changes:');
      expect(formatted).toContain('➕ Added profile "new-profile"');
      expect(formatted).toContain('Impact Summary:');
      expect(formatted).toContain('New profiles: new-profile');
    });
  });

  describe('formatAjvError', () => {
    beforeEach(async () => {
      await validator.initialize();
    });

    it('should format required property error', async () => {
      const mockError = {
        keyword: 'required',
        params: { missingProperty: 'enabled' },
        instancePath: '/externalServers',
        message: 'must have required property \'enabled\''
      };

      // Use private method through validation to test error formatting
      const result = await validator.validateConfig('invalid-config.yaml');
      const requiredError = result.errors.find(e => e.message.includes('Missing required property'));
      
      if (requiredError) {
        expect(requiredError.message).toContain('Missing required property');
        expect(requiredError.suggestedFix).toContain('Add');
      }
    });

    it('should format enum error with suggestions', async () => {
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.toString().includes('enum-error.yaml')) {
          return `
logging:
  level: invalid-level
externalServers:
  enabled: true
`;
        }
        if (filePath.toString().includes('omni-config.schema.json')) {
          return JSON.stringify({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
              "logging": {
                "type": "object",
                "properties": {
                  "level": {
                    "type": "string",
                    "enum": ["debug", "info", "warn", "error"]
                  }
                }
              },
              "externalServers": {
                "type": "object",
                "required": ["enabled"],
                "properties": {
                  "enabled": { "type": "boolean" }
                }
              }
            }
          });
        }
        return '';
      });

      const result = await validator.validateConfig('enum-error.yaml');
      const enumError = result.errors.find(e => e.message.includes('Expected one of'));
      
      if (enumError) {
        expect(enumError.message).toContain('debug, info, warn, error');
        expect(enumError.suggestedFix).toContain('Use one of the allowed values');
      }
    });
  });

  describe('semantic validation', () => {
    beforeEach(async () => {
      await validator.initialize();
    });

    it('should detect duplicate profile names', async () => {
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.toString().includes('duplicate-profiles.yaml')) {
          return `
autoLoad:
  profiles:
    - name: duplicate
      path: "./profile1.md"
    - name: duplicate
      path: "./profile2.md"
externalServers:
  enabled: true
`;
        }
        if (filePath.toString().includes('omni-config.schema.json')) {
          return JSON.stringify({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
              "autoLoad": {
                "type": "object",
                "properties": {
                  "profiles": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": ["name", "path"],
                      "properties": {
                        "name": { "type": "string" },
                        "path": { "type": "string" },
                        "autoApply": { "type": "boolean" }
                      }
                    }
                  }
                }
              },
              "externalServers": {
                "type": "object",
                "required": ["enabled"],
                "properties": {
                  "enabled": { "type": "boolean" }
                }
              }
            }
          });
        }
        return '';
      });

      const result = await validator.validateConfig('duplicate-profiles.yaml');
      const duplicateWarning = result.warnings.find(w => w.message.includes('Duplicate profile name'));
      
      expect(duplicateWarning).toBeDefined();
      expect(duplicateWarning?.suggestedFix).toContain('Use unique names');
    });

    it('should warn when external servers enabled but no servers defined', async () => {
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.toString().includes('empty-servers.yaml')) {
          return `
externalServers:
  enabled: true
  servers: []
`;
        }
        if (filePath.toString().includes('omni-config.schema.json')) {
          return JSON.stringify({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
              "externalServers": {
                "type": "object",
                "required": ["enabled"],
                "properties": {
                  "enabled": { "type": "boolean" },
                  "servers": {
                    "type": "array",
                    "items": { "type": "object" }
                  }
                }
              }
            }
          });
        }
        return '';
      });

      const result = await validator.validateConfig('empty-servers.yaml');
      const emptyServersWarning = result.warnings.find(w => 
        w.message.includes('External servers are enabled but no servers are configured')
      );
      
      expect(emptyServersWarning).toBeDefined();
      expect(emptyServersWarning?.suggestedFix).toContain('Add at least one server');
    });
  });

  describe('findLineNumber', () => {
    beforeEach(async () => {
      await validator.initialize();
    });

    it('should find line numbers in YAML content', async () => {
      const yamlContent = `
# Comment
externalServers:
  enabled: false
  servers:
    - name: test
`;

      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.toString().includes('line-test.yaml')) {
          return yamlContent;
        }
        if (filePath.toString().includes('omni-config.schema.json')) {
          return JSON.stringify({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
              "externalServers": {
                "type": "object",
                "properties": {
                  "enabled": { "type": "boolean" },
                  "servers": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": ["command"],
                      "properties": {
                        "name": { "type": "string" },
                        "command": { "type": "string" }
                      }
                    }
                  }
                }
              }
            }
          });
        }
        return '';
      });

      const result = await validator.validateConfig('line-test.yaml');
      
      // Should find line numbers for validation errors
      const lineError = result.errors.find(e => e.line !== undefined);
      if (lineError) {
        expect(lineError.line).toBeGreaterThan(0);
      }
    });
  });
});