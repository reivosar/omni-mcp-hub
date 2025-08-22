export interface SecretProvider {
  getName(): string;
  isAvailable(): Promise<boolean>;
  resolve(reference: string): Promise<string>;
  store(reference: string, value: string): Promise<void>;
  delete(reference: string): Promise<void>;
  list(pattern?: string): Promise<string[]>;
}

export interface SecretReference {
  provider: string;
  path: string;
  field?: string;
}

export function parseSecretReference(reference: string): SecretReference | null {
  const match = reference.match(/^\$\{([^:]+):([^}]+)\}$/);
  if (!match) {
    return null;
  }

  const [, provider, fullPath] = match;
  const parts = fullPath.split(':');
  
  return {
    provider: provider.toUpperCase(),
    path: parts[0],
    field: parts[1]
  };
}

export function maskSecret(value: string): string {
  if (!value || value.length <= 4) {
    return '****';
  }
  
  const visibleChars = Math.min(4, Math.floor(value.length * 0.2));
  const masked = '*'.repeat(value.length - visibleChars);
  return value.substring(0, visibleChars) + masked;
}

export abstract class BaseSecretProvider implements SecretProvider {
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  abstract isAvailable(): Promise<boolean>;
  abstract resolve(reference: string): Promise<string>;
  abstract store(reference: string, value: string): Promise<void>;
  abstract delete(reference: string): Promise<void>;
  abstract list(pattern?: string): Promise<string[]>;

  protected sanitizeReference(reference: string): string {
    return reference.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  }
}