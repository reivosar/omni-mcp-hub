import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeProfileHash, computeStringHash, verifyProfileHash } from '../../src/behavior/hash.js';
import { ProfileTarget } from '../../src/behavior/state.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('Hash Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockFs = vi.mocked(fs);
    mockFs.readFile.mockResolvedValue('test content');
  });

  describe('computeProfileHash', () => {
    it('should generate consistent hash for same content', async () => {
      const target: ProfileTarget = {
        source: '/test/profile.md'
      };

      const hash1 = await computeProfileHash(target);
      const hash2 = await computeProfileHash(target);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    it('should include source file in hash', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.readFile.mockResolvedValueOnce('content1');
      
      const target1: ProfileTarget = { source: '/test/profile1.md' };
      const hash1 = await computeProfileHash(target1);

      mockFs.readFile.mockResolvedValueOnce('content2');
      const target2: ProfileTarget = { source: '/test/profile2.md' };
      const hash2 = await computeProfileHash(target2);

      expect(hash1).not.toBe(hash2);
    });

    it('should include included files in hash', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.readFile
        .mockResolvedValueOnce('main content')
        .mockResolvedValueOnce('include1 content')
        .mockResolvedValueOnce('include2 content');

      const target: ProfileTarget = {
        source: '/test/profile.md',
        includes: ['include1.md', 'include2.md']
      };

      const hash = await computeProfileHash(target);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      
      // Should have called readFile for main + 2 includes
      expect(mockFs.readFile).toHaveBeenCalledTimes(3);
    });

    it('should handle missing include files gracefully', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.readFile
        .mockResolvedValueOnce('main content')
        .mockRejectedValueOnce(new Error('File not found'));

      const target: ProfileTarget = {
        source: '/test/profile.md',
        includes: ['missing.md']
      };

      const hash = await computeProfileHash(target);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should include options in hash', async () => {
      const target1: ProfileTarget = {
        source: '/test/profile.md',
        options: { mode: 'test' }
      };

      const target2: ProfileTarget = {
        source: '/test/profile.md',
        options: { mode: 'prod' }
      };

      const hash1 = await computeProfileHash(target1);
      const hash2 = await computeProfileHash(target2);

      expect(hash1).not.toBe(hash2);
    });

    it('should sort includes for deterministic hash', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.readFile.mockResolvedValue('content');

      const target1: ProfileTarget = {
        source: '/test/profile.md',
        includes: ['a.md', 'b.md']
      };

      const target2: ProfileTarget = {
        source: '/test/profile.md',
        includes: ['b.md', 'a.md'] // Different order
      };

      const hash1 = await computeProfileHash(target1);
      const hash2 = await computeProfileHash(target2);

      expect(hash1).toBe(hash2); // Should be same due to sorting
    });

    it('should throw error on main file read failure', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.readFile.mockRejectedValue(new Error('Main file not found'));

      const target: ProfileTarget = {
        source: '/test/nonexistent.md'
      };

      await expect(computeProfileHash(target))
        .rejects.toThrow('Failed to compute profile hash');
    });
  });

  describe('computeStringHash', () => {
    it('should generate consistent hash for same string', () => {
      const hash1 = computeStringHash('test content');
      const hash2 = computeStringHash('test content');

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different hashes for different strings', () => {
      const hash1 = computeStringHash('content1');
      const hash2 = computeStringHash('content2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyProfileHash', () => {
    it('should return true for matching hash', async () => {
      const target: ProfileTarget = {
        source: '/test/profile.md'
      };

      const hash = await computeProfileHash(target);
      const isValid = await verifyProfileHash(target, hash);

      expect(isValid).toBe(true);
    });

    it('should return false for non-matching hash', async () => {
      const target: ProfileTarget = {
        source: '/test/profile.md'
      };

      const isValid = await verifyProfileHash(target, 'invalidhash');
      expect(isValid).toBe(false);
    });

    it('should return false on verification errors', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.readFile.mockRejectedValue(new Error('Read error'));

      const target: ProfileTarget = {
        source: '/test/profile.md'
      };

      const isValid = await verifyProfileHash(target, 'somehash');
      expect(isValid).toBe(false);
    });
  });
});