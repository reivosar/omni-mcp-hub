/**
 * Global state management for behavior application
 */

export interface BehaviorState {
  currentProfileId: string | null;
  currentHash: string | null;
  generatedBehavior: string | null;
  lastAppliedAt: Date | null;
  isApplying: boolean;
}

export interface ProfileTarget {
  source: string;
  includes?: string[];
  options?: Record<string, unknown>;
}

class BehaviorStateManager {
  private state: BehaviorState = {
    currentProfileId: null,
    currentHash: null,
    generatedBehavior: null,
    lastAppliedAt: null,
    isApplying: false,
  };

  /**
   * Get current state snapshot
   */
  getState(): BehaviorState {
    return { ...this.state };
  }

  /**
   * Create state snapshot for rollback
   */
  createSnapshot(): BehaviorState {
    return { ...this.state };
  }

  /**
   * Restore state from snapshot
   */
  restoreSnapshot(snapshot: BehaviorState): void {
    this.state = { ...snapshot };
  }

  /**
   * Atomic swap of behavior state
   */
  atomicSwapBehavior(
    behavior: string,
    metadata: { profile: string; hash: string },
  ): void {
    this.state.generatedBehavior = behavior;
    this.state.currentProfileId = metadata.profile;
    this.state.currentHash = metadata.hash;
    this.state.lastAppliedAt = new Date();
    this.state.isApplying = false;
  }

  /**
   * Set applying state
   */
  setApplying(applying: boolean): void {
    this.state.isApplying = applying;
  }

  /**
   * Check if currently applying
   */
  isCurrentlyApplying(): boolean {
    return this.state.isApplying;
  }

  /**
   * Get current hash
   */
  getCurrentHash(): string | null {
    return this.state.currentHash;
  }

  /**
   * Get current profile ID
   */
  getCurrentProfileId(): string | null {
    return this.state.currentProfileId;
  }

  /**
   * Get generated behavior
   */
  getGeneratedBehavior(): string | null {
    return this.state.generatedBehavior;
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.state = {
      currentProfileId: null,
      currentHash: null,
      generatedBehavior: null,
      lastAppliedAt: null,
      isApplying: false,
    };
  }
}

export const behaviorState = new BehaviorStateManager();
