#!/usr/bin/env node

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
// import { ClaudeConfigManager } from '../utils/claude-config.js';

const program = new Command();

interface ProfileData {
  name: string;
  path: string;
  checksum?: string;
  createdAt?: string;
  updatedAt?: string;
  permissions?: string[];
}

class ProfileAdminCLI {
  private configPath: string;
  private profiles: Map<string, ProfileData>;

  constructor(configPath: string = ".mcp-config.json") {
    this.configPath = configPath;
    this.profiles = new Map();
    this.loadProfiles();
  }

  private loadProfiles(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        if (config.initialProfiles) {
          config.initialProfiles.forEach((profile: ProfileData) => {
            this.profiles.set(profile.name, profile);
          });
        }
      }
    } catch (error) {
      console.error("Error loading profiles:", error);
    }
  }

  private saveProfiles(): void {
    const config = {
      initialProfiles: Array.from(this.profiles.values()),
    };
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  private calculateChecksum(filePath: string): string {
    const content = fs.readFileSync(filePath, "utf-8");
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  public listProfiles(): void {
    console.log("\nRegistered Profiles:\n");
    if (this.profiles.size === 0) {
      console.log("No profiles found.");
      return;
    }

    this.profiles.forEach((profile, name) => {
      console.log(`  • ${name}`);
      console.log(`    Path: ${profile.path}`);
      if (profile.checksum) {
        console.log(`    Checksum: ${profile.checksum.substring(0, 16)}...`);
      }
      if (profile.permissions) {
        console.log(`    Permissions: ${profile.permissions.join(", ")}`);
      }
      console.log();
    });
  }

  public addProfile(
    name: string,
    profilePath: string,
    permissions?: string[],
  ): void {
    const resolvedPath = path.resolve(profilePath);

    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: File not found: ${resolvedPath}`);
      process.exit(1);
    }

    const checksum = this.calculateChecksum(resolvedPath);

    const profile: ProfileData = {
      name,
      path: resolvedPath,
      checksum,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      permissions: permissions || ["read", "execute"],
    };

    this.profiles.set(name, profile);
    this.saveProfiles();

    console.log(`Profile '${name}' added successfully`);
    console.log(`   Checksum: ${checksum.substring(0, 16)}...`);
  }

  public removeProfile(name: string): void {
    if (!this.profiles.has(name)) {
      console.error(`Error: Profile '${name}' not found`);
      process.exit(1);
    }

    this.profiles.delete(name);
    this.saveProfiles();

    console.log(`Profile '${name}' removed successfully`);
  }

  public verifyProfile(name: string): void {
    const profile = this.profiles.get(name);

    if (!profile) {
      console.error(`Error: Profile '${name}' not found`);
      process.exit(1);
    }

    if (!fs.existsSync(profile.path)) {
      console.error(`Error: Profile file not found: ${profile.path}`);
      process.exit(1);
    }

    const currentChecksum = this.calculateChecksum(profile.path);

    if (profile.checksum === currentChecksum) {
      console.log(`Profile '${name}' integrity verified`);
      console.log(`   Checksum: ${currentChecksum.substring(0, 16)}...`);
    } else {
      console.error(`Warning: Profile '${name}' has been modified`);
      console.error(`   Expected: ${profile.checksum?.substring(0, 16)}...`);
      console.error(`   Actual:   ${currentChecksum.substring(0, 16)}...`);
    }
  }

  public updateProfile(
    name: string,
    newPath?: string,
    permissions?: string[],
  ): void {
    const profile = this.profiles.get(name);

    if (!profile) {
      console.error(`Error: Profile '${name}' not found`);
      process.exit(1);
    }

    if (newPath) {
      const resolvedPath = path.resolve(newPath);
      if (!fs.existsSync(resolvedPath)) {
        console.error(`Error: File not found: ${resolvedPath}`);
        process.exit(1);
      }
      profile.path = resolvedPath;
      profile.checksum = this.calculateChecksum(resolvedPath);
    }

    if (permissions) {
      profile.permissions = permissions;
    }

    profile.updatedAt = new Date().toISOString();
    this.profiles.set(name, profile);
    this.saveProfiles();

    console.log(`Profile '${name}' updated successfully`);
  }

  public exportProfiles(outputPath: string): void {
    const exportData = {
      exported: new Date().toISOString(),
      profiles: Array.from(this.profiles.values()),
    };

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    console.log(`Exported ${this.profiles.size} profiles to ${outputPath}`);
  }

  public importProfiles(inputPath: string): void {
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: File not found: ${inputPath}`);
      process.exit(1);
    }

    const importData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

    if (!importData.profiles || !Array.isArray(importData.profiles)) {
      console.error("Error: Invalid import file format");
      process.exit(1);
    }

    let imported = 0;
    importData.profiles.forEach((profile: ProfileData) => {
      this.profiles.set(profile.name, profile);
      imported++;
    });

    this.saveProfiles();
    console.log(`Imported ${imported} profiles`);
  }
}

// CLI Commands
program
  .name("profile-admin")
  .description("CLI to manage Omni MCP Hub profiles")
  .version("1.0.0");

program
  .command("list")
  .description("List all profiles")
  .action(() => {
    const cli = new ProfileAdminCLI();
    cli.listProfiles();
  });

program
  .command("add <name> <path>")
  .description("Add a new profile")
  .option(
    "-p, --permissions <perms...>",
    "Set permissions (read, write, execute, admin)",
  )
  .action((name, path, options) => {
    const cli = new ProfileAdminCLI();
    cli.addProfile(name, path, options.permissions);
  });

program
  .command("remove <name>")
  .description("Remove a profile")
  .action((name) => {
    const cli = new ProfileAdminCLI();
    cli.removeProfile(name);
  });

program
  .command("verify <name>")
  .description("Verify profile integrity")
  .action((name) => {
    const cli = new ProfileAdminCLI();
    cli.verifyProfile(name);
  });

program
  .command("update <name>")
  .description("Update a profile")
  .option("-p, --path <path>", "New path for the profile")
  .option("--permissions <perms...>", "Update permissions")
  .action((name, options) => {
    const cli = new ProfileAdminCLI();
    cli.updateProfile(name, options.path, options.permissions);
  });

program
  .command("export <path>")
  .description("Export profiles to a file")
  .action((path) => {
    const cli = new ProfileAdminCLI();
    cli.exportProfiles(path);
  });

program
  .command("import <path>")
  .description("Import profiles from a file")
  .action((path) => {
    const cli = new ProfileAdminCLI();
    cli.importProfiles(path);
  });

export async function run(args: string[]): Promise<void> {
  // Override process.argv for testing
  const originalArgv = process.argv;
  const originalExit = process.exit;

  try {
    // Mock process.exit to prevent actual exit during tests
    process.exit = ((code?: number) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as typeof process.exit;

    process.argv = ["node", "profile-admin", ...args];
    program.parse(process.argv);
  } catch (error) {
    // Handle expected exit calls gracefully
    if (
      error instanceof Error &&
      error.message.includes("process.exit called with code")
    ) {
      return;
    }
    throw error;
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
  }
}

// Run CLI when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse(process.argv);
}
