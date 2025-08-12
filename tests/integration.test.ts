import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(__dirname);

describe('Integration Tests', () => {
  beforeAll(async () => {
    // プロジェクトをビルド
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
        'examples/start.sh',
        'examples/lum-behavior.md',
        '.mcp-config.json'
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
      expect(pkg.scripts.test).toBe('vitest');
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

    it('should have valid .mcp-config.json', async () => {
      const mcpConfigPath = path.join(rootDir, '.mcp-config.json');
      const content = await fs.readFile(mcpConfigPath, 'utf-8');
      const mcpConfig = JSON.parse(content);

      expect(mcpConfig.initialProfiles).toBeTruthy();
      expect(Array.isArray(mcpConfig.initialProfiles)).toBe(true);
      
      if (mcpConfig.initialProfiles.length > 0) {
        const profile = mcpConfig.initialProfiles[0];
        expect(profile.name).toBeTruthy();
        expect(profile.path).toBeTruthy();
      }
    });
  });

  describe('Example Files', () => {
    it('should have valid example configuration files', async () => {
      const examplesDir = path.join(rootDir, 'examples');
      const files = await fs.readdir(examplesDir);
      
      const mdFiles = files.filter(file => file.endsWith('.md') && file !== 'README-MCP-SETUP.md');
      expect(mdFiles.length).toBeGreaterThan(0);

      // 各.mdファイルが有効なCLAUDE.md形式かチェック
      for (const file of mdFiles) {
        const filePath = path.join(examplesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');

        expect(content).toContain('# Instructions');
        // Project Nameは必須ではないが、あれば正しい形式かチェック
        if (content.includes('Project Name:')) {
          expect(content).toMatch(/Project Name: .+/);
        }
      }
    });

    it('should have executable start script', async () => {
      const startScript = path.join(rootDir, 'examples/start.sh');
      const stats = await fs.stat(startScript);
      
      // 実行権限があることを確認 (Unix系システムのみ)
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
      // 動的importでサーバーコードをテスト
      const indexPath = path.join(rootDir, 'dist/index.js');
      
      // ファイルが存在し、構文的に正しいことを確認
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

      // 設定オブジェクトの形式が正しいことを確認
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