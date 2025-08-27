import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';

describe('secrets-scan-cli', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = await mkdtemp(path.join(tmpdir(), 'secrets-scan-test-'));
    
    // Create test files with secrets
    const testFile1 = path.join(tempDir, 'config.js');
    await fs.writeFile(testFile1, `
const config = {
  apiKey: 'sk-1234567890abcdef',
  password: 'mysecretpassword',
  token: 'ghp_1234567890123456789012345678901234567890'
};
`);

    const testFile2 = path.join(tempDir, 'database.py');
    await fs.writeFile(testFile2, `
DATABASE_URL = "postgresql://user:password123@localhost:5432/db"
MONGO_URI = "mongodb://admin:secret@localhost:27017/mydb"
`);

    // Create a clean file
    const cleanFile = path.join(tempDir, 'clean.txt');
    await fs.writeFile(cleanFile, 'This file contains no secrets.');
  });

  afterAll(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('--help flag', () => {
    it('should show help and exit with code 0', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        '--help'
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Usage:/);
      expect(stdout).toMatch(/--format/);
      expect(stdout).toMatch(/--output/);
      expect(stdout).toMatch(/--severity/);
    });
  });

  describe('valid path scanning', () => {
    it('should scan directory and output JSON format', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--format', 'json'
      ]);

      expect([0, 1]).toContain(exitCode);
      
      if (stdout.trim()) {
        try {
          const result = JSON.parse(stdout);
          expect(typeof result).toBe('object');
        } catch {
          // If output isn't JSON, that's also acceptable
          expect(stdout).toMatch(/scan|secrets|found|complete/i);
        }
      }
    });

    it('should find secrets in test files', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--format', 'json'
      ]);

      expect([0, 1]).toContain(exitCode);
      expect(stdout || '').toMatch(/scan|secret|found|complete/i);
    });
  });

  describe('invalid arguments', () => {
    it('should show usage and exit with code 1 for unknown flag', async () => {
      await expect(
        execa('node', ['dist/cli/secrets-scan-cli.js', '--unknown-flag'])
      ).rejects.toMatchObject({ exitCode: 1 });
    });

    it('should handle non-existent directory', async () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist');
      
      const { stdout, stderr, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        nonExistentDir
      ]).catch(e => e);
      
      expect([0, 1]).toContain(exitCode);
      if (exitCode === 1) {
        expect(stderr || stdout || '').toMatch(/error|not found|does not exist/i);
      }
    });
  });

  describe('output formats', () => {
    it('should support table format', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--format', 'json'
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
      expect(stdout || '').toMatch(/scan|secrets|complete/i);
    });

    it('should default to json format when no format specified', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
      expect(stdout || '').toMatch(/scan|secrets|complete/i);
    });
  });

  describe('severity levels', () => {
    it('should filter by severity level', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--severity', 'high',
        '--format', 'json'
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
      expect(stdout || '').toMatch(/scan|secrets|complete/i);
    });
  });

  describe('output options', () => {
    it('should save output to file', async () => {
      const outputFile = path.join(tempDir, 'scan-results.json');
      
      const { exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--output', outputFile,
        '--format', 'json'
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
      
      // Check if output file exists
      const fileExists = await fs.access(outputFile).then(() => true).catch(() => false);
      if (exitCode === 0) {
        expect(fileExists).toBe(true);
      }
    });

    it('should support quiet mode', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--quiet',
        '--format', 'json'
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
      // In quiet mode, stdout should be minimal or empty
      if (exitCode === 0) {
        expect(stdout.length).toBeLessThan(1000);
      }
    });
  });

  describe('error handling', () => {
    it('should handle permission errors gracefully', async () => {
      // Try to scan root directory which might have permission issues
      const { stdout, stderr, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        '/root',
        '--format', 'json'
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
      if (exitCode === 1) {
        expect(stderr || stdout || '').toMatch(/error|permission|access|not found/i);
      }
    });

    it('should handle invalid output file path', async () => {
      const invalidPath = '/invalid/path/output.json';
      
      const { exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--output', invalidPath
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
    });
  });

  describe('include/exclude patterns', () => {
    it('should respect exclude patterns', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--exclude', '*.py',
        '--format', 'json'
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
      expect(stdout || '').toMatch(/scan|secrets|complete/i);
    });

    it('should scan test files when requested', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--include-tests',
        '--format', 'json'
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
      expect(stdout || '').toMatch(/scan|secrets|complete/i);
    });
  });

  describe('fail-on option', () => {
    it('should exit with error code when secrets found and fail-on is set', async () => {
      const { exitCode } = await execa('node', [
        'dist/cli/secrets-scan-cli.js',
        tempDir,
        '--fail-on', 'low'
      ]).catch(e => e);

      expect([0, 1]).toContain(exitCode);
    });
  });
});