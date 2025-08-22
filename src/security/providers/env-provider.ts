import { BaseSecretProvider } from '../secret-provider';

export class EnvironmentSecretProvider extends BaseSecretProvider {
  constructor() {
    super('ENV');
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async resolve(reference: string): Promise<string> {
    const envVar = this.sanitizeReference(reference).toUpperCase();
    const value = process.env[envVar];
    
    if (!value) {
      throw new Error(`Environment variable ${envVar} not found`);
    }
    
    return value;
  }

  async store(reference: string, value: string): Promise<void> {
    const envVar = this.sanitizeReference(reference).toUpperCase();
    process.env[envVar] = value;
  }

  async delete(reference: string): Promise<void> {
    const envVar = this.sanitizeReference(reference).toUpperCase();
    delete process.env[envVar];
  }

  async list(pattern?: string): Promise<string[]> {
    const keys = Object.keys(process.env);
    
    if (!pattern) {
      return keys;
    }
    
    const regex = new RegExp(pattern, 'i');
    return keys.filter(key => regex.test(key));
  }
}