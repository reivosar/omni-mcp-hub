import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface TokenManagerConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  refreshBeforeExpiry?: number;
}

export class TokenManager extends EventEmitter {
  private config: TokenManagerConfig;
  private currentToken?: string;
  private refreshToken?: string;
  private tokenExpiry?: Date;
  private refreshTimer?: NodeJS.Timeout;

  constructor(config: TokenManagerConfig) {
    super();
    this.config = {
      refreshBeforeExpiry: 300,
      ...config
    };
  }

  public async getValidToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.currentToken!;
    }

    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const refreshed = await this.refreshAccessToken();
      this.storeToken(refreshed);
      this.emit('token:refreshed', { expiresAt: this.tokenExpiry });
      return refreshed.access_token;
    } catch (error) {
      this.emit('token:refresh-failed', { error });
      throw error;
    }
  }

  private isTokenValid(): boolean {
    if (!this.currentToken || !this.tokenExpiry) {
      return false;
    }

    const now = new Date();
    const buffer = (this.config.refreshBeforeExpiry || 0) * 1000;
    return now.getTime() < this.tokenExpiry.getTime() - buffer;
  }

  private async refreshAccessToken(): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken!,
      client_id: this.config.clientId,
      ...(this.config.clientSecret && { client_secret: this.config.clientSecret }),
      ...(this.config.scope && { scope: this.config.scope })
    });

    const response = await fetch(`${this.config.issuer}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    return response.json() as Promise<TokenResponse>;
  }

  public storeToken(tokenResponse: TokenResponse): void {
    this.currentToken = tokenResponse.access_token;
    
    if (tokenResponse.refresh_token) {
      this.refreshToken = tokenResponse.refresh_token;
    }

    const decoded = jwt.decode(this.currentToken) as { exp?: number };
    if (decoded?.exp) {
      this.tokenExpiry = new Date(decoded.exp * 1000);
    } else if (tokenResponse.expires_in) {
      this.tokenExpiry = new Date(Date.now() + tokenResponse.expires_in * 1000);
    }

    this.scheduleRefresh();
    this.emit('token:stored', { expiresAt: this.tokenExpiry });
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokenExpiry || !this.refreshToken) {
      return;
    }

    const now = new Date();
    const buffer = (this.config.refreshBeforeExpiry || 0) * 1000;
    const refreshAt = this.tokenExpiry.getTime() - buffer - now.getTime();

    if (refreshAt > 0) {
      this.refreshTimer = setTimeout(async () => {
        try {
          await this.getValidToken();
          this.emit('token:auto-refreshed');
        } catch (error) {
          this.emit('token:auto-refresh-failed', { error });
        }
      }, refreshAt);
    }
  }

  public setRefreshToken(refreshToken: string): void {
    this.refreshToken = refreshToken;
    this.emit('refresh-token:set');
  }

  public clearTokens(): void {
    this.currentToken = undefined;
    this.refreshToken = undefined;
    this.tokenExpiry = undefined;
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    this.emit('tokens:cleared');
  }

  public getTokenExpiry(): Date | undefined {
    return this.tokenExpiry;
  }

  public hasValidToken(): boolean {
    return this.isTokenValid();
  }

  public async authenticateWithClientCredentials(): Promise<TokenResponse> {
    if (!this.config.clientSecret) {
      throw new Error('Client secret required for client credentials flow');
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...(this.config.scope && { scope: this.config.scope })
    });

    const response = await fetch(`${this.config.issuer}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Client credentials authentication failed: ${error}`);
    }

    const tokenResponse = await response.json() as TokenResponse;
    this.storeToken(tokenResponse);
    this.emit('auth:client-credentials-success');
    
    return tokenResponse;
  }

  public destroy(): void {
    this.clearTokens();
    this.removeAllListeners();
  }
}