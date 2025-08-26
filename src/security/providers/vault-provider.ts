import { BaseSecretProvider } from "../secret-provider";

interface VaultClient {
  token: string;
  health(): Promise<unknown>;
  approleLogin(options: {
    role_id: string;
    secret_id: string;
  }): Promise<{ auth: { client_token: string } }>;
  read(path: string): Promise<{ data?: { data?: Record<string, unknown> } }>;
  write(path: string, data: { data: Record<string, unknown> }): Promise<void>;
  delete(path: string): Promise<void>;
  list(path: string): Promise<{ data: { keys: string[] } }>;
}

interface VaultModule {
  (options: VaultConfig): VaultClient;
}

// Use a function that can be mocked by tests
function loadVault(): VaultModule | null {
  try {
    return require("node-vault") as VaultModule;
  } catch {
    console.warn("node-vault not available - Vault provider disabled");
    return null;
  }
}

export interface VaultConfig {
  endpoint: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
  apiVersion?: string;
}

export class VaultSecretProvider extends BaseSecretProvider {
  private client: VaultClient | null = null;
  private config: VaultConfig;
  private vault: VaultModule | null;

  constructor(config: VaultConfig, vaultInstance?: VaultModule) {
    super("VAULT");
    this.config = config;
    this.vault = vaultInstance || loadVault();

    if (this.vault) {
      this.initializeClient();
    }
  }

  private initializeClient(): void {
    if (!this.vault) return;

    const options: VaultConfig = {
      endpoint: this.config.endpoint,
      apiVersion: this.config.apiVersion || "v1",
    };

    if (this.config.namespace) {
      options.namespace = this.config.namespace;
    }

    this.client = this.vault(options);

    if (this.config.token && this.client) {
      this.client.token = this.config.token;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.vault || !this.client) {
      return false;
    }

    try {
      await this.authenticate();
      await this.client.health();
      return true;
    } catch {
      return false;
    }
  }

  private async authenticate(): Promise<void> {
    if (!this.client) return;

    if (this.config.token) {
      return;
    }

    if (this.config.roleId && this.config.secretId) {
      const result = await this.client.approleLogin({
        role_id: this.config.roleId,
        secret_id: this.config.secretId,
      });
      this.client.token = result.auth.client_token;
    } else {
      throw new Error("No authentication method configured for Vault");
    }
  }

  async resolve(reference: string): Promise<string> {
    if (!this.client) {
      throw new Error("Vault provider not available");
    }

    await this.authenticate();

    const [path, field] = reference.split(":");
    const response = await this.client.read(path);

    if (!response) {
      throw new Error(`Secret not found in Vault: ${path}`);
    }

    const data = response.data?.data || response.data;

    if (!data) {
      throw new Error(`Secret not found in Vault: ${path}`);
    }

    if (field) {
      if (!(field in data)) {
        throw new Error(`Field ${field} not found in secret ${path}`);
      }
      return String((data as Record<string, unknown>)[field]);
    }

    if (typeof data === "string") {
      return data;
    }

    return JSON.stringify(data);
  }

  async store(reference: string, value: string): Promise<void> {
    if (!this.client) {
      throw new Error("Vault provider not available");
    }

    await this.authenticate();

    const [path, field] = reference.split(":");

    let data: Record<string, unknown>;
    if (field) {
      try {
        const existing = await this.client.read(path);
        data = (existing.data?.data || existing.data || {}) as Record<
          string,
          unknown
        >;
      } catch {
        data = {};
      }
      data[field] = value;
    } else {
      data = { value };
    }

    await this.client.write(path, { data });
  }

  async delete(reference: string): Promise<void> {
    if (!this.client) {
      throw new Error("Vault provider not available");
    }

    await this.authenticate();

    const [path] = reference.split(":");
    await this.client.delete(path);
  }

  async list(pattern?: string): Promise<string[]> {
    if (!this.client) {
      throw new Error("Vault provider not available");
    }

    await this.authenticate();

    const basePath = pattern || "secret/data";

    try {
      const response = await this.client.list(basePath);
      return response.data.keys || [];
    } catch {
      return [];
    }
  }
}
