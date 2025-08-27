/**
 * Profile merge rules - complete replacement base with limited append exceptions
 */

export interface ProfileMergeResult {
  instructions?: string[];
  customInstructions?: string[];
  knowledge?: string[];
  rules?: string[];
  context?: string[];
  tools?: string[];
  memory?: string;
  allowToolsAppend?: string[];
  [key: string]: unknown;
}

export interface MergeOptions {
  /** Enable append mode for specific sections (default: false - complete replacement) */
  appendSections?: string[];
  /** Preserve existing allowToolsAppend entries (default: false) */
  preserveToolsAppend?: boolean;
  /** Profile name for logging */
  profileName?: string;
}

export enum MergeStrategy {
  /** Complete replacement (default) */
  REPLACE = "replace",
  /** Append to existing content (only for whitelisted sections) */
  APPEND = "append",
  /** Union of arrays (for allowToolsAppend only) */
  UNION = "union",
}

/**
 * Sections that can be appended to (whitelist)
 */
export const APPEND_ALLOWED_SECTIONS = new Set([
  "allowToolsAppend",
  "stopwords",
  "memory_dict",
  "glossary",
]);

/**
 * Sections that must always be replaced (never merged)
 */
export const REPLACE_ONLY_SECTIONS = new Set([
  "instructions",
  "customInstructions",
  "rules",
  "context",
  "knowledge",
  "memory",
]);

/**
 * Profile merge engine with complete replacement strategy
 */
export class ProfileMerger {
  /**
   * Merge profile configurations with complete replacement strategy
   */
  static merge(
    previousProfile: ProfileMergeResult | null,
    newProfile: ProfileMergeResult,
    options: MergeOptions = {},
  ): ProfileMergeResult {
    if (!previousProfile) {
      return { ...newProfile };
    }

    const result: ProfileMergeResult = {};

    for (const [key, value] of Object.entries(newProfile)) {
      const strategy = this.determineStrategy(key, options);

      switch (strategy) {
        case MergeStrategy.REPLACE:
          result[key] = value;
          break;

        case MergeStrategy.APPEND:
          if (Array.isArray(value) && Array.isArray(previousProfile[key])) {
            result[key] = [...(previousProfile[key] as unknown[]), ...value];
          } else {
            result[key] = value;
          }
          break;

        case MergeStrategy.UNION:
          if (
            key === "allowToolsAppend" &&
            Array.isArray(value) &&
            Array.isArray(previousProfile[key])
          ) {
            const previousTools = previousProfile[key] as string[];
            const newTools = value as string[];
            result[key] = [...new Set([...previousTools, ...newTools])]; // Remove duplicates
          } else {
            result[key] = value;
          }
          break;

        default:
          result[key] = value;
      }
    }

    return result;
  }

  /**
   * Determine merge strategy for a given section
   */
  private static determineStrategy(
    sectionName: string,
    options: MergeOptions,
  ): MergeStrategy {
    if (REPLACE_ONLY_SECTIONS.has(sectionName)) {
      return MergeStrategy.REPLACE;
    }

    if (sectionName === "allowToolsAppend" && options.preserveToolsAppend) {
      return MergeStrategy.UNION;
    }

    if (
      options.appendSections?.includes(sectionName) &&
      APPEND_ALLOWED_SECTIONS.has(sectionName)
    ) {
      return MergeStrategy.APPEND;
    }

    return MergeStrategy.REPLACE;
  }

  /**
   * Validate merge configuration
   */
  static validateMergeOptions(options: MergeOptions): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (options.appendSections) {
      for (const section of options.appendSections) {
        if (REPLACE_ONLY_SECTIONS.has(section)) {
          errors.push(
            `Section '${section}' cannot be appended - it must be replaced completely`,
          );
        }

        if (!APPEND_ALLOWED_SECTIONS.has(section)) {
          errors.push(`Section '${section}' is not in the append whitelist`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get merge strategy documentation
   */
  static getStrategyDoc(): string {
    return `
# Profile Merge Strategy

## Default Behavior: Complete Replacement
- Each new profile completely replaces the previous one
- No content merging by default

## Exception 1: Tool Permissions (Union)
- allowToolsAppend: Combines tools from all profiles
- Duplicates are automatically removed

## Exception 2: Append-Only Sections
- Whitelisted sections: ${Array.from(APPEND_ALLOWED_SECTIONS).join(", ")}
- Must be explicitly requested in merge options

## Prohibited Merging
- Instructions, rules, context: Always replaced
- Prevents merge conflicts and unclear behavior

## Examples

### Complete Replacement (Default)
\`\`\`
Profile A: { instructions: ["Do X"], rules: ["Rule 1"] }
Profile B: { instructions: ["Do Y"], rules: ["Rule 2"] }
Result:    { instructions: ["Do Y"], rules: ["Rule 2"] }
\`\`\`

### Tool Union
\`\`\`
Profile A: { allowToolsAppend: ["web.search"] }
Profile B: { allowToolsAppend: ["code.read"] }
Result:    { allowToolsAppend: ["web.search", "code.read"] }
\`\`\`
    `.trim();
  }
}
