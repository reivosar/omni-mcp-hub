#!/usr/bin/env node

import { Command } from "commander";
import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import chalk from "chalk";
import Table from "cli-table3";
import { ClaudeConfigManager } from "../utils/claude-config.js";
import { YamlConfigManager } from "../config/yaml-config.js";
import { PathResolver } from "../utils/path-resolver.js";
import { ProfileManager } from "../utils/profile-manager.js";
import { createFileLogger } from "../utils/logger.js";

interface ProfileData {
  name: string;
  path: string;
  checksum?: string;
  createdAt?: string;
  updatedAt?: string;
  permissions?: string[];
  description?: string;
  tags?: string[];
  active?: boolean;
}

interface YamlProfile {
  name: string;
  path: string;
  enabled?: boolean;
}

export class AdminUI {
  private configPath: string;
  private profiles: Map<string, ProfileData>;
  private claudeConfigManager: ClaudeConfigManager;
  private yamlConfigManager: YamlConfigManager;
  private pathResolver: PathResolver;
  private profileManager: ProfileManager;

  constructor(configPath: string = ".mcp-config.json") {
    this.configPath = configPath;
    this.profiles = new Map();

    const logger = createFileLogger({ level: "info" });
    this.claudeConfigManager = new ClaudeConfigManager(logger);
    this.pathResolver = PathResolver.getInstance();
    this.profileManager = new ProfileManager(logger);

    const yamlConfigPath = this.pathResolver.getYamlConfigPath();
    this.yamlConfigManager = YamlConfigManager.createWithPath(yamlConfigPath);

    this.loadProfiles();
  }

