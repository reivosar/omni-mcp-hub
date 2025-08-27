import * as path from "path";
import { ClaudeConfig, ClaudeConfigManager } from "./claude-config.js";
import { ILogger, SilentLogger } from "./logger.js";

export interface InheritanceConfig {
  enabled: boolean;
  baseProfiles: string[];
  overrideStrategy: "merge" | "replace";
  mergeArrays?: boolean;
  respectOrder?: boolean;
}

export interface InheritableConfig extends ClaudeConfig {
  inheritance?: InheritanceConfig;
  _inheritanceChain?: string[];
  _resolvedFrom?: string[];
}

export interface ProfileResolutionResult {
  config: InheritableConfig;
  chain: string[];
  errors: string[];
  warnings: string[];
}

export class ProfileInheritanceManager {
  private configManager: ClaudeConfigManager;
  private logger: ILogger;
  private resolutionCache: Map<string, ProfileResolutionResult> = new Map();
  private activeResolutions: Set<string> = new Set(); // Circular dependency detection

  constructor(configManager: ClaudeConfigManager, logger?: ILogger) {
    this.configManager = configManager;
    this.logger = logger || new SilentLogger();
  }

  /**
   * Resolve a profile with all its inheritance dependencies
   */
  async resolveProfile(profilePath: string): Promise<ProfileResolutionResult> {
    const normalizedPath = path.resolve(profilePath);

    if (this.resolutionCache.has(normalizedPath)) {
      return this.resolutionCache.get(normalizedPath)!;
    }

    if (this.activeResolutions.has(normalizedPath)) {
      return {
        config: {} as InheritableConfig,
        chain: [],
        errors: [`Circular dependency detected: ${normalizedPath}`],
        warnings: [],
      };
    }

    this.activeResolutions.add(normalizedPath);

    try {
      const result = await this.resolveProfileInternal(normalizedPath);
      this.resolutionCache.set(normalizedPath, result);
      return result;
    } finally {
      this.activeResolutions.delete(normalizedPath);
    }
  }

  /**
   * Internal resolution logic
   */
  private async resolveProfileInternal(
    profilePath: string,
  ): Promise<ProfileResolutionResult> {
    const result: ProfileResolutionResult = {
      config: {} as InheritableConfig,
      chain: [profilePath],
      errors: [],
      warnings: [],
    };

    try {
      const mainConfig = (await this.configManager.loadClaudeConfig(
        profilePath,
      )) as InheritableConfig;

      if (
        !mainConfig.inheritance ||
        !mainConfig.inheritance.enabled ||
        !mainConfig.inheritance.baseProfiles?.length
      ) {
        result.config = mainConfig;
        return result;
      }

      this.logger.debug(`Resolving inheritance for ${profilePath}`);

      const resolvedBases: InheritableConfig[] = [];

      for (const baseProfile of mainConfig.inheritance.baseProfiles) {
        try {
          const basePath = this.resolveProfilePath(baseProfile, profilePath);
          const baseResult = await this.resolveProfile(basePath);

          if (baseResult.errors.length > 0) {
            result.errors.push(
              ...baseResult.errors.map(
                (err) => `Base profile ${baseProfile}: ${err}`,
              ),
            );
            continue;
          }

          resolvedBases.push(baseResult.config);
          result.chain.unshift(
            ...baseResult.chain.filter((p) => !result.chain.includes(p)),
          );
          result.warnings.push(...baseResult.warnings);
        } catch (error) {
          let errorMsg = `Failed to resolve base profile ${baseProfile}`;
          if (error instanceof Error) {
            if (
              error.message.includes("ENOENT") ||
              error.message.includes("no such file")
            ) {
              errorMsg += `: File not found`;
            } else {
              errorMsg += `: ${error.message}`;
            }
          } else {
            errorMsg += `: ${error}`;
          }
          result.errors.push(errorMsg);
          this.logger.error(errorMsg);
        }
      }

      if (result.errors.length > 0) {
        result.config = mainConfig;
        return result;
      }

      result.config = this.mergeConfigs(resolvedBases, mainConfig);

      result.config._inheritanceChain = [...result.chain];
      result.config._resolvedFrom = [...mainConfig.inheritance.baseProfiles];
      result.config.inheritance = mainConfig.inheritance;

      this.logger.debug(
        `Successfully resolved ${profilePath} with ${resolvedBases.length} base profiles`,
      );

      return result;
    } catch (error) {
      result.errors.push(`Failed to load profile ${profilePath}: ${error}`);
      return result;
    }
  }

  /**
   * Merge multiple configurations according to inheritance rules
   */
  private mergeConfigs(
    baseConfigs: InheritableConfig[],
    mainConfig: InheritableConfig,
  ): InheritableConfig {
    const strategy = mainConfig.inheritance?.overrideStrategy || "merge";
    const mergeArrays = mainConfig.inheritance?.mergeArrays !== false;

    let result: InheritableConfig = {};

    for (const baseConfig of baseConfigs) {
      result = this.mergeSingleConfig(
        result,
        baseConfig,
        strategy,
        mergeArrays,
      );
    }

    result = this.mergeSingleConfig(result, mainConfig, strategy, mergeArrays);

    return result;
  }

