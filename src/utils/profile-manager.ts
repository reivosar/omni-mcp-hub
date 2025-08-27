import { ClaudeConfigManager } from "./claude-config.js";
import {
  ProfileInheritanceManager,
  InheritableConfig,
  ProfileResolutionResult,
} from "./profile-inheritance.js";
import { ILogger, SilentLogger } from "./logger.js";
import * as path from "path";

export interface ProfileManagerOptions {
  autoResolveInheritance?: boolean;
  cacheResults?: boolean;
  validateOnLoad?: boolean;
}

export interface ProfileLoadResult {
  config: InheritableConfig;
  resolved: boolean;
  chain?: string[];
  errors: string[];
  warnings: string[];
}

/**
 * High-level profile manager that combines configuration loading with inheritance resolution
 */
export class ProfileManager {
  private configManager: ClaudeConfigManager;
  private inheritanceManager: ProfileInheritanceManager;
  private logger: ILogger;
  private options: ProfileManagerOptions;

  constructor(logger?: ILogger, options: ProfileManagerOptions = {}) {
    this.logger = logger || new SilentLogger();
    this.configManager = new ClaudeConfigManager(this.logger);
    this.inheritanceManager = new ProfileInheritanceManager(
      this.configManager,
      this.logger,
    );

    this.options = {
      autoResolveInheritance: true,
      cacheResults: true,
      validateOnLoad: true,
      ...options,
    };
  }

  /**
   * Load and optionally resolve profile with inheritance
   */
  async loadProfile(
    profilePath: string,
    resolveInheritance = this.options.autoResolveInheritance,
  ): Promise<ProfileLoadResult> {
    const result: ProfileLoadResult = {
      config: {} as InheritableConfig,
      resolved: false,
      errors: [],
      warnings: [],
    };

    try {
      const config = (await this.configManager.loadClaudeConfig(
        profilePath,
      )) as InheritableConfig;

      if (this.options.validateOnLoad && config.inheritance) {
        const validation =
          this.inheritanceManager.validateInheritanceConfig(config);
        result.errors.push(...validation.errors);
        result.warnings.push(...validation.warnings);

        if (!validation.valid) {
          result.config = config;
          return result;
        }
      }

      if (resolveInheritance && config.inheritance?.enabled) {
        const resolution =
          await this.inheritanceManager.resolveProfile(profilePath);

        result.config = resolution.config;
        result.resolved = true;
        result.chain = resolution.chain;
        result.errors.push(...resolution.errors);
        result.warnings.push(...resolution.warnings);
      } else {
        result.config = config;
        result.resolved = false;
      }

      return result;
    } catch (error) {
      result.errors.push(`Failed to load profile ${profilePath}: ${error}`);
      return result;
    }
  }

