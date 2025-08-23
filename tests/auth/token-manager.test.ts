import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenManager, TokenManagerConfig, TokenResponse } from '../../src/auth/token-manager';

// Mock node-fetch
vi.mock('node-fetch', () => ({
  default: vi.fn()
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    decode: vi.fn()
  }
}));

describe('TokenManager', () => {
  let tokenManager: TokenManager;
  let config: TokenManagerConfig;
  let mockFetch: any;
  let jwtModule: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const nodeFetch = await import('node-fetch');
    mockFetch = nodeFetch.default as any;
    jwtModule = await import('jsonwebtoken');
    config = {
      issuer: 'https://auth.example.com',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      scope: 'read write',
      refreshBeforeExpiry: 300
    };
    tokenManager = new TokenManager(config);
  });

  afterEach(() => {
    tokenManager.destroy();
  });

  describe('constructor', () => {
    it('should create TokenManager with config', () => {
      expect(tokenManager).toBeInstanceOf(TokenManager);
      expect(tokenManager.hasValidToken()).toBe(false);
    });

    it('should use default refreshBeforeExpiry when not provided', () => {
      const configWithoutRefresh = {
        issuer: 'https://auth.example.com',
        clientId: 'test-client'
      };
      
      const manager = new TokenManager(configWithoutRefresh);
      expect(manager).toBeInstanceOf(TokenManager);
      manager.destroy();
    });
  });

  describe('storeToken', () => {
    it('should store token response', async () => {
      const tokenResponse: TokenResponse = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      tokenManager.storeToken(tokenResponse);

      expect(tokenManager.hasValidToken()).toBe(true);
      expect(tokenManager.getTokenExpiry()).toBeInstanceOf(Date);
    });

    it('should store token without refresh token', async () => {
      const tokenResponse: TokenResponse = {
        access_token: 'access-123',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      expect(() => {
        tokenManager.storeToken(tokenResponse);
      }).not.toThrow();

      expect(tokenManager.hasValidToken()).toBe(true);
    });

    it('should handle token without exp claim', async () => {
      const tokenResponse: TokenResponse = {
        access_token: 'access-123',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      vi.mocked(jwtModule.default.decode).mockReturnValue({});

      tokenManager.storeToken(tokenResponse);

      expect(tokenManager.getTokenExpiry()).toBeInstanceOf(Date);
    });
  });

  describe('getValidToken', () => {
    it('should return current token if valid', async () => {
      const tokenResponse: TokenResponse = {
        access_token: 'access-123',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      tokenManager.storeToken(tokenResponse);

      const token = await tokenManager.getValidToken();
      expect(token).toBe('access-123');
    });

    it('should throw error when no refresh token available', async () => {
      await expect(tokenManager.getValidToken()).rejects.toThrow('No refresh token available');
    });

    it('should refresh token when current token is expired', async () => {
      // Store an expired token first
      const expiredResponse: TokenResponse = {
        access_token: 'expired-token',
        refresh_token: 'refresh-123',
        expires_in: 1,
        token_type: 'Bearer'
      };

      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) - 1 });

      tokenManager.storeToken(expiredResponse);

      // Mock successful refresh
      const newTokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(newTokenResponse)
      });

      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const token = await tokenManager.getValidToken();
      expect(token).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });
  });

  describe('authenticateWithClientCredentials', () => {
    it('should authenticate with client credentials', async () => {
      const tokenResponse: TokenResponse = {
        access_token: 'client-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(tokenResponse)
      });

      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const result = await tokenManager.authenticateWithClientCredentials();

      expect(result).toEqual(tokenResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      );
    });

    it('should throw error when client secret is missing', async () => {
      const configWithoutSecret = {
        issuer: 'https://auth.example.com',
        clientId: 'test-client'
      };
      
      const manager = new TokenManager(configWithoutSecret);

      await expect(manager.authenticateWithClientCredentials())
        .rejects.toThrow('Client secret required for client credentials flow');
      
      manager.destroy();
    });

    it('should handle authentication failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Authentication failed')
      });

      await expect(tokenManager.authenticateWithClientCredentials())
        .rejects.toThrow('Client credentials authentication failed: Authentication failed');
    });
  });

  describe('token refresh', () => {
    it('should refresh access token', async () => {
      // Set initial token with refresh token
      tokenManager.setRefreshToken('refresh-123');

      const newTokenResponse: TokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(newTokenResponse)
      });

      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const result = await (tokenManager as any).refreshAccessToken();

      expect(result).toEqual(newTokenResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should handle refresh failure', async () => {
      tokenManager.setRefreshToken('refresh-123');

      mockFetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Invalid refresh token')
      });

      await expect((tokenManager as any).refreshAccessToken())
        .rejects.toThrow('Token refresh failed: Invalid refresh token');
    });
  });

  describe('token management', () => {
    it('should set refresh token', async () => {
      const eventSpy = vi.fn();
      tokenManager.on('refresh-token:set', eventSpy);

      tokenManager.setRefreshToken('refresh-token-123');

      expect(eventSpy).toHaveBeenCalledWith();
    });

    it('should clear tokens', async () => {
      const tokenResponse: TokenResponse = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      tokenManager.storeToken(tokenResponse);
      expect(tokenManager.hasValidToken()).toBe(true);

      tokenManager.clearTokens();
      expect(tokenManager.hasValidToken()).toBe(false);
      expect(tokenManager.getTokenExpiry()).toBeUndefined();
    });

    it('should destroy token manager', async () => {
      const eventSpy = vi.fn();
      tokenManager.on('tokens:cleared', eventSpy);

      tokenManager.destroy();

      expect(tokenManager.listenerCount('tokens:cleared')).toBe(0);
    });
  });

  describe('events', () => {
    it('should emit token:stored event', async () => {
      const eventSpy = vi.fn();
      tokenManager.on('token:stored', eventSpy);

      const tokenResponse: TokenResponse = {
        access_token: 'access-123',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      tokenManager.storeToken(tokenResponse);

      expect(eventSpy).toHaveBeenCalledWith({
        expiresAt: expect.any(Date)
      });
    });

    it('should emit tokens:cleared event', async () => {
      const eventSpy = vi.fn();
      tokenManager.on('tokens:cleared', eventSpy);

      tokenManager.clearTokens();

      expect(eventSpy).toHaveBeenCalledWith();
    });
  });

  describe('edge cases', () => {
    it('should handle malformed token response', async () => {
      const tokenResponse: TokenResponse = {
        access_token: '',
        expires_in: 0,
        token_type: 'Bearer'
      };

      vi.mocked(jwtModule.default.decode).mockReturnValue(null);

      expect(() => {
        tokenManager.storeToken(tokenResponse);
      }).not.toThrow();
    });

    it('should validate token expiry correctly', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const pastExp = Math.floor(Date.now() / 1000) - 3600;

      
      // Valid token
      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: futureExp });
      tokenManager.storeToken({
        access_token: 'valid-token',
        expires_in: 3600,
        token_type: 'Bearer'
      });
      expect(tokenManager.hasValidToken()).toBe(true);

      // Expired token
      vi.mocked(jwtModule.default.decode).mockReturnValue({ exp: pastExp });
      tokenManager.storeToken({
        access_token: 'expired-token',
        expires_in: 1,
        token_type: 'Bearer'
      });
      expect(tokenManager.hasValidToken()).toBe(false);
    });
  });
});