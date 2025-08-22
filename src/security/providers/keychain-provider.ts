import { BaseSecretProvider } from '../secret-provider';

interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

let keytar: KeytarModule | null = null;
try {
  keytar = require('keytar') as KeytarModule;
} catch {
  console.warn('Keytar not available - keychain provider disabled');
}

export class KeychainSecretProvider extends BaseSecretProvider {
  private service: string;

  constructor(service: string = 'omni-mcp-hub') {
    super('KEYCHAIN');
    this.service = service;
  }

  async isAvailable(): Promise<boolean> {
    return !!keytar;
  }

  async resolve(reference: string): Promise<string> {
    if (!keytar) {
      throw new Error('Keychain provider not available');
    }

    const [account, field] = reference.split('/');
    const password = await keytar.getPassword(this.service, account);
    
    if (!password) {
      throw new Error(`Secret not found in keychain: ${account}`);
    }

    if (field) {
      try {
        const parsed = JSON.parse(password) as Record<string, unknown>;
        if (parsed[field]) {
          return String(parsed[field]);
        }
        throw new Error(`Field ${field} not found in secret`);
      } catch {
        throw new Error(`Cannot extract field from non-JSON secret`);
      }
    }
    
    return password;
  }

  async store(reference: string, value: string): Promise<void> {
    if (!keytar) {
      throw new Error('Keychain provider not available');
    }

    const [account] = reference.split('/');
    await keytar.setPassword(this.service, account, value);
  }

  async delete(reference: string): Promise<void> {
    if (!keytar) {
      throw new Error('Keychain provider not available');
    }

    const [account] = reference.split('/');
    await keytar.deletePassword(this.service, account);
  }

  async list(pattern?: string): Promise<string[]> {
    if (!keytar) {
      throw new Error('Keychain provider not available');
    }

    const credentials = await keytar.findCredentials(this.service);
    const accounts = credentials.map(c => c.account);
    
    if (!pattern) {
      return accounts;
    }
    
    const regex = new RegExp(pattern, 'i');
    return accounts.filter(account => regex.test(account));
  }
}