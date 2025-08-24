/**
 * Integration tests for schema validation system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { FailFastValidator } from '../fail-fast.js';
import { SchemaValidator } from '../schema-validator.js';
import { Logger } from '../../utils/logger.js';

describe('Schema Validation Integration', () => {
  let tempDir: string;
  let validator: FailFastValidator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(os.tmpdir(), 'omni-config-test-'));
    validator = new FailFastValidator(Logger.getInstance()); // Suppress logs in tests
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Minimal Mode Configuration', () => {
    it('should validate minimal mode config successfully', async () => {
      const configPath = join(tempDir, 'minimal-config.yaml');
      const configContent = `
mode: minimal
preset: claude-basic
autoLoad:
  profiles:
    - name: default
      path: ./CLAUDE.md
      autoApply: true
logging:
  level: info
`;
      
      await fs.writeFile(configPath, configContent);
      
      const result = await validator.validateOnly(configPath);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config?.mode).toBe('minimal');
      expect(result.config?.preset).toBe('claude-basic');
    });

    it('should reject externalServers in minimal mode', async () => {
      const configPath = join(tempDir, 'invalid-minimal-config.yaml');
      const configContent = `
mode: minimal
preset: claude-basic
externalServers:
  enabled: true
  servers:
    - name: filesystem
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
`;
      
      await fs.writeFile(configPath, configContent);
      
      const result = await validator.validateOnly(configPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('minimal'))).toBe(true);
    });
  });

  describe('Standard Mode Configuration', () => {
    it('should validate standard mode with limited external servers', async () => {
      const configPath = join(tempDir, 'standard-config.yaml');
      const configContent = `
mode: standard
preset: claude-enterprise
autoLoad:
  profiles:
    - name: default
      path: ./CLAUDE.md
      autoApply: true
    - name: dev
      path: ./dev-config.md
      autoApply: false
fileSettings:
  configFiles:
    claude: "CLAUDE.md"
    behavior: "*-behavior.md"
  includePaths: 
    - "."
    - "./configs"
  excludePatterns:
    - "node_modules"
    - ".git"
externalServers:
  enabled: true
  autoConnect: true
  servers:
    - name: filesystem
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    - name: postgres
      command: uvx
      args: ["mcp-server-postgres", "--connection-string", "postgresql://localhost/testdb"]
logging:
  level: debug
  verboseFileLoading: true
  verboseProfileSwitching: true
`;
      
      await fs.writeFile(configPath, configContent);
      
      const result = await validator.validateOnly(configPath);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config?.mode).toBe('standard');
      expect(result.config?.externalServers?.servers).toHaveLength(2);
    });

    it('should reject too many external servers in standard mode', async () => {
      const configPath = join(tempDir, 'standard-too-many-servers.yaml');
      const servers = Array.from({ length: 6 }, (_, i) => ({
        name: `server-${i}`,
        command: 'npx',
        args: ['-y', 'some-server']
      }));

      const configContent = `
mode: standard
preset: claude-enterprise
externalServers:
  enabled: true
  servers: ${JSON.stringify(servers, null, 2).replace(/"/g, '')}
`;
      
      await fs.writeFile(configPath, configContent);
      
      const result = await validator.validateOnly(configPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Advanced Mode Configuration', () => {
    it('should validate advanced mode with all features', async () => {
      const configPath = join(tempDir, 'advanced-config.yaml');
      const configContent = `
mode: advanced
preset: custom
autoLoad:
  profiles:
    - name: production
      path: ./production-claude.md
      autoApply: true
    - name: development
      path: ./dev-claude.md
      autoApply: false
    - name: testing
      path: ./test-claude.md
      autoApply: false
fileSettings:
  configFiles:
    claude: "CLAUDE.md"
    behavior: "*-behavior.md"
    custom: "*-config.md"
  includePaths:
    - "."
    - "./configs"
    - "./profiles"
  excludePatterns:
    - "node_modules"
    - ".git"
    - "dist"
  allowedExtensions:
    - ".md"
    - ".yml"
    - ".yaml"
directoryScanning:
  recursive: true
  maxDepth: 5
  includeHidden: false
  followSymlinks: false
profileManagement:
  allowDuplicateNames: false
  autoNamePattern: "%filename%-%timestamp%"
  defaultProfile: "production"
externalServers:
  enabled: true
  autoConnect: true
  retry:
    maxAttempts: 5
    delayMs: 2000
  servers:
    - name: filesystem
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
      description: "Local file operations"
    - name: postgres
      command: uvx
      args: ["mcp-server-postgres", "--connection-string", "postgresql://localhost/prod"]
      env:
        POSTGRES_PASSWORD: "secure-password"
        POSTGRES_TIMEOUT: "30000"
      description: "Production database access"
    - name: web-search
      command: uvx
      args: ["mcp-server-brave-search", "--api-key", "test-key"]
      env:
        BRAVE_API_KEY: "api-key-from-env"
      description: "Web search capabilities"
logging:
  level: debug
  verboseFileLoading: true
  verboseProfileSwitching: true
`;
      
      await fs.writeFile(configPath, configContent);
      
      const result = await validator.validateOnly(configPath);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config?.mode).toBe('advanced');
      expect(result.config?.externalServers?.servers).toHaveLength(3);
    });
  });

  describe('Error Handling and Messages', () => {
    it('should provide Japanese error messages', async () => {
      const configPath = join(tempDir, 'invalid-config.yaml');
      const configContent = `
mode: invalid-mode
preset: invalid-preset
externalServers:
  enabled: "not-boolean"
  servers:
    - name: "invalid name with spaces"
      command: ""
      args: []
`;
      
      await fs.writeFile(configPath, configContent);
      
      const result = await validator.validateOnly(configPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Check for Japanese error messages
      const hasJapaneseMessages = result.errors.some(error => 
        error.suggestedFix && (
          error.suggestedFix.includes('修正案') ||
          error.suggestedFix.includes('使用') ||
          error.suggestedFix.includes('設定')
        )
      );
      expect(hasJapaneseMessages).toBe(true);
    });

    it('should handle missing configuration file gracefully', async () => {
      const nonExistentPath = join(tempDir, 'missing-config.yaml');
      
      const result = await validator.validateOnly(nonExistentPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('startup');
      expect(result.errors[0].message).toContain('no such file');
    });

    it('should handle malformed YAML gracefully', async () => {
      const configPath = join(tempDir, 'malformed-config.yaml');
      const configContent = `
mode: minimal
preset: claude-basic
autoLoad:
  profiles:
    - name: default
      path: ./CLAUDE.md
    - invalid yaml structure here [[[
      autoApply: true
`;
      
      await fs.writeFile(configPath, configContent);
      
      const result = await validator.validateOnly(configPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('startup');
    });
  });

  describe('Configuration Doctor Report', () => {
    it('should generate healthy report for valid config', async () => {
      const configPath = join(tempDir, 'healthy-config.yaml');
      const configContent = `
mode: standard
preset: claude-basic
autoLoad:
  profiles:
    - name: default
      path: ./CLAUDE.md
      autoApply: true
logging:
  level: info
`;
      
      await fs.writeFile(configPath, configContent);
      
      const report = await validator.generateDoctorReport(configPath);
      
      expect(report).toContain('INSIGHTS Omni MCP Hub Configuration Doctor');
      expect(report).toContain('SUCCESS Status: HEALTHY');
      expect(report).toContain(' Your configuration is in perfect health!');
    });

    it('should generate issue report for problematic config', async () => {
      const configPath = join(tempDir, 'problematic-config.yaml');
      const configContent = `
mode: minimal
preset: claude-basic
externalServers:
  enabled: true
  servers:
    - name: test
      command: ""
      args: []
`;
      
      await fs.writeFile(configPath, configContent);
      
      const report = await validator.generateDoctorReport(configPath);
      
      expect(report).toContain('INSIGHTS Omni MCP Hub Configuration Doctor');
      expect(report).toContain('ERROR Status: REQUIRES ATTENTION');
      expect(report).toContain('ALERT Critical Issues:');
      expect(report).toContain('💊 Treatment:');
      expect(report).toContain(' Configuration needs immediate attention');
    });
  });

  describe('Schema Validator Integration', () => {
    it('should use schema validator with Japanese messages', async () => {
      const schemaValidator = new SchemaValidator(Logger.getInstance());
      await schemaValidator.initialize();

      // Use validateConfig with a temp file instead
      const configPath = join(tempDir, 'invalid-data-config.yaml');
      await fs.writeFile(configPath, `
mode: invalid-mode
preset: 123  # Should be string
externalServers:
  enabled: yes  # Should be boolean
`);
      const result = await schemaValidator.validateConfig(configPath);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Verify Japanese error messages are present
      const hasJapaneseMessages = result.errors.some(error => 
        error.suggestedFix && error.suggestedFix.includes('修正案:')
      );
      expect(hasJapaneseMessages).toBe(true);
    });
  });
});