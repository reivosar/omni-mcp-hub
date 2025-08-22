import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnvironmentSecretProvider } from '../../../src/security/providers/env-provider';

describe('EnvironmentSecretProvider', () => {
  let provider: EnvironmentSecretProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    provider = new EnvironmentSecretProvider();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create provider with ENV name', () => {
      expect(provider.getName()).toBe('ENV');
    });
  });

  describe('isAvailable', () => {
    it('should always be available', async () => {
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('resolve', () => {
    it('should resolve existing environment variable', async () => {
      process.env.TEST_SECRET = 'secret-value';

      const result = await provider.resolve('test_secret');

      expect(result).toBe('secret-value');
    });

    it('should sanitize and uppercase reference', async () => {
      process.env.TEST_SECRET_KEY = 'sanitized-value';

      const result = await provider.resolve('test-secret/key');

      expect(result).toBe('sanitized-value');
    });

    it('should throw error for non-existent environment variable', async () => {
      await expect(provider.resolve('non_existent'))
        .rejects.toThrow('Environment variable NON_EXISTENT not found');
    });

    it('should handle special characters in reference', async () => {
      process.env.SPECIAL_KEY = 'special-value';

      const result = await provider.resolve('special@key!');

      expect(result).toBe('special-value');
    });

    it('should handle empty string values', async () => {
      process.env.EMPTY_VAR = '';

      await expect(provider.resolve('empty_var'))
        .rejects.toThrow('Environment variable EMPTY_VAR not found');
    });
  });

  describe('store', () => {
    it('should store value in environment variable', async () => {
      await provider.store('new_secret', 'new-value');

      expect(process.env.NEW_SECRET).toBe('new-value');
    });

    it('should sanitize and uppercase reference for storage', async () => {
      await provider.store('new-secret/key', 'sanitized-store-value');

      expect(process.env.NEW_SECRET_KEY).toBe('sanitized-store-value');
    });

    it('should overwrite existing environment variable', async () => {
      process.env.EXISTING_VAR = 'old-value';

      await provider.store('existing_var', 'new-value');

      expect(process.env.EXISTING_VAR).toBe('new-value');
    });
  });

  describe('delete', () => {
    it('should delete environment variable', async () => {
      process.env.TO_DELETE = 'delete-me';

      await provider.delete('to_delete');

      expect(process.env.TO_DELETE).toBeUndefined();
    });

    it('should sanitize and uppercase reference for deletion', async () => {
      process.env.DELETE_KEY = 'delete-value';

      await provider.delete('delete-key');

      expect(process.env.DELETE_KEY).toBeUndefined();
    });

    it('should handle deletion of non-existent variable', async () => {
      await expect(provider.delete('non_existent')).resolves.not.toThrow();
      expect(process.env.NON_EXISTENT).toBeUndefined();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      process.env = {
        SECRET_API_KEY: 'api-value',
        SECRET_DB_PASSWORD: 'db-value',
        PUBLIC_URL: 'public-value',
        NORMAL_VAR: 'normal-value'
      };
    });

    it('should list all environment variables when no pattern', async () => {
      const result = await provider.list();

      expect(result).toContain('SECRET_API_KEY');
      expect(result).toContain('SECRET_DB_PASSWORD');
      expect(result).toContain('PUBLIC_URL');
      expect(result).toContain('NORMAL_VAR');
    });

    it('should filter by pattern (case insensitive)', async () => {
      const result = await provider.list('secret');

      expect(result).toContain('SECRET_API_KEY');
      expect(result).toContain('SECRET_DB_PASSWORD');
      expect(result).not.toContain('PUBLIC_URL');
      expect(result).not.toContain('NORMAL_VAR');
    });

    it('should handle regex patterns', async () => {
      const result = await provider.list('^SECRET_.*');

      expect(result).toContain('SECRET_API_KEY');
      expect(result).toContain('SECRET_DB_PASSWORD');
      expect(result).not.toContain('PUBLIC_URL');
    });

    it('should return empty array for non-matching pattern', async () => {
      const result = await provider.list('non_matching_pattern');

      expect(result).toEqual([]);
    });

    it('should handle empty environment', async () => {
      process.env = {};

      const result = await provider.list();

      expect(result).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle numeric environment variables', async () => {
      process.env.NUMERIC_VAR = '12345';

      const result = await provider.resolve('numeric_var');

      expect(result).toBe('12345');
    });

    it('should handle environment variables with spaces', async () => {
      process.env.SPACE_VAR = 'value with spaces';

      const result = await provider.resolve('space_var');

      expect(result).toBe('value with spaces');
    });

    it('should handle very long references', async () => {
      const longRef = 'a'.repeat(100);
      const longEnvVar = longRef.toUpperCase();
      process.env[longEnvVar] = 'long-value';

      const result = await provider.resolve(longRef);

      expect(result).toBe('long-value');
    });

    it('should handle references with underscores and hyphens', async () => {
      process.env.TEST_VAR_WITH_HYPHENS = 'hyphen-value';

      const result = await provider.resolve('test-var-with-hyphens');

      expect(result).toBe('hyphen-value');
    });
  });

  describe('sanitization', () => {
    it('should replace invalid characters with underscores', async () => {
      process.env.TEST_VAR = 'sanitized-value';

      // These should all resolve to TEST_VAR
      const tests = [
        'test@var',
        'test#var',
        'test$var',
        'test%var',
        'test!var',
        'test(var)',
        'test[var]',
        'test{var}',
        'test=var',
        'test+var',
        'test~var'
      ];

      for (const test of tests) {
        const result = await provider.resolve(test);
        expect(result).toBe('sanitized-value');
      }
    });

    it('should preserve valid characters', async () => {
      process.env.VALID_VAR_123 = 'valid-value';

      const result = await provider.resolve('valid-var-123');

      expect(result).toBe('valid-value');
    });
  });
});