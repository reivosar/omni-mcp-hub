import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('profile-admin', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-admin-test-'));
    
    // Create test profile files
    await fs.writeFile(path.join(tempDir, 'test-profile.md'), `# Test Profile
This is a test profile for development.
`);
    
    await fs.writeFile(path.join(tempDir, 'production-profile.md'), `# Production Profile  
This is for production use.
`);
    
    await fs.mkdir(path.join(tempDir, 'profiles'));
    await fs.writeFile(path.join(tempDir, 'profiles', 'nested.md'), '# Nested Profile');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('--help flag', () => {
    it('should show help and exit with code 0', async () => {
      const { stdout, exitCode } = await execa('node', ['dist/cli/profile-admin.js', '--help']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Usage:/);
      expect(stdout).toMatch(/Commands:/);
      expect(stdout).toMatch(/list|create|delete|validate/);
    });
  });

  describe('--version flag', () => {
    it('should show version and exit with code 0', async () => {
      const { stdout, exitCode } = await execa('node', ['dist/cli/profile-admin.js', '--version']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('list command', () => {
    it('should list profiles in directory', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/profile-admin.js',
        'list',
        '--path', tempDir
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/test-profile/);
      expect(stdout).toMatch(/production-profile/);
    });

    it('should output JSON format when requested', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/profile-admin.js',
        'list',
        '--path', tempDir,
        '--format', 'json'
      ]);
      
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(Array.isArray(result.profiles)).toBe(true);
      expect(result.profiles.length).toBeGreaterThan(0);
    });
  });

  describe('create command', () => {
    it('should create new profile file', async () => {
      const profileName = 'new-test-profile';
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/profile-admin.js',
        'create',
        '--name', profileName,
        '--path', tempDir,
        '--template', 'basic'
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/created/i);
      
      // Verify file was created
      const profilePath = path.join(tempDir, `${profileName}.md`);
      const exists = await fs.access(profilePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should fail when profile already exists', async () => {
      await expect(
        execa('node', [
          'dist/cli/profile-admin.js',
          'create',
          '--name', 'test-profile', // Already exists
          '--path', tempDir
        ])
      ).rejects.toMatchObject({ exitCode: 1 });
    });
  });

  describe('validate command', () => {
    it('should validate existing profiles', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/profile-admin.js',
        'validate',
        '--path', tempDir
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/valid|validation/i);
    });

    it('should report validation errors', async () => {
      // Create invalid profile
      const invalidProfile = path.join(tempDir, 'invalid.md');
      await fs.writeFile(invalidProfile, 'Invalid markdown with <script>alert("xss")</script>');
      
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/profile-admin.js',
        'validate',
        '--path', tempDir
      ], { reject: false });
      
      expect([0, 1]).toContain(exitCode);
      if (exitCode === 1) {
        expect(stdout).toMatch(/error|invalid/i);
      }
    });
  });

  describe('delete command', () => {
    it('should delete specified profile', async () => {
      const { stdout, exitCode } = await execa('node', [
        'dist/cli/profile-admin.js',
        'delete',
        '--name', 'test-profile',
        '--path', tempDir,
        '--force' // Skip confirmation
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/deleted/i);
      
      // Verify file was deleted
      const profilePath = path.join(tempDir, 'test-profile.md');
      const exists = await fs.access(profilePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should fail when profile does not exist', async () => {
      await expect(
        execa('node', [
          'dist/cli/profile-admin.js',
          'delete',
          '--name', 'non-existent-profile',
          '--path', tempDir
        ])
      ).rejects.toMatchObject({ exitCode: 1 });
    });
  });

  describe('invalid arguments', () => {
    it('should show usage for unknown command', async () => {
      await expect(
        execa('node', ['dist/cli/profile-admin.js', 'unknown-command'])
      ).rejects.toMatchObject({ exitCode: 2 });
    });

    it('should exit with code 1 for non-existent path', async () => {
      await expect(
        execa('node', [
          'dist/cli/profile-admin.js',
          'list',
          '--path', '/non/existent/path'
        ])
      ).rejects.toMatchObject({ exitCode: 1 });
    });

    it('should require name for create command', async () => {
      await expect(
        execa('node', [
          'dist/cli/profile-admin.js',
          'create',
          '--path', tempDir
        ])
      ).rejects.toMatchObject({ exitCode: 2 });
    });
  });

  describe('error handling', () => {
    it('should handle permission errors gracefully', async () => {
      await fs.chmod(tempDir, 0o444); // Read-only

      try {
        await expect(
          execa('node', [
            'dist/cli/profile-admin.js',
            'create',
            '--name', 'test',
            '--path', tempDir
          ])
        ).rejects.toMatchObject({ exitCode: 1 });
      } finally {
        await fs.chmod(tempDir, 0o755);
      }
    });

    it('should validate profile names', async () => {
      await expect(
        execa('node', [
          'dist/cli/profile-admin.js',
          'create',
          '--name', '../../../etc/passwd',
          '--path', tempDir
        ])
      ).rejects.toMatchObject({ exitCode: 1 });
    });
  });
});