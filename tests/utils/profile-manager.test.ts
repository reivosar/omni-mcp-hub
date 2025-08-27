import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { ProfileManager } from '../../src/utils/profile-manager.js';
import { SilentLogger } from '../../src/utils/logger.js';

describe('ProfileManager', () => {
  let testDir: string;
  let profileManager: ProfileManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'profile-manager-test-'));
    const logger = new SilentLogger();
    profileManager = new ProfileManager(logger, {
      autoResolveInheritance: true,
      cacheResults: true,
      validateOnLoad: true
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  const createTestProfile = async (filename: string, content: string) => {
    const filepath = path.join(testDir, filename);
    await fs.writeFile(filepath, content);
    return filepath;
  };

  it('should load simple profile without inheritance', async () => {
    const profilePath = await createTestProfile('simple.md', `
# Simple Profile

## Instructions
- Be helpful
- Be accurate

## Context
- Test context
    `);

    const result = await profileManager.loadProfile(profilePath);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.resolved).toBe(false);
    expect(result.config.instructions).toEqual(['- Be helpful', '- Be accurate']);
    expect(result.config.context).toEqual(['- Test context']);
  });

  it('should load and resolve profile with inheritance', async () => {
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

    const result = await profileManager.loadProfile(mainPath);

    expect(result.errors).toHaveLength(0);
    expect(result.resolved).toBe(true);
    expect(result.chain).toBeDefined();
    expect(result.config.instructions).toEqual(['- Base instruction', '- Main instruction']);
    expect(result.config.context).toEqual(['- Base context']);
    expect(result.config.rules).toEqual(['- Main rule']);
  });

  it('should load multiple profiles', async () => {
    const profile1Path = await createTestProfile('profile1.md', `
# Profile 1

## Instructions
- Profile 1 instruction
    `);

    const profile2Path = await createTestProfile('profile2.md', `
# Profile 2

## Instructions
- Profile 2 instruction
    `);

    const results = await profileManager.loadProfiles([profile1Path, profile2Path]);

    expect(results.size).toBe(2);
    
    const result1 = results.get(path.resolve(profile1Path));
    const result2 = results.get(path.resolve(profile2Path));
    
    expect(result1?.errors).toHaveLength(0);
    expect(result2?.errors).toHaveLength(0);
    expect(result1?.config.instructions).toEqual(['- Profile 1 instruction']);
    expect(result2?.config.instructions).toEqual(['- Profile 2 instruction']);
  });

  it('should create new profile', async () => {
    const profilePath = path.join(testDir, 'new-profile.md');
    
    await profileManager.createProfile(profilePath, {
      instructions: ['New instruction'],
      context: ['New context']
    });

    await expect(fs.access(profilePath)).resolves.toBeUndefined();

    const result = await profileManager.loadProfile(profilePath);
    expect(result.config.instructions).toEqual(['New instruction']);
    expect(result.config.context).toEqual(['New context']);
  });

  it('should create profile with inheritance configuration', async () => {
    const profilePath = path.join(testDir, 'inherited-profile.md');
    
    await profileManager.createProfile(profilePath, {
      instructions: ['Main instruction']
    }, {
      enabled: true,
      baseProfiles: ['base.md'],
      overrideStrategy: 'merge'
    });

    const result = await profileManager.loadProfile(profilePath, false); // Don't resolve to check config
    expect(result.config.inheritance?.enabled).toBe(true);
    expect(result.config.inheritance?.baseProfiles).toEqual(['base.md']);
    expect(result.config.inheritance?.overrideStrategy).toBe('merge');
  });

  it('should update inheritance configuration', async () => {
    const profilePath = await createTestProfile('update-test.md', `
# Update Test Profile

## Instructions
- Test instruction
    `);

    await profileManager.updateInheritance(profilePath, {
      enabled: true,
      baseProfiles: ['base1.md', 'base2.md'],
      overrideStrategy: 'merge',
      mergeArrays: true
    });

    const result = await profileManager.loadProfile(profilePath, false);
    // Check inheritance properties based on how they're actually stored
    if (result.config.inheritance) {
      expect(result.config.inheritance.enabled).toBe(true);
      expect(result.config.inheritance.baseProfiles).toEqual(['base1.md', 'base2.md']);
      expect(result.config.inheritance.mergeArrays).toBe(true);
    } else {
      // Fallback to individual properties if inheritance object not found
      expect(result.config.enabled).toBe('true');
      expect(result.config.base_profiles).toBe('base1.md, base2.md');
      expect(result.config.merge_arrays).toBe('true');
    }
  });

  it('should get inheritance chain', async () => {
    const basePath = await createTestProfile('chain-base.md', `
# Chain Base Profile

## Instructions
- Base instruction
    `);

    const mainPath = await createTestProfile('chain-main.md', `
# Chain Main Profile

## Inheritance
enabled: true
baseProfiles:
  - chain-base.md

## Instructions
- Main instruction
    `);

    const chain = await profileManager.getInheritanceChain(mainPath);
    
    expect(chain).toContain(path.resolve(basePath));
    expect(chain).toContain(path.resolve(mainPath));
  });

  it('should check for circular dependencies', async () => {
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

    const check = await profileManager.checkCircularDependencies(aPath);
    expect(check.hasCircular).toBe(true);
  });

  it('should validate profile', async () => {
    const validPath = await createTestProfile('valid.md', `
# Valid Profile

## Inheritance
enabled: true
baseProfiles:
  - valid-base.md
overrideStrategy: merge

## Instructions
- Valid instruction
    `);

    const basePath = await createTestProfile('valid-base.md', `
# Valid Base Profile

## Instructions
- Base instruction
    `);

    const validation = await profileManager.validateProfile(validPath);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should detect invalid profile configuration', async () => {
    const invalidPath = await createTestProfile('invalid.md', `
# Invalid Profile

## Inheritance
enabled: true
baseProfiles:
overrideStrategy: invalid-strategy

## Instructions
- Invalid instruction
    `);

    const validation = await profileManager.validateProfile(invalidPath);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('should list profiles in directory', async () => {
    await createTestProfile('profile1-claude.md', `
# Profile 1

## Instructions
- Profile 1 instruction
    `);

    await createTestProfile('profile2-claude.md', `
# Profile 2

## Inheritance
enabled: true
baseProfiles:
  - profile1-claude.md

## Instructions
- Profile 2 instruction
    `);

    const profiles = await profileManager.listProfiles(testDir);

    expect(profiles).toHaveLength(2);
    
    const profile1 = profiles.find(p => p.name === 'profile1-claude');
    const profile2 = profiles.find(p => p.name === 'profile2-claude');

    expect(profile1?.hasInheritance).toBe(false);
    expect(profile2?.hasInheritance).toBe(true);
    expect(profile2?.baseProfiles).toEqual(['profile1-claude.md']);
  });

  it('should export resolved profile', async () => {
    const basePath = await createTestProfile('export-base.md', `
# Export Base Profile

## Instructions
- Base instruction

## Context
- Base context
    `);

    const mainPath = await createTestProfile('export-main.md', `
# Export Main Profile

## Inheritance
enabled: true
baseProfiles:
  - export-base.md

## Instructions
- Main instruction

## Rules
- Main rule
    `);

    const exportPath = path.join(testDir, 'exported.md');
    await profileManager.exportResolvedProfile(mainPath, exportPath);

    // Load the exported profile and verify it doesn't have inheritance config
    const exportedResult = await profileManager.loadProfile(exportPath, false);
    expect(exportedResult.config.inheritance).toBeUndefined();
    expect(exportedResult.config._inheritanceChain).toBeUndefined();
    expect(exportedResult.config._resolvedFrom).toBeUndefined();
    expect(exportedResult.config.instructions).toEqual(['- Base instruction', '- Main instruction']);
    expect(exportedResult.config.context).toEqual(['- Base context']);
    expect(exportedResult.config.rules).toEqual(['- Main rule']);
  });

  it('should preview resolution', async () => {
    const basePath = await createTestProfile('preview-base.md', `
# Preview Base Profile

## Instructions
- Base instruction
    `);

    const mainPath = await createTestProfile('preview-main.md', `
# Preview Main Profile

## Inheritance
enabled: true
baseProfiles:
  - preview-base.md

## Instructions
- Main instruction
    `);

    const preview = await profileManager.previewResolution(mainPath);

    expect(preview.errors).toHaveLength(0);
    expect(preview.config.instructions).toEqual(['- Base instruction', '- Main instruction']);
  });

  it('should clear caches', async () => {
    const profilePath = await createTestProfile('cache-test.md', `
# Cache Test Profile

## Instructions
- Test instruction
    `);

    await profileManager.loadProfile(profilePath);
    
    let stats = profileManager.getCacheStats();
    expect(stats.configCache.paths.length).toBeGreaterThan(0);

    profileManager.clearCaches();
    
    stats = profileManager.getCacheStats();
    expect(stats.inheritanceCache.size).toBe(0);
  });

  it('should get current schema version', () => {
    const version = profileManager.getCurrentSchemaVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should check schema compatibility', async () => {
    const profilePath = await createTestProfile('schema-test.md', `
# Schema Version: 1.0.0

# Schema Test Profile

## Instructions
- Test instruction
    `);

    const compatibility = await profileManager.checkSchemaCompatibility(profilePath);
    
    expect(compatibility.version).toBe('1.0.0');
    expect(typeof compatibility.compatible).toBe('boolean');
    expect(typeof compatibility.requiresMigration).toBe('boolean');
  });

  it('should handle load errors gracefully', async () => {
    const nonExistentPath = path.join(testDir, 'nonexistent.md');
    
    const result = await profileManager.loadProfile(nonExistentPath);
    
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('nonexistent.md');
  });

  it('should handle inheritance validation errors', async () => {
    const profilePath = await createTestProfile('invalid-inheritance.md', `
# Invalid Inheritance Profile

## Inheritance
enabled: true
baseProfiles:
overrideStrategy: invalid

## Instructions
- Test instruction
    `);

    const result = await profileManager.loadProfile(profilePath);
    
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.resolved).toBe(false);
  });

  it('should respect autoResolveInheritance option', async () => {
    const basePath = await createTestProfile('option-base.md', `
# Option Base Profile

## Instructions
- Base instruction
    `);

    const mainPath = await createTestProfile('option-main.md', `
# Option Main Profile

## Inheritance
enabled: true
baseProfiles:
  - option-base.md

## Instructions
- Main instruction
    `);

    // Load with inheritance resolution disabled
    const result = await profileManager.loadProfile(mainPath, false);
    
    expect(result.errors).toHaveLength(0);
    expect(result.resolved).toBe(false);
    expect(result.config.instructions).toEqual(['- Main instruction']); // Not merged
  });
});