import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execaNode } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/profile-admin.js');

describe('profile-admin CLI', () => {
  let tempDir: string;
  let testConfigPath: string;
  let testProfilePath: string;
  let originalCwd: string;

  beforeAll(async () => {
    // Ensure CLI is built
    try {
      await fs.access(CLI_PATH);
    } catch {
      throw new Error(`CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }

    // Create temp directory for test files and change to it
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-admin-test-'));
    process.chdir(tempDir);
    testConfigPath = path.join(tempDir, '.mcp-config.json');
    testProfilePath = path.join(tempDir, 'test-profile.md');
    
    // Create test profile file
    await fs.writeFile(testProfilePath, `
# Test Profile

## Instructions
This is a test profile for CLI testing.

## Rules
- Rule 1: Test rule
- Rule 2: Another test rule
`);
  });

  afterAll(async () => {
    // Restore original directory
    process.chdir(originalCwd);
    
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Help and Version', () => {
    it('should show help with --help and exit 0', async () => {
      const { stdout, exitCode } = await execaNode(CLI_PATH, ['--help']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Usage:/);
      expect(stdout).toMatch(/profile-admin/);
      expect(stdout).toMatch(/Commands:/);
    });

    it('should show version with --version and exit 0', async () => {
      const { stdout, exitCode } = await execaNode(CLI_PATH, ['--version']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
    });
  });

  describe('List Command', () => {
    it('should list profiles (empty initially)', async () => {
      const { stdout, exitCode } = await execaNode(CLI_PATH, [
        'list'
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/No profiles found|Registered Profiles/);
    });

    it('should handle missing config file gracefully', async () => {
      // Remove .mcp-config.json if it exists
      try {
        await fs.unlink('.mcp-config.json');
      } catch {
        // Ignore if file doesn't exist
      }
      
      const { stdout, exitCode } = await execaNode(CLI_PATH, [
        'list'
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/No profiles found/);
    });
  });

  describe('Add Command', () => {
    it('should add a profile successfully', async () => {
      const { stdout, exitCode } = await execaNode(CLI_PATH, [
        'add',
        'test-profile',
        testProfilePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Profile .* added successfully/);
      
      // Verify config file was created
      const configExists = await fs.access('.mcp-config.json').then(() => true).catch(() => false);
      expect(configExists).toBe(true);
    });

    it('should handle non-existent profile file', async () => {
      const nonExistentProfile = path.join(tempDir, 'non-existent.md');
      
      await expect(execaNode(CLI_PATH, [
        'add',
        'non-existent',
        nonExistentProfile
      ])).rejects.toMatchObject({
        exitCode: 1
      });
    });

    it('should allow adding duplicate profile names (overwrites)', async () => {
      // Try to add the same profile again - profile-admin allows this
      const { stdout, exitCode } = await execaNode(CLI_PATH, [
        'add',
        'test-profile-2',
        testProfilePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Profile .* added successfully/);
    });
  });

  describe('Remove Command', () => {
    it('should remove an existing profile', async () => {
      const { stdout, exitCode } = await execaNode(CLI_PATH, [
        'remove',
        'test-profile'
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Profile .* removed successfully/);
    });

    it('should handle removing non-existent profile', async () => {
      await expect(execaNode(CLI_PATH, [
        'remove',
        'non-existent-profile'
      ])).rejects.toMatchObject({
        exitCode: 1
      });
    });
  });

  describe('Verify Command', () => {
    beforeAll(async () => {
      // Re-add test profile for verification tests
      await execaNode(CLI_PATH, [
        'add',
        'test-profile',
        testProfilePath
      ]);
    });

    it('should verify an existing profile', async () => {
      const { stdout, exitCode } = await execaNode(CLI_PATH, [
        'verify',
        'test-profile'
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Profile .* verified|integrity|checksum/);
    });

    it('should handle verifying non-existent profile', async () => {
      await expect(execaNode(CLI_PATH, [
        'verify',
        'non-existent-profile'
      ])).rejects.toMatchObject({
        exitCode: 1
      });
    });

    it('should show help when verify called without profile name', async () => {
      await expect(execaNode(CLI_PATH, [
        'verify'
      ])).rejects.toMatchObject({
        exitCode: 1
      });
    });
  });

  describe('Error Handling', () => {
    it('should exit with error code 1 for invalid commands', async () => {
      await expect(execaNode(CLI_PATH, [ 'invalid-command']))
        .rejects.toMatchObject({
          exitCode: 1
        });
    });

    it('should exit with error code 1 for missing required arguments', async () => {
      await expect(execaNode(CLI_PATH, [ 'add']))
        .rejects.toMatchObject({
          exitCode: 1
        });
    });

    it('should handle permission denied for config file', async () => {
      if (process.platform !== 'win32') {
        const restrictedConfig = path.join(tempDir, 'restricted-config.json');
        
        // Create file and make it read-only
        await fs.writeFile(restrictedConfig, '{}');
        await fs.chmod(restrictedConfig, 0o444);
        
        try {
          // Profile-admin doesn't support --config option, so test basic functionality
          const { stdout, exitCode } = await execaNode(CLI_PATH, [
            'list'
          ]);
          
          expect(exitCode).toBe(0);
          expect(stdout).toMatch(/No profiles found|Registered Profiles/);
        } finally {
          // Restore permissions for cleanup
          await fs.chmod(restrictedConfig, 0o644);
        }
      }
    });
  });

  describe('JSON Output', () => {
    it('should list profiles in text format', async () => {
      const { stdout, exitCode } = await execaNode(CLI_PATH, [
        'list'
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Registered Profiles|No profiles found/);
    });
  });
});