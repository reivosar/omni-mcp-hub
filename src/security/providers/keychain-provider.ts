import { BaseSecretProvider } from "../secret-provider";

interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(
    service: string,
  ): Promise<Array<{ account: string; password: string }>>;
}

// Use a function that can be mocked by tests
function loadKeytar(): KeytarModule | null {
  try {
    return require("keytar") as KeytarModule;
  } catch {
    console.warn("Keytar not available - keychain provider disabled");
    return null;
  }
}

export class KeychainSecretProvider extends BaseSecretProvider {
  private service: string;
  private keytar: KeytarModule | null;

  constructor(service: string = "omni-mcp-hub", keytarInstance?: KeytarModule) {
    super("KEYCHAIN");
    this.service = service;
    this.keytar = keytarInstance || loadKeytar();
  }

  async isAvailable(): Promise<boolean> {
    return !!this.keytar;
  }

  async resolve(reference: string): Promise<string> {
    if (!this.keytar) {
      throw new Error("Keychain provider not available");
    }

    const [account, field] = reference.split("/", 2);
    const password = await this.keytar.getPassword(this.service, account);

    if (password === null || password === undefined) {
      throw new Error(`Secret not found in keychain: ${account}`);
    }

    if (field) {
      try {
        const parsed = JSON.parse(password) as Record<string, unknown>;
        if (field in parsed) {
          return String(parsed[field]);
        }
        throw new Error(`Field ${field} not found in secret`);
      } catch (error) {
        // Only catch JSON parsing errors, not our intentional field-not-found errors
        if (
          error instanceof Error &&
          error.message.includes("Field") &&
          error.message.includes("not found")
        ) {
          throw error; // Re-throw our intentional error
        }
        throw new Error(`Cannot extract field from non-JSON secret`);
      }
    }

    return password;
  }

  async store(reference: string, value: string): Promise<void> {
    if (!this.keytar) {
      throw new Error("Keychain provider not available");
    }

    const [account] = reference.split("/");
    await this.keytar.setPassword(this.service, account, value);
  }

  async delete(reference: string): Promise<void> {
    if (!this.keytar) {
      throw new Error("Keychain provider not available");
    }

    const [account] = reference.split("/");
    await this.keytar.deletePassword(this.service, account);
  }

  async list(pattern?: string): Promise<string[]> {
    if (!this.keytar) {
      throw new Error("Keychain provider not available");
    }

    const credentials = await this.keytar.findCredentials(this.service);
    const accounts = credentials.map((c) => c.account);

    if (!pattern) {
      return accounts;
    }

    const regex = new RegExp(pattern, "i");
    return accounts.filter((account) => regex.test(account));
  }
}
