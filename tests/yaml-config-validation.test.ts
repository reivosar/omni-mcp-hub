import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YamlConfigManager } from '../src/config/yaml-config.js';
import { Logger } from '../src/utils/logger.js';
import * as fs from 'fs/promises';

// Mock fs module
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

describe('YamlConfigManager with Schema Validation', () => {
  let configManager: YamlConfigManager;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    
    configManager = new YamlConfigManager('./test-config.yaml', mockLogger);
    
    // Mock schema file
    mockFs.readFile.mockImplementation(async (filePath: any) => {
      const pathStr = filePath.toString();
      
      if (pathStr.includes('omni-config.schema.json')) {
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
                      "name": { "type": "string", "pattern": "^[a-zA-Z0-9-_]+$" },
                      "path": { "type": "string" },
                      "autoApply": { "type": "boolean" }
                    }
                  }
                }
              }
            },
            "logging": {
              "type": "object",
              "properties": {
                "level": {
                  "type": "string",
                  "enum": ["debug", "info", "warn", "error"]
                },
                "verboseFileLoading": { "type": "boolean" },
                "verboseProfileSwitching": { "type": "boolean" }
              }
            },
            "externalServers": {
              "type": "object",
              "required": ["enabled"],
              "properties": {
                "enabled": { "type": "boolean" },
                "autoConnect": { "type": "boolean" },
                "servers": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name", "command", "args"],
                    "properties": {
                      "name": { "type": "string", "pattern": "^[a-zA-Z0-9-_]+$" },
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
      
      if (pathStr === 'valid-config.yaml') {
        return `
autoLoad:
  profiles:
    - name: test-profile
      path: "./test.md"
      autoApply: true

logging:
  level: info
  verboseFileLoading: true

externalServers:
  enabled: true
  autoConnect: true
  servers:
    - name: filesystem
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
      description: "File system operations"
`;
      }
      
      if (pathStr === 'invalid-config.yaml') {
        return `
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
      }
      
      if (pathStr === 'warning-config.yaml') {
        return `
autoLoad:
  profiles:
    - name: duplicate
      path: "./profile1.md"
    - name: duplicate  # Duplicate name warning
      path: "./profile2.md"

externalServers:
  enabled: true
  servers: []  # Warning: enabled but no servers
`;
      }
      
      throw new Error('File not found');
    });

    // Mock fs.access for profile file existence checks
    vi.mocked(fs.access).mockResolvedValue(undefined);
  });

  describe('enableValidation', () => {
    it('should enable validation successfully', async () => {
      await configManager.enableValidation();
      
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Schema validator initialized successfully from:'));
    });

    it('should not reinitialize validator if already enabled', async () => {
      await configManager.enableValidation();
      mockLogger.debug.mockClear();
      
      await configManager.enableValidation();
      
      // Should not call initialization again
      expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Schema validator initialized successfully from:'));
    });
  });

  describe('validateConfig', () => {
    it('should validate configuration successfully', async () => {
      const result = await configManager.validateConfig('valid-config.yaml');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config).toBeDefined();
      expect(result.config?.externalServers?.enabled).toBe(true);
    });

    it('should detect validation errors', async () => {
      const result = await configManager.validateConfig('invalid-config.yaml');
      
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

    it('should detect semantic warnings', async () => {
      const result = await configManager.validateConfig('warning-config.yaml');
      
      expect(result.valid).toBe(true); // Schema valid but has warnings
      expect(result.warnings.length).toBeGreaterThan(0);
      
      // Should warn about duplicate names
      const duplicateWarning = result.warnings.find(w => 
        w.message.includes('Duplicate profile name')
      );
      expect(duplicateWarning).toBeDefined();
      
      // Should warn about enabled servers but no servers configured
      const emptyServersWarning = result.warnings.find(w => 
        w.message.includes('External servers are enabled but no servers are configured')
      );
      expect(emptyServersWarning).toBeDefined();
    });
  });

  describe('loadYamlConfig with validation', () => {
    it('should load config without validation by default', async () => {
      const config = await configManager.loadYamlConfig('valid-config.yaml');
      
      expect(config).toBeDefined();
      expect(config.externalServers?.enabled).toBe(true);
      // Should not call validation methods
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should load config with validation when enabled', async () => {
      const config = await configManager.loadYamlConfig('valid-config.yaml', { validate: true });
      
      expect(config).toBeDefined();
      expect(config.externalServers?.enabled).toBe(true);
      // Should not have validation warnings for valid config
      expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('validation failed'));
    });

    it('should log validation warnings during load', async () => {
      const config = await configManager.loadYamlConfig('invalid-config.yaml', { validate: true });
      
      expect(config).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Configuration validation failed'));
    });

    it('should log validation warnings but still return merged config', async () => {
      const config = await configManager.loadYamlConfig('warning-config.yaml', { validate: true });
      
      expect(config).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration warnings'));
    });

    it('should handle validation errors gracefully', async () => {
      // Mock validator to throw error
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.toString().includes('omni-config.schema.json')) {
          throw new Error('Schema file corrupted');
        }
        return 'externalServers:\n  enabled: true';
      });

      const config = await configManager.loadYamlConfig('valid-config.yaml', { validate: true });
      
      expect(config).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Schema validation failed'));
    });
  });

  describe('dryRun', () => {
    beforeEach(async () => {
      await configManager.loadYamlConfig('valid-config.yaml');
    });

    it('should perform dry run successfully', async () => {
      const result = await configManager.dryRun('valid-config.yaml');
      
      expect(result.valid).toBe(true);
      expect(result.changes).toBeDefined();
      expect(result.impact).toBeDefined();
    });

    it('should detect changes in dry run', async () => {
      // First load a config
      await configManager.loadYamlConfig('valid-config.yaml');
      
      // Mock a different config for comparison
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('omni-config.schema.json')) {
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
                        "name": { "type": "string", "pattern": "^[a-zA-Z0-9-_]+$" },
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
                  "enabled": { "type": "boolean" },
                  "servers": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": ["name", "command", "args"],
                      "properties": {
                        "name": { "type": "string", "pattern": "^[a-zA-Z0-9-_]+$" },
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
    - name: new-profile  # Different from original
      path: "./new.md"

externalServers:
  enabled: false  # Different from original
  servers: []
`;
        }
        throw new Error('File not found');
      });

      const result = await configManager.dryRun('changed-config.yaml');
      
      expect(result.valid).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('should return validation errors in dry run for invalid config', async () => {
      const result = await configManager.dryRun('invalid-config.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.changes).toHaveLength(0);
    });
  });

  describe('formatValidationResult', () => {
    it('should format validation result', async () => {
      const result = await configManager.validateConfig('valid-config.yaml');
      const formatted = configManager.formatValidationResult(result);
      
      expect(formatted).toContain('Configuration is valid');
    });

    it('should format validation errors', async () => {
      const result = await configManager.validateConfig('invalid-config.yaml');
      const formatted = configManager.formatValidationResult(result);
      
      expect(formatted).toContain('Configuration validation failed');
      expect(formatted).toContain('Errors:');
    });

    it('should return message if validator not initialized', () => {
      const newManager = new YamlConfigManager();
      const result = { valid: true, errors: [], warnings: [] };
      
      const formatted = newManager.formatValidationResult(result);
      
      expect(formatted).toBe('Validator not initialized');
    });
  });

  describe('getValidator', () => {
    it('should return validator instance', async () => {
      const validator = await configManager.getValidator();
      
      expect(validator).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Schema validator initialized successfully from:'));
    });

    it('should return same instance on subsequent calls', async () => {
      const validator1 = await configManager.getValidator();
      const validator2 = await configManager.getValidator();
      
      expect(validator1).toBe(validator2);
    });
  });

  describe('integration with existing functionality', () => {
    it('should maintain backward compatibility', async () => {
      const config = await configManager.loadYamlConfig('valid-config.yaml');
      
      // Should work with existing methods
      expect(configManager.shouldLog('info')).toBe(true);
      expect(configManager.getDefaultProfile()).toBe('default');
      expect(configManager.isVerboseProfileSwitching()).toBe(false);
    });

    it('should work with config merging', async () => {
      const config = await configManager.loadYamlConfig('valid-config.yaml', { validate: true });
      
      // Update config and ensure validation can still work
      configManager.updateConfig({
        logging: {
          level: 'debug',
          verboseFileLoading: false
        }
      });
      
      const updatedConfig = configManager.getConfig();
      expect(updatedConfig.logging?.level).toBe('debug');
    });
  });

  describe('error handling edge cases', () => {
    it('should handle malformed YAML gracefully', async () => {
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('omni-config.schema.json')) {
          return JSON.stringify({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
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
        if (pathStr === 'malformed.yaml') {
          return 'invalid: yaml: content:  - [unclosed';
        }
        throw new Error('File not found');
      });

      const result = await configManager.validateConfig('malformed.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('root');
    });

    it('should handle missing schema gracefully', async () => {
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.toString().includes('omni-config.schema.json')) {
          throw new Error('Schema not found');
        }
        return 'externalServers:\n  enabled: true';
      });

      await expect(configManager.enableValidation()).rejects.toThrow('Schema initialization failed');
    });

    it('should handle file access errors in validation', async () => {
      // Mock access to throw error
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('Permission denied'));
      
      const result = await configManager.validateConfig('valid-config.yaml');
      
      // Should still validate schema but may have warnings about file access
      expect(result.valid).toBe(true);
    });
  });
});