  /**
   * Merge two configurations
   */
  private mergeSingleConfig(
    target: InheritableConfig,
    source: InheritableConfig,
    strategy: "merge" | "replace",
    mergeArrays: boolean,
  ): InheritableConfig {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (key.startsWith("_") || key === "inheritance") {
        continue;
      }

      if (strategy === "replace" && target[key]) {
        result[key] = value;
      } else {
        if (!result[key]) {
          result[key] = value;
        } else if (Array.isArray(value) && Array.isArray(result[key])) {
          if (mergeArrays) {
            const combined = [...(result[key] as unknown[]), ...value];
            result[key] = combined.filter(
              (item, index, arr) =>
                arr.findIndex(
                  (i) => JSON.stringify(i) === JSON.stringify(item),
                ) === index,
            );
          } else {
            result[key] = value;
          }
        } else if (
          typeof value === "object" &&
          value !== null &&
          typeof result[key] === "object" &&
          result[key] !== null
        ) {
          result[key] = this.mergeObjects(
            result[key] as Record<string, unknown>,
            value as Record<string, unknown>,
          );
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Deep merge two objects
   */
  private mergeObjects(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (!target[key]) {
        result[key] = value;
      } else if (Array.isArray(value) && Array.isArray(target[key])) {
        result[key] = [...(target[key] as unknown[]), ...value];
      } else if (
        typeof value === "object" &&
        value !== null &&
        typeof target[key] === "object" &&
        target[key] !== null
      ) {
        result[key] = this.mergeObjects(
          target[key] as Record<string, unknown>,
          value as Record<string, unknown>,
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Resolve profile path relative to current profile
   */
  private resolveProfilePath(
    profilePath: string,
    currentProfilePath: string,
  ): string {
    if (path.isAbsolute(profilePath)) {
      return profilePath;
    }

    const currentDir = path.dirname(currentProfilePath);
    let resolved = path.resolve(currentDir, profilePath);

    if (!resolved.endsWith(".md")) {
      resolved += ".md";
    }

    return resolved;
  }

  /**
   * Validate inheritance configuration
   */
  validateInheritanceConfig(config: InheritableConfig): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.inheritance) {
      return { valid: true, errors, warnings };
    }

    const inheritance = config.inheritance;

    if (typeof inheritance.enabled !== "boolean") {
      errors.push("inheritance.enabled must be a boolean");
    }

    if (inheritance.enabled) {
      if (!Array.isArray(inheritance.baseProfiles)) {
        errors.push(
          "inheritance.baseProfiles must be an array when inheritance is enabled",
        );
      } else if (inheritance.baseProfiles.length === 0) {
        warnings.push(
          "inheritance.baseProfiles is empty but inheritance is enabled",
        );
      } else {
        inheritance.baseProfiles.forEach((profile, index) => {
          if (typeof profile !== "string") {
            errors.push(`inheritance.baseProfiles[${index}] must be a string`);
          } else if (profile.trim() === "") {
            errors.push(`inheritance.baseProfiles[${index}] cannot be empty`);
          }
        });
      }

      if (
        inheritance.overrideStrategy &&
        !["merge", "replace"].includes(inheritance.overrideStrategy)
      ) {
        errors.push(
          'inheritance.overrideStrategy must be "merge" or "replace"',
        );
      }

      if (
        inheritance.mergeArrays !== undefined &&
        typeof inheritance.mergeArrays !== "boolean"
      ) {
        errors.push("inheritance.mergeArrays must be a boolean");
      }

      if (
        inheritance.respectOrder !== undefined &&
        typeof inheritance.respectOrder !== "boolean"
      ) {
        errors.push("inheritance.respectOrder must be a boolean");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get flattened inheritance chain for a profile
   */
  async getInheritanceChain(profilePath: string): Promise<string[]> {
    const result = await this.resolveProfile(profilePath);
    return result.chain;
  }

  /**
   * Check if a profile has circular dependencies
   */
  async checkCircularDependencies(
    profilePath: string,
  ): Promise<{ hasCircular: boolean; chain: string[] }> {
    const result = await this.resolveProfile(profilePath);
    const hasCircular = result.errors.some((error) =>
      error.includes("Circular dependency"),
    );

    return {
      hasCircular,
      chain: result.chain,
    };
  }

  /**
   * Clear resolution cache
   */
  clearCache(): void {
    this.resolutionCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; paths: string[] } {
    return {
      size: this.resolutionCache.size,
      paths: Array.from(this.resolutionCache.keys()),
    };
  }

  /**
   * Preview the resolved configuration without caching
   */
  async previewResolution(
    profilePath: string,
  ): Promise<ProfileResolutionResult> {
    const normalizedPath = path.resolve(profilePath);

    const cached = this.resolutionCache.get(normalizedPath);
    this.resolutionCache.delete(normalizedPath);

    try {
      const result = await this.resolveProfile(normalizedPath);
      return result;
    } finally {
      if (cached) {
        this.resolutionCache.set(normalizedPath, cached);
      }
    }
  }
}
