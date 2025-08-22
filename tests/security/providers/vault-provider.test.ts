import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vault client - hoist this to top
const mockVaultClient = {
  token: '',
  health: vi.fn(),
  approleLogin: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  delete: vi.fn(),
  list: vi.fn()
};

// Mock node-vault module - hoist this to top
const mockVault = vi.fn(() => mockVaultClient);

// Use doMock for immediate application
vi.doMock('node-vault', () => mockVault);

import { VaultSecretProvider, VaultConfig } from '../../../src/security/providers/vault-provider';

describe('VaultSecretProvider', () => {
  let provider: VaultSecretProvider;
  let config: VaultConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock responses
    mockVaultClient.health.mockResolvedValue({ status: 'ok' });
    mockVaultClient.read.mockResolvedValue({ data: { data: {} } });
    mockVaultClient.write.mockResolvedValue(undefined);
    mockVaultClient.delete.mockResolvedValue(undefined);
    mockVaultClient.list.mockResolvedValue({ data: { keys: [] } });
    mockVaultClient.approleLogin.mockResolvedValue({ auth: { client_token: 'test-token' } });
    
    config = {
      endpoint: 'https://vault.example.com',
      token: 'vault-token-123'
    };
    provider = new VaultSecretProvider(config, mockVault as any);
  });

  describe('constructor', () => {
    it('should create provider with VAULT name', () => {
      expect(provider.getName()).toBe('VAULT');
    });

    it('should initialize client with token', () => {
      expect(mockVault).toHaveBeenCalledWith({
        endpoint: 'https://vault.example.com',
        apiVersion: 'v1'
      });
      expect(mockVaultClient.token).toBe('vault-token-123');
    });

    it('should handle custom API version', () => {
      const customConfig: VaultConfig = {
        endpoint: 'https://vault.example.com',
        apiVersion: 'v2'
      };

      new VaultSecretProvider(customConfig, mockVault as any);

      expect(mockVault).toHaveBeenCalledWith({
        endpoint: 'https://vault.example.com',
        apiVersion: 'v2'
      });
    });

    it('should handle namespace configuration', () => {
      const namespacedConfig: VaultConfig = {
        endpoint: 'https://vault.example.com',
        namespace: 'dev'
      };

      new VaultSecretProvider(namespacedConfig, mockVault as any);

      expect(mockVault).toHaveBeenCalledWith({
        endpoint: 'https://vault.example.com',
        apiVersion: 'v1',
        namespace: 'dev'
      });
    });
  });

  describe('isAvailable', () => {
    it('should return true when vault is healthy and authenticated', async () => {
      mockVaultClient.health.mockResolvedValue({ status: 'ok' });

      const available = await provider.isAvailable();

      expect(available).toBe(true);
      expect(mockVaultClient.health).toHaveBeenCalled();
    });

    it('should return false when vault health check fails', async () => {
      mockVaultClient.health.mockRejectedValue(new Error('Vault unreachable'));

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    it('should return false when no vault client', async () => {
      // Test when node-vault is not available
      const noVaultProvider = new (class extends VaultSecretProvider {
        constructor() {
          super({ endpoint: 'test' });
          (this as any).client = null;
        }
      })();

      await expect(noVaultProvider.isAvailable()).resolves.toBe(false);
    });
  });

  describe('authentication', () => {
    it('should use existing token when available', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: { data: { key: 'value' } }
      });

      await provider.resolve('secret/path');

      // Should not call approleLogin since token exists
      expect(mockVaultClient.approleLogin).not.toHaveBeenCalled();
    });

    it('should authenticate with AppRole when no token', async () => {
      const approleConfig: VaultConfig = {
        endpoint: 'https://vault.example.com',
        roleId: 'role-123',
        secretId: 'secret-456'
      };

      const approleProvider = new VaultSecretProvider(approleConfig, mockVault as any);
      
      mockVaultClient.approleLogin.mockResolvedValue({
        auth: { client_token: 'new-token-123' }
      });
      mockVaultClient.read.mockResolvedValue({
        data: { data: { key: 'value' } }
      });

      await approleProvider.resolve('secret/path');

      expect(mockVaultClient.approleLogin).toHaveBeenCalledWith({
        role_id: 'role-123',
        secret_id: 'secret-456'
      });
      expect(mockVaultClient.token).toBe('new-token-123');
    });

    it('should throw error when no authentication method configured', async () => {
      const noAuthConfig: VaultConfig = {
        endpoint: 'https://vault.example.com'
      };

      const noAuthProvider = new VaultSecretProvider(noAuthConfig, mockVault as any);

      await expect(noAuthProvider.resolve('secret/path'))
        .rejects.toThrow('No authentication method configured for Vault');
    });
  });

  describe('resolve', () => {
    it('should resolve secret from vault', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: { data: { username: 'admin', password: 'secret123' } }
      });

      const result = await provider.resolve('secret/api');

      expect(mockVaultClient.read).toHaveBeenCalledWith('secret/api');
      expect(result).toBe('{"username":"admin","password":"secret123"}');
    });

    it('should resolve specific field from secret', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: { data: { username: 'admin', password: 'secret123' } }
      });

      const result = await provider.resolve('secret/api:password');

      expect(mockVaultClient.read).toHaveBeenCalledWith('secret/api');
      expect(result).toBe('secret123');
    });

    it('should handle KV v1 response format', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: { username: 'admin', password: 'secret123' }
      });

      const result = await provider.resolve('secret/api:username');

      expect(result).toBe('admin');
    });

    it('should handle string data directly', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: 'plain-string-secret'
      });

      const result = await provider.resolve('secret/string');

      expect(result).toBe('plain-string-secret');
    });

    it('should throw error when secret not found', async () => {
      mockVaultClient.read.mockResolvedValue({});

      await expect(provider.resolve('secret/nonexistent'))
        .rejects.toThrow('Secret not found in Vault: secret/nonexistent');
    });

    it('should throw error when field not found', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: { data: { username: 'admin' } }
      });

      await expect(provider.resolve('secret/api:password'))
        .rejects.toThrow('Field password not found in secret secret/api');
    });

    it('should throw error when vault not available', async () => {
      const noVaultProvider = new (class extends VaultSecretProvider {
        constructor() {
          super({ endpoint: 'test' });
          (this as any).client = null;
        }
      })();

      await expect(noVaultProvider.resolve('secret/path'))
        .rejects.toThrow('Vault provider not available');
    });
  });

  describe('store', () => {
    it('should store secret in vault', async () => {
      mockVaultClient.write.mockResolvedValue(undefined);

      await provider.store('secret/new', 'new-secret-value');

      expect(mockVaultClient.write).toHaveBeenCalledWith('secret/new', {
        data: { value: 'new-secret-value' }
      });
    });

    it('should store field in existing secret', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: { data: { username: 'admin' } }
      });
      mockVaultClient.write.mockResolvedValue(undefined);

      await provider.store('secret/api:password', 'new-password');

      expect(mockVaultClient.read).toHaveBeenCalledWith('secret/api');
      expect(mockVaultClient.write).toHaveBeenCalledWith('secret/api', {
        data: { username: 'admin', password: 'new-password' }
      });
    });

    it('should create new secret when existing not found', async () => {
      mockVaultClient.read.mockRejectedValue(new Error('Not found'));
      mockVaultClient.write.mockResolvedValue(undefined);

      await provider.store('secret/new:field', 'field-value');

      expect(mockVaultClient.write).toHaveBeenCalledWith('secret/new', {
        data: { field: 'field-value' }
      });
    });

    it('should throw error when vault not available', async () => {
      const noVaultProvider = new (class extends VaultSecretProvider {
        constructor() {
          super({ endpoint: 'test' });
          (this as any).client = null;
        }
      })();

      await expect(noVaultProvider.store('secret/path', 'value'))
        .rejects.toThrow('Vault provider not available');
    });
  });

  describe('delete', () => {
    it('should delete secret from vault', async () => {
      mockVaultClient.delete.mockResolvedValue(undefined);

      await provider.delete('secret/old');

      expect(mockVaultClient.delete).toHaveBeenCalledWith('secret/old');
    });

    it('should ignore field specification for deletion', async () => {
      mockVaultClient.delete.mockResolvedValue(undefined);

      await provider.delete('secret/api:password');

      expect(mockVaultClient.delete).toHaveBeenCalledWith('secret/api');
    });

    it('should throw error when vault not available', async () => {
      const noVaultProvider = new (class extends VaultSecretProvider {
        constructor() {
          super({ endpoint: 'test' });
          (this as any).client = null;
        }
      })();

      await expect(noVaultProvider.delete('secret/path'))
        .rejects.toThrow('Vault provider not available');
    });
  });

  describe('list', () => {
    it('should list secrets with default path', async () => {
      mockVaultClient.list.mockResolvedValue({
        data: { keys: ['api-key', 'db-password', 'user-token'] }
      });

      const result = await provider.list();

      expect(mockVaultClient.list).toHaveBeenCalledWith('secret/data');
      expect(result).toEqual(['api-key', 'db-password', 'user-token']);
    });

    it('should list secrets with custom pattern', async () => {
      mockVaultClient.list.mockResolvedValue({
        data: { keys: ['app1/config', 'app2/config'] }
      });

      const result = await provider.list('apps/');

      expect(mockVaultClient.list).toHaveBeenCalledWith('apps/');
      expect(result).toEqual(['app1/config', 'app2/config']);
    });

    it('should return empty array when no secrets found', async () => {
      mockVaultClient.list.mockRejectedValue(new Error('Path not found'));

      const result = await provider.list();

      expect(result).toEqual([]);
    });

    it('should handle missing keys in response', async () => {
      mockVaultClient.list.mockResolvedValue({
        data: {}
      });

      const result = await provider.list();

      expect(result).toEqual([]);
    });

    it('should throw error when vault not available', async () => {
      const noVaultProvider = new (class extends VaultSecretProvider {
        constructor() {
          super({ endpoint: 'test' });
          (this as any).client = null;
        }
      })();

      await expect(noVaultProvider.list())
        .rejects.toThrow('Vault provider not available');
    });
  });

  describe('error handling', () => {
    it('should handle vault authentication errors', async () => {
      const approleConfig: VaultConfig = {
        endpoint: 'https://vault.example.com',
        roleId: 'invalid-role',
        secretId: 'invalid-secret'
      };

      const approleProvider = new VaultSecretProvider(approleConfig, mockVault as any);
      
      mockVaultClient.approleLogin.mockRejectedValue(new Error('Authentication failed'));

      await expect(approleProvider.resolve('secret/path'))
        .rejects.toThrow('Authentication failed');
    });

    it('should handle vault network errors', async () => {
      mockVaultClient.read.mockRejectedValue(new Error('Network timeout'));

      await expect(provider.resolve('secret/path'))
        .rejects.toThrow('Network timeout');
    });

    it('should handle malformed vault responses', async () => {
      mockVaultClient.read.mockResolvedValue(null);

      await expect(provider.resolve('secret/path'))
        .rejects.toThrow('Secret not found in Vault: secret/path');
    });
  });

  describe('edge cases', () => {
    it('should handle paths with special characters', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: { data: { field: 'special-value' } }
      });

      const result = await provider.resolve('secret/path@with#special:field');

      expect(mockVaultClient.read).toHaveBeenCalledWith('secret/path@with#special');
      expect(result).toBe('special-value');
    });

    it('should handle very long paths', async () => {
      const longPath = 'secret/' + 'a'.repeat(1000);
      mockVaultClient.read.mockResolvedValue({
        data: { data: { key: 'long-value' } }
      });

      await provider.resolve(longPath);

      expect(mockVaultClient.read).toHaveBeenCalledWith(longPath);
    });

    it('should handle empty field values', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: { data: { empty: '', zero: 0, false: false } }
      });

      expect(await provider.resolve('secret/test:empty')).toBe('');
      expect(await provider.resolve('secret/test:zero')).toBe('0');
      expect(await provider.resolve('secret/test:false')).toBe('false');
    });

    it('should handle nested object conversion to string', async () => {
      mockVaultClient.read.mockResolvedValue({
        data: { 
          data: { 
            nested: { deep: { value: 'deep-secret' } },
            array: [1, 2, 3]
          } 
        }
      });

      const nestedResult = await provider.resolve('secret/test:nested');
      expect(nestedResult).toBe('[object Object]');

      const arrayResult = await provider.resolve('secret/test:array');
      expect(arrayResult).toBe('1,2,3');
    });
  });

  describe('configuration variations', () => {
    it('should handle minimal configuration', () => {
      const minimalConfig: VaultConfig = {
        endpoint: 'https://vault.minimal.com'
      };

      const minimalProvider = new VaultSecretProvider(minimalConfig, mockVault as any);

      expect(minimalProvider.getName()).toBe('VAULT');
      expect(mockVault).toHaveBeenCalledWith({
        endpoint: 'https://vault.minimal.com',
        apiVersion: 'v1'
      });
    });

    it('should handle all configuration options', () => {
      const fullConfig: VaultConfig = {
        endpoint: 'https://vault.full.com',
        token: 'full-token',
        roleId: 'full-role',
        secretId: 'full-secret',
        namespace: 'full-namespace',
        apiVersion: 'v2'
      };

      new VaultSecretProvider(fullConfig, mockVault as any);

      expect(mockVault).toHaveBeenCalledWith({
        endpoint: 'https://vault.full.com',
        apiVersion: 'v2',
        namespace: 'full-namespace'
      });
    });
  });
});