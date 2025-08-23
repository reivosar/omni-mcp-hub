import { Request, Response, NextFunction } from 'express';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';

export interface TokenClaims {
  sub: string;
  email?: string;
  groups?: string[];
  profile?: string;
  permissions?: string[];
  exp: number;
  jti?: string;
  type?: 'user' | 'service_account';
}

export interface AuthConfig {
  enabled: boolean;
  jwksUri?: string;
  issuer?: string;
  audience?: string;
  algorithms?: string[];
  skipPaths?: string[];
  profileMapping?: Record<string, string>;
}

export class JWTAuthMiddleware extends EventEmitter {
  private config: AuthConfig;
  private middleware?: unknown;
  private tokenBlacklist: Set<string> = new Set();

  constructor(config: AuthConfig) {
    super();
    this.config = {
      algorithms: ['RS256'],
      skipPaths: ['/health', '/metrics'],
      ...config
    };

    if (this.config.enabled && this.config.jwksUri) {
      this.setupMiddleware();
    }
  }

  private setupMiddleware(): void {
    const secret = jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: this.config.jwksUri!
    }) as GetVerificationKey;

    this.middleware = expressjwt({
      secret,
      audience: this.config.audience,
      issuer: this.config.issuer,
      algorithms: this.config.algorithms as jwt.Algorithm[],
      credentialsRequired: true,
      getToken: this.extractToken.bind(this)
    });
  }

  private extractToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return undefined;
  }

  public authenticate() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.enabled) {
        return next();
      }

      const path = req.path;
      if (this.config.skipPaths?.some(skip => path.startsWith(skip))) {
        return next();
      }

      try {
        await new Promise<void>((resolve, reject) => {
          (this.middleware as (req: Request, res: Response, next: (err?: unknown) => void) => void)(req, res, (err: unknown) => {
            if (err) reject(err);
            else resolve();
          });
        });

        const claims = (req as unknown as { auth: TokenClaims }).auth;
        
        if (claims.jti && this.tokenBlacklist.has(claims.jti)) {
          this.emit('auth:rejected', { reason: 'blacklisted', claims });
          return res.status(401).json({ error: 'Token has been revoked' });
        }

        this.emit('auth:success', { claims, path });
        next();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.emit('auth:failure', { error: errorMessage, path });
        
        if ((error as { name?: string })?.name === 'UnauthorizedError') {
          return res.status(401).json({ 
            error: 'Invalid token',
            details: errorMessage 
          });
        }
        
        next(error);
      }
    };
  }

  public mapClaimsToProfile(claims: TokenClaims): string {
    if (claims.profile) {
      return claims.profile;
    }

    if (this.config.profileMapping && claims.groups) {
      for (const group of claims.groups) {
        if (this.config.profileMapping[group]) {
          return this.config.profileMapping[group];
        }
      }
    }

    return 'default';
  }

  public revokeToken(jti: string): void {
    if (jti) {
      this.tokenBlacklist.add(jti);
      this.emit('token:revoked', { jti });
    }
  }

  public clearBlacklist(): void {
    this.tokenBlacklist.clear();
    this.emit('blacklist:cleared');
  }

  public isTokenBlacklisted(jti: string): boolean {
    return this.tokenBlacklist.has(jti);
  }

  public getBlacklistSize(): number {
    return this.tokenBlacklist.size;
  }
}