/**
 * Safe profile application with idempotency, rollback, and audit logging
 */

import { Mutex } from "async-mutex";
import { behaviorState, ProfileTarget } from "./state.js";
import { computeProfileHash } from "./hash.js";
import { audit } from "../monitoring/audit.js";
import { BehaviorGenerator } from "../utils/behavior-generator.js";
import { ClaudeConfigManager } from "../utils/claude-config.js";
import { ILogger, SilentLogger } from "../utils/logger.js";

export interface ApplyResult {
  status: "applied" | "noop" | "rolled_back" | "error";
  profile: string;
  hash: string;
  tookMs: number;
  error?: string;
}

export interface ApplyOptions {
  force?: boolean;
  dryRun?: boolean;
  logger?: ILogger;
}

class ProfileApplicator {
  private mutex = new Mutex();
  private configManager: ClaudeConfigManager;
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger || new SilentLogger();
    this.configManager = new ClaudeConfigManager(this.logger);
  }

  /**
   * Safely apply Claude configuration profile
   */
  async applyClaudeConfig(
    profile: string,
    actor: string,
    options: ApplyOptions = {},
  ): Promise<ApplyResult> {
    return await this.mutex.runExclusive(async () => {
      const start = Date.now();

      try {
        const target = await this.resolveProfile(profile);

        const hash = await computeProfileHash(target);

        if (!options.force && hash === behaviorState.getCurrentHash()) {
          const result: ApplyResult = {
            status: "noop",
            profile,
            hash,
            tookMs: Date.now() - start,
          };

          audit.logNoop({
            actor,
            profile,
            sourcePath: target.source,
            hash,
            durationMs: result.tookMs,
          });

          return result;
        }

        if (behaviorState.isCurrentlyApplying()) {
          throw new Error("Profile application already in progress");
        }

        const snapshot = behaviorState.createSnapshot();

        try {
          behaviorState.setApplying(true);

          const behavior = await this.generateBehavior(target, options);

          if (options.dryRun) {
            behaviorState.setApplying(false);
            return {
              status: "noop",
              profile,
              hash,
              tookMs: Date.now() - start,
            };
          }

          behaviorState.atomicSwapBehavior(behavior, { profile, hash });

          const result: ApplyResult = {
            status: "applied",
            profile,
            hash,
            tookMs: Date.now() - start,
          };

          audit.logApplied({
            actor,
            profile,
            sourcePath: target.source,
            hash,
            durationMs: result.tookMs,
            metadata: {
              behaviorLength: behavior.length,
              includes: target.includes?.length || 0,
            },
          });

          return result;
        } catch (error) {
          behaviorState.restoreSnapshot(snapshot);

          const errorMessage = `Failed to generate behavior: ${error}`;
          const result: ApplyResult = {
            status: "rolled_back",
            profile,
            hash,
            tookMs: Date.now() - start,
            error: errorMessage,
          };

          audit.logRolledBack({
            actor,
            profile,
            hash,
            durationMs: result.tookMs,
            error: errorMessage,
            sourcePath: target.source,
          });

          return result;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const result: ApplyResult = {
          status: "error",
          profile,
          hash: "unknown",
          tookMs: Date.now() - start,
          error: errorMessage,
        };

        audit.logError({
          actor,
          profile,
          hash: "unknown",
          durationMs: result.tookMs,
          error: errorMessage,
        });

        return result;
      }
    });
  }

  /**
   * Get current application status
   */
  getStatus(): {
    currentProfile: string | null;
    currentHash: string | null;
    lastAppliedAt: Date | null;
    isApplying: boolean;
  } {
    const state = behaviorState.getState();
    return {
      currentProfile: state.currentProfileId,
      currentHash: state.currentHash,
      lastAppliedAt: state.lastAppliedAt,
      isApplying: state.isApplying,
    };
  }

  /**
   * Check if profile needs to be applied (hash changed)
   */
  async needsApply(profile: string): Promise<boolean> {
    try {
      const target = await this.resolveProfile(profile);
      const hash = await computeProfileHash(target);
      return hash !== behaviorState.getCurrentHash();
    } catch {
      return true; // Apply if we can't determine hash
    }
  }

  /**
   * Resolve profile name to target configuration
   */
  private async resolveProfile(profile: string): Promise<ProfileTarget> {
    return {
      source: profile,
      includes: [],
      options: {},
    };
  }

  /**
   * Generate behavior from profile target
   */
  private async generateBehavior(
    target: ProfileTarget,
    options: ApplyOptions,
  ): Promise<string> {
    const config = await this.configManager.loadClaudeConfig(target.source);

    if (!config) {
      throw new Error(
        `Failed to load Claude configuration from ${target.source}`,
      );
    }

    const behavior = BehaviorGenerator.generateInstructions(config);

    if (options.logger) {
      options.logger.debug(`Generated behavior: ${behavior.length} characters`);
    }

    return behavior;
  }
}

const applicator = new ProfileApplicator();

/**
 * Apply Claude configuration profile safely
 */
export async function applyClaudeConfig(
  profile: string,
  actor: string,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  return applicator.applyClaudeConfig(profile, actor, options);
}

/**
 * Get current application status
 */
export function getApplyStatus() {
  return applicator.getStatus();
}

/**
 * Check if profile needs to be applied
 */
export async function needsApply(profile: string): Promise<boolean> {
  return applicator.needsApply(profile);
}

/**
 * Set logger for applicator
 */
export function setApplyLogger(logger: ILogger): void {
  applicator["logger"] = logger;
}
