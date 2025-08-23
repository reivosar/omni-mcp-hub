import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { ClaudeConfigManager } from '../src/utils/claude-config.js';
import { ProfileInheritanceManager, InheritableConfig } from '../src/utils/profile-inheritance.js';
import { SilentLogger } from '../src/utils/logger.js';

describe('ProfileInheritanceManager', () => {
  let testDir: string;
  let configManager: ClaudeConfigManager;
  let inheritanceManager: ProfileInheritanceManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'profile-inheritance-test-'));
    const logger = new SilentLogger();
    configManager = new ClaudeConfigManager(logger);
    inheritanceManager = new ProfileInheritanceManager(configManager, logger);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  const createTestProfile = async (filename: string, content: string) => {
    const filepath = path.join(testDir, filename);
    await fs.writeFile(filepath, content);
    return filepath;
  };

  it('should resolve profile without inheritance', async () => {
    const profilePath = await createTestProfile('simple.md', `
# Simple Profile

## Instructions
- Be helpful
- Be accurate
    `);

    const result = await inheritanceManager.resolveProfile(profilePath);

    expect(result.errors).toHaveLength(0);
    expect(result.config.instructions).toBeDefined();
    expect(result.chain).toEqual([profilePath]);
  });

  it('should resolve single level inheritance', async () => {
    const basePath = await createTestProfile('base.md', `
# Base Profile

## Instructions
- Base instruction

## Context
- Base context
    `);

    const mainPath = await createTestProfile('main.md', `
# Main Profile

## Inheritance
enabled: true
baseProfiles:
  - base.md
overrideStrategy: merge

## Instructions
- Main instruction

## Rules
- Main rule
    `);

    const result = await inheritanceManager.resolveProfile(mainPath);

    expect(result.errors).toHaveLength(0);
    expect(result.config.instructions).toEqual(['- Base instruction', '- Main instruction']);
    expect(result.config.context).toEqual(['- Base context']);
    expect(result.config.rules).toEqual(['- Main rule']);
    expect(result.chain).toContain(basePath);
    expect(result.chain).toContain(mainPath);
  });

  it('should resolve multi-level inheritance', async () => {
    const grandparentPath = await createTestProfile('grandparent.md', `
# Grandparent Profile

## Instructions
- Grandparent instruction
    `);

    const parentPath = await createTestProfile('parent.md', `
# Parent Profile

## Inheritance
enabled: true
baseProfiles:
- grandparent.md

## Instructions
- Parent instruction
    `);

    const childPath = await createTestProfile('child.md', `
# Child Profile

## Inheritance
enabled: true
baseProfiles:
- parent.md

## Instructions
- Child instruction
    `);

    const result = await inheritanceManager.resolveProfile(childPath);

    expect(result.errors).toHaveLength(0);
    expect(result.config.instructions).toEqual([
      '- Grandparent instruction',
      '- Parent instruction',
      '- Child instruction'
    ]);
    expect(result.chain).toContain(grandparentPath);
    expect(result.chain).toContain(parentPath);
    expect(result.chain).toContain(childPath);
  });

  it('should detect circular dependencies', async () => {
    const aPath = await createTestProfile('a.md', `
# Profile A

## Inheritance
enabled: true
baseProfiles:
- b.md

## Instructions
- A instruction
    `);

    const bPath = await createTestProfile('b.md', `
# Profile B

## Inheritance
enabled: true
baseProfiles:
- a.md

## Instructions
- B instruction
    `);

    const result = await inheritanceManager.resolveProfile(aPath);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Circular dependency');
  });

  it('should handle replace strategy', async () => {
    const basePath = await createTestProfile('base.md', `
# Base Profile

## Instructions
- Base instruction 1
- Base instruction 2

## Context
- Base context
    `);

    const mainPath = await createTestProfile('main.md', `
# Main Profile

## Inheritance
enabled: true
baseProfiles:
- base.md
overrideStrategy: replace

## Instructions
- Main instruction

## Rules
- Main rule
    `);

    const result = await inheritanceManager.resolveProfile(mainPath);

    expect(result.errors).toHaveLength(0);
    expect(result.config.instructions).toEqual(['- Main instruction']);
    expect(result.config.context).toEqual(['- Base context']); // Not overridden
    expect(result.config.rules).toEqual(['- Main rule']);
  });

  it('should handle multiple base profiles', async () => {
    const base1Path = await createTestProfile('base1.md', `
# Base 1 Profile

## Instructions
- Base 1 instruction

## Context
- Base 1 context
    `);

    const base2Path = await createTestProfile('base2.md', `
# Base 2 Profile

## Instructions
- Base 2 instruction

## Tools
- Base 2 tool
    `);

    const mainPath = await createTestProfile('main.md', `
# Main Profile

## Inheritance
enabled: true
baseProfiles:
- base1.md
    - base2.md

## Instructions
- Main instruction
    `);

    const result = await inheritanceManager.resolveProfile(mainPath);

    expect(result.errors).toHaveLength(0);
    expect(result.config.instructions).toEqual([
      '- Base 1 instruction',
      '- Base 2 instruction',
      '- Main instruction'
    ]);
    expect(result.config.context).toEqual(['- Base 1 context']);
    expect(result.config.tools).toEqual(['- Base 2 tool']);
  });

  it('should validate inheritance configuration', () => {
    const validConfig: InheritableConfig = {
      inheritance: {
        enabled: true,
        baseProfiles: ['base.md'],
      overrideStrategy: 'merge',
      mergeArrays: true
      }
    };

    const validation = inheritanceManager.validateInheritanceConfig(validConfig);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should detect invalid inheritance configuration', () => {
    const invalidConfig: InheritableConfig = {
      inheritance: {
        enabled: true,
        baseProfiles: [], // Empty array
      overrideStrategy: 'invalid' as 'merge', // Invalid strategy
      mergeArrays: 'yes' as boolean // Wrong type
      }
    };

    const validation = inheritanceManager.validateInheritanceConfig(invalidConfig);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('should handle missing base profiles gracefully', async () => {
    const mainPath = await createTestProfile('main.md', `
# Main Profile

## Inheritance
enabled: true
baseProfiles:
- nonexistent.md

## Instructions
- Main instruction
    `);

    const result = await inheritanceManager.resolveProfile(mainPath);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('nonexistent.md');
  });

  it('should preserve inheritance chain metadata', async () => {
    const basePath = await createTestProfile('base.md', `
# Base Profile

## Instructions
- Base instruction
    `);

    const mainPath = await createTestProfile('main.md', `
# Main Profile

## Inheritance
enabled: true
baseProfiles:
- base.md

## Instructions
- Main instruction
    `);

    const result = await inheritanceManager.resolveProfile(mainPath);

    expect(result.config._inheritanceChain).toBeDefined();
    expect(result.config._resolvedFrom).toEqual(['base.md']);
    expect(result.chain.length).toBeGreaterThan(1);
  });

  it('should handle array merging correctly', async () => {
    const basePath = await createTestProfile('base.md', `
# Base Profile

## Instructions
- Base instruction
- Shared instruction
    `);

    const mainPath = await createTestProfile('main.md', `
# Main Profile

## Inheritance
enabled: true
baseProfiles:
- base.md
mergeArrays: true

## Instructions
- Shared instruction
- Main instruction
    `);

    const result = await inheritanceManager.resolveProfile(mainPath);

    expect(result.errors).toHaveLength(0);
    // Should deduplicate "Shared instruction"
    expect(result.config.instructions).toEqual([
      '- Base instruction',
      '- Shared instruction',
      '- Main instruction'
    ]);
  });

  it('should cache resolution results', async () => {
    const profilePath = await createTestProfile('cache-test.md', `
# Cache Test Profile

## Instructions
- Test instruction
    `);

    // First resolution
    const result1 = await inheritanceManager.resolveProfile(profilePath);
    
    // Second resolution should use cache
    const result2 = await inheritanceManager.resolveProfile(profilePath);

    expect(result1).toEqual(result2);
    
    const stats = inheritanceManager.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.paths).toContain(path.resolve(profilePath));
  });

  it('should clear cache correctly', async () => {
    const profilePath = await createTestProfile('cache-clear-test.md', `
# Cache Clear Test

## Instructions
- Test instruction
    `);

    await inheritanceManager.resolveProfile(profilePath);
    
    let stats = inheritanceManager.getCacheStats();
    expect(stats.size).toBeGreaterThan(0);

    inheritanceManager.clearCache();
    
    stats = inheritanceManager.getCacheStats();
    expect(stats.size).toBe(0);
  });

  it('should check circular dependencies correctly', async () => {
    const aPath = await createTestProfile('circular-a.md', `
# Profile A

## Inheritance
enabled: true
baseProfiles:
- circular-b.md
    `);

    const bPath = await createTestProfile('circular-b.md', `
# Profile B

## Inheritance
enabled: true
baseProfiles:
- circular-a.md
    `);

    const check = await inheritanceManager.checkCircularDependencies(aPath);
    expect(check.hasCircular).toBe(true);
  });
});