  private loadProfiles(): void {
    try {
      // Load from .mcp-config.json
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        // Handle both formats for backward compatibility
        if (config.initialProfiles) {
          config.initialProfiles.forEach((profile: ProfileData) => {
            this.profiles.set(profile.name, profile);
          });
        }

        // Handle profiles object format (used by tests)
        if (config.profiles && typeof config.profiles === "object") {
          Object.values(config.profiles).forEach((profile: unknown) => {
            const profileData = profile as ProfileData;
            this.profiles.set(profileData.name, profileData);
          });
        }
      }

      // Load from YAML config
      try {
        const yamlConfig = this.yamlConfigManager.getConfig();
        if (yamlConfig.autoLoad?.profiles) {
          yamlConfig.autoLoad.profiles.forEach((profile: YamlProfile) => {
            if (!this.profiles.has(profile.name)) {
              this.profiles.set(profile.name, {
                name: profile.name,
                path: profile.path,
                active: profile.enabled !== false,
                tags: ["yaml-managed"],
              });
            }
          });
        }
      } catch (error) {
        console.warn(chalk.yellow("Could not load YAML config:"), error);
      }
    } catch (error) {
      console.error(chalk.red("Error loading profiles:"), error);
    }
  }

  private saveProfiles(): void {
    try {
      const profilesArray = Array.from(this.profiles.values()).filter(
        (p) => !p.tags?.includes("yaml-managed"),
      );

      const config = {
        // Save as profiles object for test compatibility
        profiles: Object.fromEntries(profilesArray.map((p) => [p.name, p])),
        // Also keep initialProfiles for backward compatibility
        initialProfiles: profilesArray,
      };
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error("Failed to save profiles:", error);
      // Don't throw, just log the error for graceful handling
    }
  }

  private calculateChecksum(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return crypto.createHash("sha256").update(content).digest("hex");
    } catch (_error) {
      // Return empty string for non-existent files as expected by tests
      return "";
    }
  }

  async showMainMenu(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("╔══════════════════════════════════════╗"));
    console.log(chalk.cyan.bold("║        Omni MCP Hub Admin UI         ║"));
    console.log(chalk.cyan.bold("╚══════════════════════════════════════╝"));
    console.log();

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "List all profiles", value: "list" },
          { name: "Add new profile", value: "add" },
          { name: "Edit profile", value: "edit" },
          { name: "Remove profile", value: "remove" },
          { name: "Validate profile", value: "validate" },
          { name: "Import profiles", value: "import" },
          { name: "Export profiles", value: "export" },
          new inquirer.Separator("--- Inheritance Management ---"),
          { name: "Show inheritance chain", value: "inheritance_chain" },
          { name: "Check circular dependencies", value: "check_circular" },
          { name: "Export resolved profile", value: "export_resolved" },
          { name: "Preview profile resolution", value: "preview_resolution" },
          new inquirer.Separator("--- System ---"),
          { name: "System status", value: "status" },
          { name: "Exit", value: "exit" },
        ],
      },
    ]);

    // Command pattern to reduce cyclomatic complexity
    const menuHandlers: Record<string, () => Promise<void | string>> = {
      list: () => this.listProfiles(),
      add: () => this.addProfile(),
      edit: () => this.editProfile(),
      remove: () => this.removeProfile(),
      validate: () => this.validateProfile(),
      import: () => this.importProfiles(),
      export: () => this.exportProfiles(),
      inheritance_chain: () => this.showInheritanceChain(),
      check_circular: () => this.checkCircularDependencies(),
      export_resolved: () => this.exportResolvedProfile(),
      preview_resolution: () => this.previewResolution(),
      status: () => this.showSystemStatus(),
      exit: async () => {
        console.log(chalk.green("Thank you for using Omni MCP Hub Admin UI!"));
        // For testing, don't call process.exit - just return
        if (process.env.NODE_ENV !== "test") {
          process.exit(0);
        }
        return "exit"; // Signal to break the loop
      },
    };

    const handler = menuHandlers[action];
    if (handler) {
      const result = await handler();
      if (result === "exit") {
        return; // Exit the loop
      }
    }

    await this.pressAnyKey();
    await this.showMainMenu();
  }

  private async listProfiles(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Profile Management - List Profiles"));
    console.log();

    if (this.profiles.size === 0) {
      console.log(chalk.yellow("No profiles found."));
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan("Name"),
        chalk.cyan("Path"),
        chalk.cyan("Status"),
        chalk.cyan("Tags"),
        chalk.cyan("Last Modified"),
      ],
      colWidths: [20, 40, 10, 15, 20],
    });

    this.profiles.forEach((profile) => {
      const status = profile.active
        ? chalk.green("Active")
        : chalk.gray("Inactive");
      const tags = profile.tags?.join(", ") || "";
      const modified = profile.updatedAt
        ? new Date(profile.updatedAt).toLocaleDateString()
        : "Unknown";

      table.push([
        profile.name,
        profile.path.length > 35
          ? "..." + profile.path.slice(-32)
          : profile.path,
        status,
        tags,
        modified,
      ]);
    });

    console.log(table.toString());
  }

  private async addProfile(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Profile Management - Add Profile"));
    console.log();

    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Profile name:",
        validate: (input) => {
          if (!input.trim()) return "Profile name is required";
          if (this.profiles.has(input)) return "Profile already exists";
          return true;
        },
      },
      {
        type: "input",
        name: "path",
        message: "Profile file path:",
        validate: (input) => {
          if (!input.trim()) return "File path is required";
          const resolved = this.pathResolver.resolveProfilePath(input);
          if (!fs.existsSync(resolved)) return "File does not exist";
          return true;
        },
      },
      {
        type: "input",
        name: "description",
        message: "Description (optional):",
      },
      {
        type: "checkbox",
        name: "tags",
        message: "Tags (optional):",
        choices: [
          "development",
          "production",
          "testing",
          "experimental",
          "custom",
        ],
      },
      {
        type: "confirm",
        name: "active",
        message: "Activate this profile?",
        default: true,
      },
    ]);

    const resolvedPath = this.pathResolver.resolveProfilePath(answers.path);
    const checksum = this.calculateChecksum(resolvedPath);

    const profile: ProfileData = {
      name: answers.name,
      path: resolvedPath,
      checksum,
      description: answers.description || undefined,
      tags: answers.tags.length > 0 ? answers.tags : undefined,
      active: answers.active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(answers.name, profile);
    this.saveProfiles();

    console.log(chalk.green(`Profile '${answers.name}' added successfully!`));
  }

  private async editProfile(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Profile Management - Edit Profile"));
    console.log();

    if (this.profiles.size === 0) {
      console.log(chalk.yellow("No profiles to edit."));
      return;
    }

    const { profileName } = await inquirer.prompt([
      {
        type: "list",
        name: "profileName",
        message: "Select profile to edit:",
        choices: Array.from(this.profiles.keys()),
      },
    ]);

    const profile = this.profiles.get(profileName)!;

    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "description",
        message: "Description:",
        default: profile.description || "",
      },
      {
        type: "checkbox",
        name: "tags",
        message: "Tags:",
        choices: [
          "development",
          "production",
          "testing",
          "experimental",
          "custom",
        ],
        default: profile.tags || [],
      },
      {
        type: "confirm",
        name: "active",
        message: "Active?",
        default: profile.active !== false,
      },
    ]);

    profile.description = answers.description || undefined;
    profile.tags = answers.tags.length > 0 ? answers.tags : undefined;
    profile.active = answers.active;
    profile.updatedAt = new Date().toISOString();

    this.profiles.set(profileName, profile);
    this.saveProfiles();

    console.log(chalk.green(`Profile '${profileName}' updated successfully!`));
  }

  private async removeProfile(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Profile Management - Remove Profile"));
    console.log();

    if (this.profiles.size === 0) {
      console.log(chalk.yellow("No profiles to remove."));
      return;
    }

    const { profileName } = await inquirer.prompt([
      {
        type: "list",
        name: "profileName",
        message: "Select profile to remove:",
        choices: Array.from(this.profiles.keys()),
      },
    ]);

    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Are you sure you want to remove '${profileName}'?`,
        default: false,
      },
    ]);

    if (confirm) {
      this.profiles.delete(profileName);
      this.saveProfiles();
      console.log(
        chalk.green(`Profile '${profileName}' removed successfully!`),
      );
    } else {
      console.log(chalk.yellow("Remove operation cancelled."));
    }
  }

  private async validateProfile(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Profile Management - Validate Profile"));
    console.log();

    if (this.profiles.size === 0) {
      console.log(chalk.yellow("No profiles to validate."));
      return;
    }

    const { profileName } = await inquirer.prompt([
      {
        type: "list",
        name: "profileName",
        message: "Select profile to validate:",
        choices: Array.from(this.profiles.keys()),
      },
    ]);

    const profile = this.profiles.get(profileName)!;

    console.log(chalk.blue("Validating profile..."));

    try {
      // Check if file exists
      if (!fs.existsSync(profile.path)) {
        console.log(chalk.red("File not found"));
        return;
      }
      console.log(chalk.green("File exists"));

      // Check checksum
      const currentChecksum = this.calculateChecksum(profile.path);
      if (profile.checksum && profile.checksum !== currentChecksum) {
        console.log(chalk.yellow("File has been modified"));
        profile.checksum = currentChecksum;
        profile.updatedAt = new Date().toISOString();
        this.saveProfiles();
      } else {
        console.log(chalk.green("File integrity verified"));
      }

      // Validate CLAUDE.md format
      try {
        const config = await this.claudeConfigManager.loadClaudeConfig(
          profile.path,
        );

        if (!config) {
          console.log(chalk.red("Could not load configuration from path"));
          return;
        }

        console.log(chalk.green("Valid CLAUDE.md format"));

        const sections = Object.keys(config).filter((k) => !k.startsWith("_"));
        if (sections.length > 0) {
          console.log(chalk.blue("Sections found:"), sections.join(", "));
        }
      } catch (error) {
        console.log(chalk.red("Invalid CLAUDE.md format:"), error);
      }
    } catch (error) {
      console.log(chalk.red("Validation failed:"), error);
    }
  }

  private async importProfiles(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Profile Management - Import Profiles"));
    console.log();

    const { filePath } = await inquirer.prompt([
      {
        type: "input",
        name: "filePath",
        message: "Import file path:",
        validate: (input) => {
          if (!input.trim()) return "File path is required";
          if (!fs.existsSync(input)) return "File does not exist";
          return true;
        },
      },
    ]);

    try {
      const importData = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      if (!importData.profiles || !Array.isArray(importData.profiles)) {
        console.log(chalk.red("Invalid import file format"));
        return;
      }

      let imported = 0;
      importData.profiles.forEach((profile: ProfileData) => {
        if (!this.profiles.has(profile.name)) {
          this.profiles.set(profile.name, profile);
          imported++;
        }
      });

      if (imported > 0) {
        this.saveProfiles();
        console.log(chalk.green(`Imported ${imported} profiles successfully!`));
      } else {
        console.log(chalk.yellow("No new profiles to import."));
      }
    } catch (error) {
      console.log(chalk.red("Import failed:"), error);
    }
  }

  private async exportProfiles(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Profile Management - Export Profiles"));
    console.log();

    const { filePath } = await inquirer.prompt([
      {
        type: "input",
        name: "filePath",
        message: "Export file path:",
        default: `profiles-export-${new Date().toISOString().split("T")[0]}.json`,
      },
    ]);

    const exportData = {
      exported: new Date().toISOString(),
      version: "1.0.0",
      profiles: Array.from(this.profiles.values()),
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
      console.log(
        chalk.green(`Exported ${this.profiles.size} profiles to ${filePath}`),
      );
    } catch (error) {
      console.log(chalk.red("Export failed:"), error);
    }
  }

  public async showSystemStatus(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("System Status"));
    console.log();

    const stats = {
      totalProfiles: this.profiles.size,
      activeProfiles: Array.from(this.profiles.values()).filter((p) => p.active)
        .length,
      yamlManagedProfiles: Array.from(this.profiles.values()).filter((p) =>
        p.tags?.includes("yaml-managed"),
      ).length,
      configPath: this.configPath,
      yamlConfigPath: this.pathResolver.getYamlConfigPath() || "Not available",
    };

    const table = new Table();

    table.push(["Total Profiles", stats.totalProfiles]);
    table.push(["Active Profiles", stats.activeProfiles]);
    table.push(["YAML Managed", stats.yamlManagedProfiles]);
    table.push(["Config Path", stats.configPath]);
    table.push(["YAML Config Path", stats.yamlConfigPath]);

    console.log(table.toString());
  }

  private async showInheritanceChain(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Profile Inheritance Chain"));
    console.log();

    const profilePaths = Array.from(this.profiles.values()).map((p) => ({
      name: p.name,
      value: p.path,
    }));

    if (profilePaths.length === 0) {
      console.log(chalk.yellow("No profiles available"));
      return;
    }

    const { profilePath } = await inquirer.prompt([
      {
        type: "list",
        name: "profilePath",
        message: "Select profile to show inheritance chain:",
        choices: profilePaths,
      },
    ]);

    try {
      const chain = await this.profileManager.getInheritanceChain(profilePath);

      console.log(chalk.blue("Inheritance Chain:"));
      if (chain.length <= 1) {
        console.log(chalk.gray("  No inheritance (standalone profile)"));
      } else {
        chain.forEach((profilePath, index) => {
          const isLast = index === chain.length - 1;
          const prefix = isLast ? "└─" : "├─";
          const name = path.basename(profilePath, ".md");
          console.log(`  ${prefix} ${name} ${chalk.gray(`(${profilePath})`)}`);
        });
      }
    } catch (error) {
      console.log(chalk.red("Failed to get inheritance chain:"), error);
    }
  }

  private async checkCircularDependencies(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Check Circular Dependencies"));
    console.log();

    const profilePaths = Array.from(this.profiles.values()).map((p) => ({
      name: p.name,
      value: p.path,
    }));

    if (profilePaths.length === 0) {
      console.log(chalk.yellow("No profiles available"));
      return;
    }

    const { profilePath } = await inquirer.prompt([
      {
        type: "list",
        name: "profilePath",
        message: "Select profile to check for circular dependencies:",
        choices: profilePaths,
      },
    ]);

    try {
      const check =
        await this.profileManager.checkCircularDependencies(profilePath);

      if (check.hasCircular) {
        console.log(chalk.red("Circular dependency detected!"));
        console.log(
          chalk.yellow("Chain:"),
          check.chain.map((p) => path.basename(p, ".md")).join(" → "),
        );
      } else {
        console.log(chalk.green("No circular dependencies found"));
        if (check.chain.length > 1) {
          console.log(
            chalk.blue("Inheritance chain:"),
            check.chain.map((p) => path.basename(p, ".md")).join(" → "),
          );
        }
      }
    } catch (error) {
      console.log(chalk.red("Failed to check circular dependencies:"), error);
    }
  }

  private async exportResolvedProfile(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Export Resolved Profile"));
    console.log();

    const profilePaths = Array.from(this.profiles.values()).map((p) => ({
      name: p.name,
      value: p.path,
    }));

    if (profilePaths.length === 0) {
      console.log(chalk.yellow("No profiles available"));
      return;
    }

    const profileAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "profilePath",
        message: "Select profile to export (with inheritance resolved):",
        choices: profilePaths,
      },
    ]);

    const outputAnswer = await inquirer.prompt([
      {
        type: "input",
        name: "outputPath",
        message: "Output file path:",
        default: () => {
          const name = path.basename(profileAnswer.profilePath, ".md");
          return `${name}-resolved.md`;
        },
        validate: (input: string) =>
          input.trim() ? true : "Output path is required",
      },
    ]);

    const profilePath = profileAnswer.profilePath;
    const outputPath = outputAnswer.outputPath;

    try {
      await this.profileManager.exportResolvedProfile(profilePath, outputPath);
      console.log(chalk.green(`Exported resolved profile to ${outputPath}`));
    } catch (error) {
      console.log(chalk.red("Export failed:"), error);
    }
  }

  private async previewResolution(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold("Preview Profile Resolution"));
    console.log();

    const profilePaths = Array.from(this.profiles.values()).map((p) => ({
      name: p.name,
      value: p.path,
    }));

    if (profilePaths.length === 0) {
      console.log(chalk.yellow("No profiles available"));
      return;
    }

    const { profilePath } = await inquirer.prompt([
      {
        type: "list",
        name: "profilePath",
        message: "Select profile to preview resolution:",
        choices: profilePaths,
      },
    ]);

    try {
      const preview = await this.profileManager.previewResolution(profilePath);

      if (preview.errors.length > 0) {
        console.log(chalk.red("Errors:"));
        preview.errors.forEach((error) => console.log(chalk.red(`  ${error}`)));
        console.log();
      }

      if (preview.warnings.length > 0) {
        console.log(chalk.yellow("Warnings:"));
        preview.warnings.forEach((warning) =>
          console.log(chalk.yellow(`  ${warning}`)),
        );
        console.log();
      }

      console.log(chalk.blue("Inheritance Chain:"));
      if (preview.chain.length <= 1) {
        console.log(chalk.gray("  No inheritance (standalone profile)"));
      } else {
        preview.chain.forEach((profilePath, index) => {
          const isLast = index === preview.chain.length - 1;
          const prefix = isLast ? "└─" : "├─";
          const name = path.basename(profilePath, ".md");
          console.log(`  ${prefix} ${name} ${chalk.gray(`(${profilePath})`)}`);
        });
      }

      console.log();
      console.log(chalk.blue("Resolved Configuration Preview:"));

      const table = new Table({
        head: ["Section", "Content Preview"],
        colWidths: [20, 80],
      });

      const config = preview.config;
      const sections = [
        "instructions",
        "context",
        "rules",
        "knowledge",
        "tools",
        "memory",
      ];

      sections.forEach((section) => {
        if (config[section]) {
          let content = "";
          if (Array.isArray(config[section])) {
            const items = config[section] as string[];
            content =
              items.length > 3
                ? `${items.slice(0, 3).join(", ")}... (${items.length} items)`
                : items.join(", ");
          } else {
            content = String(config[section]).substring(0, 100);
            if (String(config[section]).length > 100) content += "...";
          }
          table.push([section, content]);
        }
      });

      console.log(table.toString());
    } catch (error) {
      console.log(chalk.red("Preview failed:"), error);
    }
  }

  private async pressAnyKey(): Promise<void> {
    console.log();
    await inquirer.prompt([
      {
        type: "input",
        name: "continue",
        message: "Press Enter to continue...",
      },
    ]);
  }
}

// CLI setup
const program = new Command();

program
  .name("admin-ui")
  .description("Interactive admin UI for Omni MCP Hub")
  .version("1.0.0");

program
  .command("interactive")
  .alias("ui")
  .description("Launch interactive admin UI")
  .option("-c, --config <path>", "Config file path", ".mcp-config.json")
  .action(async (options) => {
    const admin = new AdminUI(options.config);
    await admin.showMainMenu();
  });

program
  .command("status")
  .description("Show system status")
  .option("-c, --config <path>", "Config file path", ".mcp-config.json")
  .action(async (options) => {
    const admin = new AdminUI(options.config);
    await admin.showSystemStatus();
  });

export async function run(args: string[]): Promise<void> {
  // Parse arguments without exiting process
  program.exitOverride();
  await program.parseAsync(args, { from: "user" });
}

// Default to interactive mode when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length === 2) {
    process.argv.push("interactive");
  }
  program.parse(process.argv);
}
