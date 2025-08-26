import * as fs from "fs";
import * as path from "path";
import { ClaudeConfig } from "./claude-config.js";
import { ILogger, SilentLogger } from "./logger.js";

export interface SchemaVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface VersionedConfig extends ClaudeConfig {
  $schema?: string;
  $version?: string;
  _metadata?: {
    version: SchemaVersion;
    migratedFrom?: SchemaVersion;
    migrationDate?: string;
    migrationReason?: string;
  };
}

export interface MigrationRule {
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  description: string;
  migrate: (config: VersionedConfig) => VersionedConfig;
  validate?: (config: VersionedConfig) => boolean;
  rollback?: (config: VersionedConfig) => VersionedConfig;
}

export interface CompatibilityInfo {
  version: SchemaVersion;
  compatible: boolean;
  requiresMigration: boolean;
  migrationPath?: SchemaVersion[];
  deprecationWarnings?: string[];
  breakingChanges?: string[];
}

export class SchemaVersionManager {
  private static readonly CURRENT_VERSION: SchemaVersion = {
    major: 1,
    minor: 0,
    patch: 0,
  };
  private static readonly SCHEMA_URL_TEMPLATE =
    "https://schemas.omni-mcp-hub.dev/v{major}.{minor}.{patch}/claude-config.json";

