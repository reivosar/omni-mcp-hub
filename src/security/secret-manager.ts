import { EventEmitter } from "events";
import {
  SecretProvider,
  parseSecretReference,
  maskSecret,
} from "./secret-provider";

export interface SecretManagerConfig {
  provider?: "keychain" | "env" | "vault";
  fallback?: "keychain" | "env" | "vault";
  vault?: Record<string, unknown>;
  keychainService?: string;
  cacheTTL?: number;
  auditEnabled?: boolean;
}

interface CachedSecret {
  value: string;
  expiresAt: Date;
}

export class SecretManager extends EventEmitter {
  private providers: Map<string, SecretProvider> = new Map();
  private cache: Map<string, CachedSecret> = new Map();
  private config: SecretManagerConfig;
  private primaryProvider?: SecretProvider;
  private fallbackProvider?: SecretProvider;

  constructor(config: SecretManagerConfig = {}) {
    super();
    this.config = {
      provider: "env",
      cacheTTL: 300,
      auditEnabled: true,
      ...config,
    };
  }

  public async resolveSecret(reference: string): Promise<string> {
    const cached = this.getCachedSecret(reference);
    if (cached) {
      this.audit("cache-hit", reference);
      return cached;
    }

    const parsed = parseSecretReference(reference);

    if (!parsed) {
      if (this.primaryProvider) {
        return this.resolveWithProvider(this.primaryProvider, reference);
      }
      throw new Error(`Invalid secret reference: ${reference}`);
    }

    const provider = this.providers.get(parsed.provider);
    if (!provider) {
      if (this.fallbackProvider) {
        return this.resolveWithProvider(this.fallbackProvider, parsed.path);
      }
      throw new Error(`Secret provider not available: ${parsed.provider}`);
    }

    return this.resolveWithProvider(provider, parsed.path);
  }

  private async resolveWithProvider(
    provider: SecretProvider,
    reference: string,
  ): Promise<string> {
    try {
      const value = await provider.resolve(reference);
      this.cacheSecret(reference, value);
      this.audit("resolved", reference, provider.getName());
      return value;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.audit("resolve-failed", reference, provider.getName(), errorMessage);

      if (this.fallbackProvider && provider !== this.fallbackProvider) {
        this.emit("provider:fallback", {
          from: provider.getName(),
          to: this.fallbackProvider.getName(),
        });
        return this.resolveWithProvider(this.fallbackProvider, reference);
      }

      throw error;
    }
  }

  public async resolveConfig(
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const resolved = JSON.parse(JSON.stringify(config));

    const resolveValue = async (value: unknown): Promise<unknown> => {
      if (typeof value === "string") {
        const secretRegex = /\$\{[^}]+\}/g;
        const matches = value.match(secretRegex);

        if (matches) {
          let result = value;
          for (const match of matches) {
            try {
              const secret = await this.resolveSecret(match);
              result = result.replace(match, secret);
            } catch (error: unknown) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              this.emit("config:resolve-error", {
                reference: match,
                error: errorMessage,
              });
              throw error;
            }
          }
          return result;
        }
      } else if (Array.isArray(value)) {
        return Promise.all(value.map(resolveValue));
      } else if (value && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(
          value as Record<string, unknown>,
        )) {
          result[key] = await resolveValue(val);
        }
        return result;
      }

      return value;
    };

    return resolveValue(resolved) as Promise<Record<string, unknown>>;
  }

  private getCachedSecret(reference: string): string | null {
    const cached = this.cache.get(reference);

    if (!cached) {
      return null;
    }

    if (new Date() > cached.expiresAt) {
      this.cache.delete(reference);
      return null;
    }

    return cached.value;
  }

  private cacheSecret(reference: string, value: string): void {
    if (this.config.cacheTTL && this.config.cacheTTL > 0) {
      const expiresAt = new Date(Date.now() + this.config.cacheTTL * 1000);
      this.cache.set(reference, { value, expiresAt });
    }
  }

  private audit(
    action: string,
    reference: string,
    provider?: string,
    error?: string,
  ): void {
    if (!this.config.auditEnabled) {
      return;
    }

    const entry = {
      timestamp: new Date(),
      action,
      reference,
      provider,
      error,
      masked: maskSecret(reference),
    };

    this.emit("audit", entry);
  }

  public getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  public clearCache(): void {
    this.cache.clear();
    this.emit("cache:cleared");
  }

  public getStats(): Record<string, unknown> {
    return {
      providers: this.getProviders(),
      cacheSize: this.cache.size,
      primaryProvider: this.primaryProvider?.getName(),
      fallbackProvider: this.fallbackProvider?.getName(),
    };
  }
}
