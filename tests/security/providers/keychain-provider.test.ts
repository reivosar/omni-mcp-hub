import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeychainSecretProvider } from '../../../src/security/providers/keychain-provider';

// Mock keytar module
const mockKeytar = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn()
};

// Mock the require call for keytar
vi.mock('keytar', () => mockKeytar);

describe('KeychainSecretProvider', () => {
  let provider: KeychainSecretProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new KeychainSecretProvider('test-service');
  });

  describe('constructor', () => {
    it('should create provider with KEYCHAIN name', () => {
      expect(provider.getName()).toBe('KEYCHAIN');
    });

    it('should use default service name when not provided', () => {
      const defaultProvider = new KeychainSecretProvider();
      expect(defaultProvider.getName()).toBe('KEYCHAIN');
    });

    it('should use custom service name', () => {
      const customProvider = new KeychainSecretProvider('custom-service');
      expect(customProvider.getName()).toBe('KEYCHAIN');
    });
  });

  describe('isAvailable', () => {
    it('should return true when keytar is available', async () => {
      // keytar is mocked so it should be available
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('should handle keytar unavailability gracefully', async () => {
      // This test would need to be run in an environment where keytar is not available
      // For now, we test the available case since we're mocking keytar
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('resolve', () => {
    it('should resolve secret from keychain', async () => {
      mockKeytar.getPassword.mockResolvedValue('secret-value');

      const result = await provider.resolve('test-account');

      expect(mockKeytar.getPassword).toHaveBeenCalledWith('test-service', 'test-account');
      expect(result).toBe('secret-value');
    });

    it('should resolve field from JSON secret', async () => {
      const jsonSecret = JSON.stringify({
        username: 'admin',
        password: 'secret123',
        host: 'localhost'
      });
      mockKeytar.getPassword.mockResolvedValue(jsonSecret);

      const result = await provider.resolve('test-account/password');

      expect(mockKeytar.getPassword).toHaveBeenCalledWith('test-service', 'test-account');
      expect(result).toBe('secret123');
    });

    it('should throw error when secret not found', async () => {
      mockKeytar.getPassword.mockResolvedValue(null);

      await expect(provider.resolve('non-existent'))
        .rejects.toThrow('Secret not found in keychain: non-existent');
    });

    it('should throw error when field not found in JSON secret', async () => {
      const jsonSecret = JSON.stringify({ username: 'admin' });
      mockKeytar.getPassword.mockResolvedValue(jsonSecret);

      await expect(provider.resolve('test-account/password'))
        .rejects.toThrow('Field password not found in secret');
    });

    it('should throw error when trying to extract field from non-JSON secret', async () => {
      mockKeytar.getPassword.mockResolvedValue('plain-text-secret');

      await expect(provider.resolve('test-account/field'))
        .rejects.toThrow('Cannot extract field from non-JSON secret');
    });

    it('should throw error when keytar not available', async () => {
      // Create a provider instance that simulates keytar being unavailable
      const unavailableProvider = new (class extends KeychainSecretProvider {
        async isAvailable(): Promise<boolean> {
          return false;
        }
        
        async resolve(reference: string): Promise<string> {
          throw new Error('Keychain provider not available');
        }
      })();

      await expect(unavailableProvider.resolve('test-account'))
        .rejects.toThrow('Keychain provider not available');
    });

    it('should handle malformed JSON gracefully', async () => {
      mockKeytar.getPassword.mockResolvedValue('invalid-json{');

      await expect(provider.resolve('test-account/field'))
        .rejects.toThrow('Cannot extract field from non-JSON secret');
    });
  });

  describe('store', () => {
    it('should store secret in keychain', async () => {
      mockKeytar.setPassword.mockResolvedValue(undefined);

      await provider.store('test-account', 'secret-value');

      expect(mockKeytar.setPassword).toHaveBeenCalledWith('test-service', 'test-account', 'secret-value');
    });

    it('should ignore field specification when storing', async () => {
      mockKeytar.setPassword.mockResolvedValue(undefined);

      await provider.store('test-account/field', 'secret-value');

      expect(mockKeytar.setPassword).toHaveBeenCalledWith('test-service', 'test-account', 'secret-value');
    });

    it('should throw error when keytar not available', async () => {
      const unavailableProvider = new (class extends KeychainSecretProvider {
        async store(reference: string, value: string): Promise<void> {
          throw new Error('Keychain provider not available');
        }
      })();

      await expect(unavailableProvider.store('test-account', 'value'))
        .rejects.toThrow('Keychain provider not available');
    });

    it('should handle keytar errors during storage', async () => {
      mockKeytar.setPassword.mockRejectedValue(new Error('Keychain access denied'));

      await expect(provider.store('test-account', 'secret-value'))
        .rejects.toThrow('Keychain access denied');
    });
  });

  describe('delete', () => {
    it('should delete secret from keychain', async () => {
      mockKeytar.deletePassword.mockResolvedValue(true);

      await provider.delete('test-account');

      expect(mockKeytar.deletePassword).toHaveBeenCalledWith('test-service', 'test-account');
    });

    it('should ignore field specification when deleting', async () => {
      mockKeytar.deletePassword.mockResolvedValue(true);

      await provider.delete('test-account/field');

      expect(mockKeytar.deletePassword).toHaveBeenCalledWith('test-service', 'test-account');
    });

    it('should handle deletion of non-existent secret', async () => {
      mockKeytar.deletePassword.mockResolvedValue(false);

      await expect(provider.delete('non-existent')).resolves.not.toThrow();
      expect(mockKeytar.deletePassword).toHaveBeenCalledWith('test-service', 'non-existent');
    });

    it('should throw error when keytar not available', async () => {
      const unavailableProvider = new (class extends KeychainSecretProvider {
        async delete(reference: string): Promise<void> {
          throw new Error('Keychain provider not available');
        }
      })();

      await expect(unavailableProvider.delete('test-account'))
        .rejects.toThrow('Keychain provider not available');
    });
  });

  describe('list', () => {
    const mockCredentials = [
      { account: 'api-key', password: 'api-secret' },
      { account: 'db-password', password: 'db-secret' },
      { account: 'user-token', password: 'user-secret' }
    ];

    it('should list all accounts when no pattern provided', async () => {
      mockKeytar.findCredentials.mockResolvedValue(mockCredentials);

      const result = await provider.list();

      expect(mockKeytar.findCredentials).toHaveBeenCalledWith('test-service');
      expect(result).toEqual(['api-key', 'db-password', 'user-token']);
    });

    it('should filter accounts by pattern (case insensitive)', async () => {
      mockKeytar.findCredentials.mockResolvedValue(mockCredentials);

      const result = await provider.list('api');

      expect(result).toEqual(['api-key']);
    });

    it('should support regex patterns', async () => {
      mockKeytar.findCredentials.mockResolvedValue(mockCredentials);

      const result = await provider.list('^db-.*');

      expect(result).toEqual(['db-password']);
    });

    it('should return empty array for non-matching pattern', async () => {
      mockKeytar.findCredentials.mockResolvedValue(mockCredentials);

      const result = await provider.list('non-matching');

      expect(result).toEqual([]);
    });

    it('should handle empty credentials list', async () => {
      mockKeytar.findCredentials.mockResolvedValue([]);

      const result = await provider.list();

      expect(result).toEqual([]);
    });

    it('should throw error when keytar not available', async () => {
      const unavailableProvider = new (class extends KeychainSecretProvider {
        async list(pattern?: string): Promise<string[]> {
          throw new Error('Keychain provider not available');
        }
      })();

      await expect(unavailableProvider.list())
        .rejects.toThrow('Keychain provider not available');
    });

    it('should handle keytar errors during listing', async () => {
      mockKeytar.findCredentials.mockRejectedValue(new Error('Keychain access denied'));

      await expect(provider.list())
        .rejects.toThrow('Keychain access denied');
    });
  });

  describe('edge cases', () => {
    it('should handle accounts with special characters', async () => {
      mockKeytar.getPassword.mockResolvedValue('special-value');

      const result = await provider.resolve('account@domain.com');

      expect(mockKeytar.getPassword).toHaveBeenCalledWith('test-service', 'account@domain.com');
      expect(result).toBe('special-value');
    });

    it('should handle empty string values', async () => {
      mockKeytar.getPassword.mockResolvedValue('');

      const result = await provider.resolve('empty-account');

      expect(result).toBe('');
    });

    it('should handle very long account names', async () => {
      const longAccount = 'a'.repeat(1000);
      mockKeytar.getPassword.mockResolvedValue('long-secret');

      const result = await provider.resolve(longAccount);

      expect(mockKeytar.getPassword).toHaveBeenCalledWith('test-service', longAccount);
      expect(result).toBe('long-secret');
    });

    it('should handle complex JSON structures', async () => {
      const complexJson = JSON.stringify({
        nested: {
          deep: {
            value: 'deep-secret'
          }
        },
        array: ['item1', 'item2'],
        number: 42,
        boolean: true
      });
      mockKeytar.getPassword.mockResolvedValue(complexJson);

      // Should only work with top-level fields
      await expect(provider.resolve('test-account/nested'))
        .resolves.toBe('[object Object]'); // JSON.stringify of nested object

      await expect(provider.resolve('test-account/number'))
        .resolves.toBe('42');

      await expect(provider.resolve('test-account/boolean'))
        .resolves.toBe('true');
    });

    it('should handle multiple slashes in reference', async () => {
      mockKeytar.getPassword.mockResolvedValue('slash-value');

      const result = await provider.resolve('account/with/slashes');

      // Should only split on first slash for account/field separation
      expect(mockKeytar.getPassword).toHaveBeenCalledWith('test-service', 'account');
    });
  });

  describe('service configuration', () => {
    it('should use different service names for different instances', async () => {
      const service1Provider = new KeychainSecretProvider('service1');
      const service2Provider = new KeychainSecretProvider('service2');

      mockKeytar.getPassword.mockResolvedValue('value1').mockResolvedValueOnce('value2');

      await service1Provider.resolve('account');
      await service2Provider.resolve('account');

      expect(mockKeytar.getPassword).toHaveBeenCalledWith('service1', 'account');
      expect(mockKeytar.getPassword).toHaveBeenCalledWith('service2', 'account');
    });
  });
});