  private migrationRules: MigrationRule[] = [];
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger || new SilentLogger();
    this.initializeMigrationRules();
  }

  /**
   * Get the current schema version
   */
  static getCurrentVersion(): SchemaVersion {
    return { ...SchemaVersionManager.CURRENT_VERSION };
  }

  /**
   * Parse version string into SchemaVersion object
   */
  static parseVersion(versionString: string): SchemaVersion {
    const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
      throw new Error(`Invalid version format: ${versionString}`);
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }

  /**
   * Convert SchemaVersion to string
   */
  static versionToString(version: SchemaVersion): string {
    return `${version.major}.${version.minor}.${version.patch}`;
  }

  /**
   * Compare two versions
   */
  static compareVersions(a: SchemaVersion, b: SchemaVersion): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
  }

  /**
   * Check if version A is compatible with version B
   */
  static isCompatible(a: SchemaVersion, b: SchemaVersion): boolean {
    // Major version must match, minor/patch differences are acceptable
    return a.major === b.major && a.minor >= b.minor;
  }

  /**
   * Generate schema URL for a given version
   */
  static getSchemaUrl(version: SchemaVersion): string {
    return SchemaVersionManager.SCHEMA_URL_TEMPLATE.replace(
      "{major}",
      version.major.toString(),
    )
      .replace("{minor}", version.minor.toString())
      .replace("{patch}", version.patch.toString());
  }

  /**
   * Add versioning metadata to a config
   */
  addVersionMetadata(config: ClaudeConfig): VersionedConfig {
    const currentVersion = SchemaVersionManager.getCurrentVersion();
    const versionedConfig: VersionedConfig = {
      ...config,
      $schema: SchemaVersionManager.getSchemaUrl(currentVersion),
      $version: SchemaVersionManager.versionToString(currentVersion),
      _metadata: {
        version: currentVersion,
        migrationDate: new Date().toISOString(),
      },
    };

    return versionedConfig;
  }

  /**
   * Extract version from config
   */
  extractVersion(config: VersionedConfig): SchemaVersion {
    // Try to get version from $version field
    if (config.$version) {
      try {
        return SchemaVersionManager.parseVersion(config.$version);
      } catch (_error) {
        this.logger.warn(`Invalid $version field: ${config.$version}`);
      }
    }

    // Try to get version from metadata
    if (config._metadata?.version) {
      return config._metadata.version;
    }

    // Default to v1.0.0 for legacy configs
    this.logger.warn("No version information found, assuming v1.0.0");
    return { major: 1, minor: 0, patch: 0 };
  }

  /**
   * Check compatibility and get migration info
   */
  checkCompatibility(config: VersionedConfig): CompatibilityInfo {
    const configVersion = this.extractVersion(config);
    const currentVersion = SchemaVersionManager.getCurrentVersion();

    const compatible = SchemaVersionManager.isCompatible(
      configVersion,
      currentVersion,
    );
    const requiresMigration =
      SchemaVersionManager.compareVersions(configVersion, currentVersion) < 0;

    const migrationPath = requiresMigration
      ? this.findMigrationPath(configVersion, currentVersion)
      : undefined;
    const deprecationWarnings = this.getDeprecationWarnings(configVersion);
    const breakingChanges = this.getBreakingChanges(
      configVersion,
      currentVersion,
    );

    return {
      version: configVersion,
      compatible,
      requiresMigration,
      migrationPath,
      deprecationWarnings,
      breakingChanges,
    };
  }

  /**
   * Migrate config to current version
   */
  async migrateConfig(config: VersionedConfig): Promise<VersionedConfig> {
    const compatInfo = this.checkCompatibility(config);

    if (!compatInfo.requiresMigration) {
      this.logger.debug("No migration required");
      return config;
    }

    if (!compatInfo.migrationPath || compatInfo.migrationPath.length === 0) {
      throw new Error(
        `No migration path found from ${SchemaVersionManager.versionToString(compatInfo.version)} to ${SchemaVersionManager.versionToString(SchemaVersionManager.getCurrentVersion())}`,
      );
    }

    this.logger.info(
      `Migrating config from ${SchemaVersionManager.versionToString(compatInfo.version)} to ${SchemaVersionManager.versionToString(SchemaVersionManager.getCurrentVersion())}`,
    );

    let migratedConfig = { ...config };
    const originalVersion = compatInfo.version;

    // Apply each migration step
    for (const targetVersion of compatInfo.migrationPath) {
      const rule = this.findMigrationRule(
        this.extractVersion(migratedConfig),
        targetVersion,
      );
      if (!rule) {
        throw new Error(
          `No migration rule found for ${SchemaVersionManager.versionToString(this.extractVersion(migratedConfig))} -> ${SchemaVersionManager.versionToString(targetVersion)}`,
        );
      }

      this.logger.debug(`Applying migration: ${rule.description}`);
      migratedConfig = rule.migrate(migratedConfig);

      // Validate if validation function exists
      if (rule.validate && !rule.validate(migratedConfig)) {
        throw new Error(`Migration validation failed: ${rule.description}`);
      }
    }

    // Update metadata
    migratedConfig._metadata = {
      ...migratedConfig._metadata,
      version: SchemaVersionManager.getCurrentVersion(),
      migratedFrom: originalVersion,
      migrationDate: new Date().toISOString(),
      migrationReason: "Automatic migration to current schema version",
    };

    migratedConfig.$version = SchemaVersionManager.versionToString(
      SchemaVersionManager.getCurrentVersion(),
    );
    migratedConfig.$schema = SchemaVersionManager.getSchemaUrl(
      SchemaVersionManager.getCurrentVersion(),
    );

    return migratedConfig;
  }

  /**
   * Create a backup of config before migration
   */
  async createBackup(
    config: VersionedConfig,
    originalPath: string,
  ): Promise<string> {
    const backupDir = path.join(path.dirname(originalPath), ".migrations");
    await fs.promises.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const version = SchemaVersionManager.versionToString(
      this.extractVersion(config),
    );
    const backupPath = path.join(
      backupDir,
      `${path.basename(originalPath, ".md")}-v${version}-${timestamp}.md`,
    );

    // Convert config back to CLAUDE.md format for backup
    const claudeContent = this.configToClaudeFormat(config);
    await fs.promises.writeFile(backupPath, claudeContent, "utf-8");

    this.logger.info(`Created backup: ${backupPath}`);
    return backupPath;
  }

  /**
   * Register a migration rule
   */
  registerMigrationRule(rule: MigrationRule): void {
    this.migrationRules.push(rule);
    this.logger.debug(
      `Registered migration rule: ${SchemaVersionManager.versionToString(rule.fromVersion)} -> ${SchemaVersionManager.versionToString(rule.toVersion)}`,
    );
  }

  /**
   * Get all available versions
   */
  getAvailableVersions(): SchemaVersion[] {
    const versions = new Set<string>();
    versions.add(
      SchemaVersionManager.versionToString(
        SchemaVersionManager.getCurrentVersion(),
      ),
    );

    this.migrationRules.forEach((rule) => {
      versions.add(SchemaVersionManager.versionToString(rule.fromVersion));
      versions.add(SchemaVersionManager.versionToString(rule.toVersion));
    });

    return Array.from(versions)
      .map((v) => SchemaVersionManager.parseVersion(v))
      .sort(SchemaVersionManager.compareVersions);
  }

  /**
   * Initialize built-in migration rules
   */
  private initializeMigrationRules(): void {
    // Example migration from v1.0.0 to v1.1.0
    this.registerMigrationRule({
      fromVersion: { major: 1, minor: 0, patch: 0 },
      toVersion: { major: 1, minor: 1, patch: 0 },
      description: "Add support for profile inheritance",
      migrate: (config: VersionedConfig) => {
        // Add new inheritance field if it doesn't exist
        if (!config.inheritance) {
          config.inheritance = {
            enabled: false,
            baseProfiles: [],
          };
        }
        return config;
      },
      validate: (config: VersionedConfig) => {
        return config.inheritance !== undefined;
      },
    });

    // Add more migration rules as needed...
  }

  /**
   * Find migration path between two versions
   */
  private findMigrationPath(
    fromVersion: SchemaVersion,
    toVersion: SchemaVersion,
  ): SchemaVersion[] | undefined {
    const path: SchemaVersion[] = [];
    let currentVersion = fromVersion;

    while (
      SchemaVersionManager.compareVersions(currentVersion, toVersion) < 0
    ) {
      const nextRule = this.migrationRules.find(
        (rule) =>
          SchemaVersionManager.compareVersions(
            rule.fromVersion,
            currentVersion,
          ) === 0 &&
          SchemaVersionManager.compareVersions(rule.toVersion, toVersion) <= 0,
      );

      if (!nextRule) {
        return undefined; // No path found
      }

      path.push(nextRule.toVersion);
      currentVersion = nextRule.toVersion;
    }

    return path;
  }

  /**
   * Find specific migration rule
   */
  private findMigrationRule(
    fromVersion: SchemaVersion,
    toVersion: SchemaVersion,
  ): MigrationRule | undefined {
    return this.migrationRules.find(
      (rule) =>
        SchemaVersionManager.compareVersions(rule.fromVersion, fromVersion) ===
          0 &&
        SchemaVersionManager.compareVersions(rule.toVersion, toVersion) === 0,
    );
  }

  /**
   * Get deprecation warnings for a version
   */
  private getDeprecationWarnings(version: SchemaVersion): string[] {
    const warnings: string[] = [];

    // Add version-specific warnings
    if (version.major === 1 && version.minor === 0) {
      warnings.push(
        'The "rules" section is deprecated, use "guidelines" instead',
      );
      warnings.push(
        "String arrays for instructions are deprecated, use objects with title and content",
      );
    }

    return warnings;
  }

  /**
   * Get breaking changes between versions
   */
  private getBreakingChanges(
    fromVersion: SchemaVersion,
    toVersion: SchemaVersion,
  ): string[] {
    const changes: string[] = [];

    if (fromVersion.major < toVersion.major) {
      changes.push("Major version upgrade may contain breaking changes");
    }

    return changes;
  }

  /**
   * Convert config back to CLAUDE.md format
   */
  private configToClaudeFormat(config: VersionedConfig): string {
    const sections: string[] = [];

    // Add version header
    if (config.$version) {
      sections.push(`# Schema Version: ${config.$version}\n`);
    }

    // Add standard sections
    if (config.title) {
      sections.push(`# ${config.title}\n`);
    }

    if (config.description) {
      sections.push(`## Description\n${config.description}\n`);
    }

    if (config.instructions && Array.isArray(config.instructions)) {
      sections.push(`## Instructions\n${config.instructions.join("\n")}\n`);
    }

    if (config.guidelines && Array.isArray(config.guidelines)) {
      sections.push(`## Guidelines\n${config.guidelines.join("\n")}\n`);
    }

    if (config.context && Array.isArray(config.context)) {
      sections.push(`## Context\n${config.context.join("\n")}\n`);
    }

    if (config.tools && Array.isArray(config.tools)) {
      sections.push(`## Tools\n${config.tools.join("\n")}\n`);
    }

    if (config.memory && Array.isArray(config.memory)) {
      sections.push(`## Memory\n${config.memory.join("\n")}\n`);
    }

    return sections.join("\n");
  }
}
