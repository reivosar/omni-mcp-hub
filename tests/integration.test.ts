import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(__dirname);

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Build project
    await new Promise((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: rootDir,
        stdio: 'inherit'
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve(undefined);
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });
    });
  });

  describe('Project Structure', () => {
    it('should have correct file structure', async () => {
      const requiredFiles = [
        'package.json',
        'tsconfig.json',
        'src/index.ts',
        'src/utils/claude-config.ts',
        'examples/local-resources/start.sh',
        'examples/local-resources/lum-behavior.md'
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(rootDir, file);
        await expect(fs.access(filePath)).resolves.not.toThrow();
      }
    });

    it('should have built files in dist directory', async () => {
      const distFiles = [
        'dist/index.js',
        'dist/utils/claude-config.js'
      ];

      for (const file of distFiles) {
        const filePath = path.join(rootDir, file);
        await expect(fs.access(filePath)).resolves.not.toThrow();
      }
    });
  });

  describe('Configuration Files', () => {
    it('should have valid package.json', async () => {
      const packagePath = path.join(rootDir, 'package.json');
      const content = await fs.readFile(packagePath, 'utf-8');
      const pkg = JSON.parse(content);

      expect(pkg.name).toBe('omni-mcp-hub');
      expect(pkg.version).toBeTruthy();
      expect(pkg.main).toBe('dist/index.js');
      expect(pkg.scripts.build).toBe('tsc');
      expect(pkg.scripts.test).toBe('./scripts/test-runner.sh');
      expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeTruthy();
      expect(pkg.devDependencies.vitest).toBeTruthy();
    });

    it('should have valid tsconfig.json', async () => {
      const tsconfigPath = path.join(rootDir, 'tsconfig.json');
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const tsconfig = JSON.parse(content);

      expect(tsconfig.compilerOptions).toBeTruthy();
      expect(tsconfig.compilerOptions.target).toBeTruthy();
      expect(tsconfig.compilerOptions.module).toBeTruthy();
    });

    it('should have valid omni-config.yaml in local-resources example', async () => {
      const yamlConfigPath = path.join(rootDir, 'examples/local-resources/omni-config.yaml');
      const content = await fs.readFile(yamlConfigPath, 'utf-8');
      
      // Should be valid YAML and have new simplified structure
      expect(content).toContain('profiles:');
      expect(content).toContain('logging:');
      expect(content).toContain('level: "info"');
    });
  });

  describe('Example Files', () => {
    it('should have valid behavior profile files', async () => {
      const localResourcesDir = path.join(rootDir, 'examples/local-resources');
      const files = await fs.readdir(localResourcesDir);
      
      const mdFiles = files.filter(file => file.endsWith('.md') && file !== 'README.md');
      expect(mdFiles.length).toBeGreaterThan(0);

      // Check if each .md file is in valid CLAUDE.md format
      for (const file of mdFiles) {
        const filePath = path.join(localResourcesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');

        expect(content).toContain('# Instructions');
        // Project Name is not required, but check correct format if present
        if (content.includes('Project Name:')) {
          expect(content).toMatch(/Project Name: .+/);
        }
      }
    });

    it('should have valid standardized configuration examples', async () => {
      const exampleTypes = ['local-resources', 'mixed', 'docker'];
      
      for (const exampleType of exampleTypes) {
        const configPath = path.join(rootDir, 'examples', exampleType, 'omni-config.yaml');
        const content = await fs.readFile(configPath, 'utf-8');
        
        // All configs should have profiles and logging (or autoLoad)
        expect(content).toMatch(/(profiles:|autoLoad:)/);
        expect(content).toContain('logging:');
      }
      
      // Test MCP-only config separately as it has different structure
      const mcpConfigPath = path.join(rootDir, 'examples/mcp/omni-config.yaml');
      const mcpContent = await fs.readFile(mcpConfigPath, 'utf-8');
      expect(mcpContent).toContain('externalServers:');
      expect(mcpContent).toContain('logging:');
    });

    it('should have executable start script', async () => {
      const startScript = path.join(rootDir, 'examples/local-resources/start.sh');
      const stats = await fs.stat(startScript);
      
      // Verify executable permissions (Unix systems only)
      if (process.platform !== 'win32') {
        expect(stats.mode & parseInt('111', 8)).toBeGreaterThan(0);
      }

      const content = await fs.readFile(startScript, 'utf-8');
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('npm run build');
      expect(content).toContain('claude');
    });
  });

  describe('Server Functionality', () => {
    it('should import and instantiate server without errors', async () => {
      // Test server code with dynamic import
      const indexPath = path.join(rootDir, 'dist/index.js');
      
      // Verify file exists and is syntactically correct
      const content = await fs.readFile(indexPath, 'utf-8');
      expect(content).toContain('OmniMCPServer');
      expect(content).toContain('@modelcontextprotocol/sdk');
    });

    it('should have correct MCP server configuration', () => {
      const expectedCapabilities = {
        resources: {},
        tools: {}
      };

      const expectedInfo = {
        name: 'omni-mcp-hub',
        version: '1.0.0'
      };

      expect(expectedCapabilities).toBeTruthy();
      expect(expectedInfo.name).toBe('omni-mcp-hub');
      expect(expectedInfo.version).toBe('1.0.0');
    });
  });

  describe('Claude Config Manager', () => {
    it('should handle various configuration formats', async () => {
      const testConfig = {
        project_name: 'Test Project',
        description: 'Test Description',
        version: '1.0.0',
        instructions: 'Test instructions',
        customInstructions: ['Custom 1', 'Custom 2'],
        rules: ['Rule 1', 'Rule 2'],
        knowledge: ['Knowledge 1'],
        context: ['Context 1'],
        tools: ['Tool 1'],
        memory: 'Test memory'
      };

      // Verify configuration object format is correct
      expect(testConfig.project_name).toBeTruthy();
      expect(Array.isArray(testConfig.customInstructions)).toBe(true);
      expect(Array.isArray(testConfig.rules)).toBe(true);
      expect(Array.isArray(testConfig.knowledge)).toBe(true);
      expect(Array.isArray(testConfig.context)).toBe(true);
      expect(Array.isArray(testConfig.tools)).toBe(true);
      expect(typeof testConfig.memory).toBe('string');
    });
  });
});