import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JWTAuthMiddleware, AuthConfig } from '../../src/auth/jwt-middleware';
import { Request, Response, NextFunction } from 'express';

// Mock express-jwt and jwks-rsa
vi.mock('express-jwt', () => ({
  expressjwt: vi.fn(() => vi.fn())
}));

vi.mock('jwks-rsa', () => ({
  default: {
    expressJwtSecret: vi.fn(() => vi.fn())
  }
}));

describe('JWTAuthMiddleware', () => {
  let middleware: JWTAuthMiddleware;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      path: '/api/test',
      headers: {}
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn();
  });

  describe('constructor', () => {
    it('should create middleware with default config when disabled', () => {
      const config: AuthConfig = { enabled: false };
      middleware = new JWTAuthMiddleware(config);
      
      expect(middleware).toBeInstanceOf(JWTAuthMiddleware);
      expect(middleware.getBlacklistSize()).toBe(0);
    });

    it('should create middleware with custom config', () => {
      const config: AuthConfig = {
        enabled: false,
        algorithms: ['HS256'],
        skipPaths: ['/custom'],
        profileMapping: { admin: 'admin-profile' }
      };
      
      middleware = new JWTAuthMiddleware(config);
      expect(middleware).toBeInstanceOf(JWTAuthMiddleware);
    });
  });

  describe('authenticate', () => {
    beforeEach(() => {
      const config: AuthConfig = { enabled: false };
      middleware = new JWTAuthMiddleware(config);
    });

    it('should skip authentication when disabled', async () => {
      const authMiddleware = middleware.authenticate();
      
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should skip authentication for skip paths', async () => {
      const config: AuthConfig = { 
        enabled: true, 
        skipPaths: ['/health', '/metrics'] 
      };
      middleware = new JWTAuthMiddleware(config);
      
      mockReq.path = '/health';
      const authMiddleware = middleware.authenticate();
      
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('token extraction', () => {
    beforeEach(() => {
      const config: AuthConfig = { enabled: false };
      middleware = new JWTAuthMiddleware(config);
    });

    it('should extract token from Authorization header', () => {
      mockReq.headers = {
        authorization: 'Bearer test-token-123'
      };
      
      const token = (middleware as any).extractToken(mockReq);
      expect(token).toBe('test-token-123');
    });

    it('should return undefined for missing Authorization header', () => {
      const token = (middleware as any).extractToken(mockReq);
      expect(token).toBeUndefined();
    });

    it('should return undefined for malformed Authorization header', () => {
      mockReq.headers = {
        authorization: 'InvalidFormat test-token-123'
      };
      
      const token = (middleware as any).extractToken(mockReq);
      expect(token).toBeUndefined();
    });
  });

  describe('mapClaimsToProfile', () => {
    beforeEach(() => {
      const config: AuthConfig = {
        enabled: false,
        profileMapping: {
          'admin': 'admin-profile',
          'user': 'user-profile'
        }
      };
      middleware = new JWTAuthMiddleware(config);
    });

    it('should return explicit profile from claims', () => {
      const claims = {
        sub: 'user123',
        profile: 'custom-profile',
        exp: Date.now() / 1000 + 3600
      };
      
      const profile = middleware.mapClaimsToProfile(claims);
      expect(profile).toBe('custom-profile');
    });

    it('should map group to profile using profileMapping', () => {
      const claims = {
        sub: 'user123',
        groups: ['admin', 'user'],
        exp: Date.now() / 1000 + 3600
      };
      
      const profile = middleware.mapClaimsToProfile(claims);
      expect(profile).toBe('admin-profile');
    });

    it('should return default profile when no mapping found', () => {
      const claims = {
        sub: 'user123',
        groups: ['unknown'],
        exp: Date.now() / 1000 + 3600
      };
      
      const profile = middleware.mapClaimsToProfile(claims);
      expect(profile).toBe('default');
    });

    it('should return default profile when no groups provided', () => {
      const claims = {
        sub: 'user123',
        exp: Date.now() / 1000 + 3600
      };
      
      const profile = middleware.mapClaimsToProfile(claims);
      expect(profile).toBe('default');
    });
  });

  describe('token blacklist', () => {
    beforeEach(() => {
      const config: AuthConfig = { enabled: false };
      middleware = new JWTAuthMiddleware(config);
    });

    it('should add token to blacklist', () => {
      const jti = 'token-id-123';
      
      middleware.revokeToken(jti);
      
      expect(middleware.isTokenBlacklisted(jti)).toBe(true);
      expect(middleware.getBlacklistSize()).toBe(1);
    });

    it('should not add empty token to blacklist', () => {
      middleware.revokeToken('');
      
      expect(middleware.getBlacklistSize()).toBe(0);
    });

    it('should clear blacklist', () => {
      middleware.revokeToken('token1');
      middleware.revokeToken('token2');
      
      expect(middleware.getBlacklistSize()).toBe(2);
      
      middleware.clearBlacklist();
      
      expect(middleware.getBlacklistSize()).toBe(0);
      expect(middleware.isTokenBlacklisted('token1')).toBe(false);
    });

    it('should check if token is blacklisted', () => {
      const jti = 'token-id-456';
      
      expect(middleware.isTokenBlacklisted(jti)).toBe(false);
      
      middleware.revokeToken(jti);
      
      expect(middleware.isTokenBlacklisted(jti)).toBe(true);
    });
  });

  describe('events', () => {
    beforeEach(() => {
      const config: AuthConfig = { enabled: false };
      middleware = new JWTAuthMiddleware(config);
    });

    it('should emit token:revoked event when revoking token', () => {
      const eventSpy = vi.fn();
      middleware.on('token:revoked', eventSpy);
      
      const jti = 'token-123';
      middleware.revokeToken(jti);
      
      expect(eventSpy).toHaveBeenCalledWith({ jti });
    });

    it('should emit blacklist:cleared event when clearing blacklist', () => {
      const eventSpy = vi.fn();
      middleware.on('blacklist:cleared', eventSpy);
      
      middleware.clearBlacklist();
      
      expect(eventSpy).toHaveBeenCalledWith();
    });
  });

  describe('error handling', () => {
    it('should handle missing jwksUri gracefully', () => {
      const config: AuthConfig = {
        enabled: true
        // jwksUri is missing
      };
      
      expect(() => {
        new JWTAuthMiddleware(config);
      }).not.toThrow();
    });
  });
});