import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('secrets-scan-cli', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'secrets-scan-test-'));
    
    // Create test files
    await fs.writeFile(path.join(tempDir, 'safe.txt'), 'Just normal content');
    await fs.writeFile(path.join(tempDir, 'secret.env'), 'API_KEY=sk-test123456789');
    await fs.mkdir(path.join(tempDir, 'subdir'));
    await fs.writeFile(path.join(tempDir, 'subdir', 'config.json'), '{"password": "secret123"}');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('--help flag', () => {
    it('should show help and exit with code 0', async () => {
      const { stdout, exitCode } = await execa('node', ['dist/cli/secrets-scan-cli.js', '--help']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Usage:/);
      expect(stdout).toMatch(/Options:/);
      expect(stdout).toMatch(/--path/);
      expect(stdout).toMatch(/--format/);
    });
  });

  describe('--version flag', () => {
    it('should show version and exit with code 0', async () => {
      const { stdout, exitCode } = await execa('node', ['dist/cli/secrets-scan-cli.js', '--version']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('valid path scanning', () => {
    it('should scan directory and output JSON format', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        '--path', tempDir,
        '--format', 'json'
      ]);
      
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('scannedFiles');
      expect(result).toHaveProperty('findings');
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('should find secrets in test files', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        '--path', tempDir,
        '--format', 'json'
      ]);
      
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.findings.length).toBeGreaterThan(0);
      
      const secretFindings = result.findings.filter((f: any) => 
        f.file.includes('secret.env') || f.file.includes('config.json')
      );
      expect(secretFindings.length).toBeGreaterThan(0);
    });
  });

  describe('invalid arguments', () => {
    it('should show usage and exit with code 2 for unknown flag', async () => {
      await expect(
        execa('node', ['dist/cli/secrets-scan-cli.js', '--unknown-flag'])
      ).rejects.toMatchObject({ exitCode: 2 });
    });

    it('should exit with code 1 for non-existent path', async () => {
      await expect(
        execa('node', [
          'dist/cli/secrets-scan-cli.js', 
          '--path', '/non/existent/path'
        ])
      ).rejects.toMatchObject({ exitCode: 1 });
    });

    it('should exit with code 1 for unreadable directory', async () => {
      const unreadableDir = path.join(tempDir, 'unreadable');
      await fs.mkdir(unreadableDir);
      await fs.chmod(unreadableDir, 0o000);

      try {
        await expect(
          execa('node', [
            'dist/cli/secrets-scan-cli.js',
            '--path', unreadableDir
          ])
        ).rejects.toMatchObject({ exitCode: 1 });
      } finally {
        await fs.chmod(unreadableDir, 0o755);
      }
    });
  });

  describe('output formats', () => {
    it('should support table format', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        '--path', tempDir,
        '--format', 'table'
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/File|Type|Line|Severity/);
    });

    it('should default to table format when no format specified', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        '--path', tempDir
      ]);
      
      expect(exitCode).toBe(0);
      // Should look like table output, not JSON
      expect(() => JSON.parse(stdout)).toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle permission errors gracefully', async () => {
      const restrictedFile = path.join(tempDir, 'restricted.txt');
      await fs.writeFile(restrictedFile, 'secret data');
      await fs.chmod(restrictedFile, 0o000);

      try {
        const { stderr, exitCode } = await execa('node', [
          'dist/cli/secrets-scan-cli.js',
          '--path', tempDir,
          '--format', 'json'
        ], { reject: false });

        // Should either succeed with partial results or exit with 1
        expect([0, 1]).toContain(exitCode);
        if (exitCode === 1) {
          expect(stderr).toMatch(/permission|access/i);
        }
      } finally {
        await fs.chmod(restrictedFile, 0o644);
      }
    });
  });
});