  /**
   * Load multiple profiles and resolve their inheritance
   */
  async loadProfiles(
    profilePaths: string[],
    resolveInheritance = true,
  ): Promise<Map<string, ProfileLoadResult>> {
    const results = new Map<string, ProfileLoadResult>();

    const promises = profilePaths.map(async (profilePath) => {
      const result = await this.loadProfile(profilePath, resolveInheritance);
      results.set(path.resolve(profilePath), result);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Create a new profile with inheritance configuration
   */
  async createProfile(
    profilePath: string,
    baseConfig: InheritableConfig,
    inheritanceConfig?: Partial<InheritableConfig["inheritance"]>,
  ): Promise<void> {
    const config: InheritableConfig = {
      ...baseConfig,
      inheritance: inheritanceConfig
        ? {
            enabled: false,
            baseProfiles: [],
            overrideStrategy: "merge",
            mergeArrays: true,
            respectOrder: true,
            ...inheritanceConfig,
          }
        : undefined,
    };

    await this.configManager.saveClaude(profilePath, config);
    this.logger.info(`Created profile: ${profilePath}`);
  }

  /**
   * Update inheritance configuration for an existing profile
   */
  async updateInheritance(
    profilePath: string,
    inheritanceConfig: InheritableConfig["inheritance"],
  ): Promise<void> {
    const config = (await this.configManager.loadClaudeConfig(
      profilePath,
    )) as InheritableConfig;
    config.inheritance = inheritanceConfig;

    const validation =
      this.inheritanceManager.validateInheritanceConfig(config);
    if (!validation.valid) {
      throw new Error(
        `Invalid inheritance configuration: ${validation.errors.join(", ")}`,
      );
    }

    await this.configManager.saveClaude(profilePath, config);

    this.inheritanceManager.clearCache();

    this.logger.info(`Updated inheritance for profile: ${profilePath}`);
  }

  /**
   * Get the complete inheritance chain for a profile
   */
  async getInheritanceChain(profilePath: string): Promise<string[]> {
    return this.inheritanceManager.getInheritanceChain(profilePath);
  }

  /**
   * Check for circular dependencies in inheritance chain
   */
  async checkCircularDependencies(
    profilePath: string,
  ): Promise<{ hasCircular: boolean; chain: string[] }> {
    return this.inheritanceManager.checkCircularDependencies(profilePath);
  }

  /**
   * Validate a profile and its inheritance chain
   */
  async validateProfile(
    profilePath: string,
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const config = (await this.configManager.loadClaudeConfig(
        profilePath,
      )) as InheritableConfig;

      if (config.inheritance) {
        const validation =
          this.inheritanceManager.validateInheritanceConfig(config);
        errors.push(...validation.errors);
        warnings.push(...validation.warnings);
      }

      const circularCheck = await this.checkCircularDependencies(profilePath);
      if (circularCheck.hasCircular) {
        errors.push(
          `Circular dependency detected in inheritance chain: ${circularCheck.chain.join(" -> ")}`,
        );
      }

      if (config.inheritance?.enabled) {
        const resolution =
          await this.inheritanceManager.resolveProfile(profilePath);
        errors.push(...resolution.errors);
        warnings.push(...resolution.warnings);
      }
    } catch (error) {
      errors.push(`Failed to validate profile: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * List all profiles in a directory with inheritance information
   */
  async listProfiles(directory: string): Promise<
    Array<{
      path: string;
      name: string;
      hasInheritance: boolean;
      baseProfiles?: string[];
      valid: boolean;
    }>
  > {
    const profiles: Array<{
      path: string;
      name: string;
      hasInheritance: boolean;
      baseProfiles?: string[];
      valid: boolean;
    }> = [];

    try {
      const claudeFiles = await this.configManager.findClaudeFiles(directory);

      for (const filePath of claudeFiles) {
        try {
          const config = (await this.configManager.loadClaudeConfig(
            filePath,
          )) as InheritableConfig;
          const validation = await this.validateProfile(filePath);

          profiles.push({
            path: filePath,
            name: path.basename(filePath, ".md"),
            hasInheritance: config.inheritance?.enabled || false,
            baseProfiles: config.inheritance?.baseProfiles,
            valid: validation.valid,
          });
        } catch (_error) {
          profiles.push({
            path: filePath,
            name: path.basename(filePath, ".md"),
            hasInheritance: false,
            valid: false,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to list profiles in ${directory}: ${error}`);
    }

    return profiles;
  }

  /**
   * Export a resolved profile (with inheritance applied) to a new file
   */
  async exportResolvedProfile(
    profilePath: string,
    outputPath: string,
  ): Promise<void> {
    const resolution =
      await this.inheritanceManager.resolveProfile(profilePath);

    if (resolution.errors.length > 0) {
      throw new Error(
        `Cannot export profile with errors: ${resolution.errors.join(", ")}`,
      );
    }

    const exportConfig = { ...resolution.config, _exported: true };
    delete exportConfig.inheritance;
    delete exportConfig._inheritanceChain;
    delete exportConfig._resolvedFrom;

    await this.configManager.saveClaude(outputPath, exportConfig);
    this.logger.info(`Exported resolved profile to: ${outputPath}`);
  }

  /**
   * Preview what a profile will look like when resolved
   */
  async previewResolution(
    profilePath: string,
  ): Promise<ProfileResolutionResult> {
    return this.inheritanceManager.previewResolution(profilePath);
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.configManager.clearCache();
    this.inheritanceManager.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    configCache: { paths: string[] };
    inheritanceCache: { size: number; paths: string[] };
  } {
    return {
      configCache: { paths: this.configManager.getCachedPaths() },
      inheritanceCache: this.inheritanceManager.getCacheStats(),
    };
  }

  /**
   * Get the current schema version
   */
  getCurrentSchemaVersion(): string {
    return this.configManager.getCurrentSchemaVersion();
  }

  /**
   * Check schema version compatibility for a profile
   */
  async checkSchemaCompatibility(profilePath: string): Promise<{
    version: string;
    compatible: boolean;
    requiresMigration: boolean;
  }> {
    return this.configManager.checkConfigVersion(profilePath);
  }
}
