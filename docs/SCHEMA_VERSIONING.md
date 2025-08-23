# Profile Schema Versioning Strategy

This document outlines the versioning strategy for CLAUDE.md profile schemas in Omni MCP Hub.

## Overview

The schema versioning system provides:

- **Backward Compatibility**: Older profiles continue to work
- **Automatic Migration**: Seamless upgrades to new schema versions
- **Validation**: Ensure profile integrity during migrations
- **Rollback Support**: Ability to revert problematic migrations
- **Documentation**: Clear migration paths and change documentation

## Version Format

Schema versions follow **Semantic Versioning** (SemVer):

```
MAJOR.MINOR.PATCH
```

- **MAJOR**: Incompatible API changes
- **MINOR**: Backward-compatible functionality additions
- **PATCH**: Backward-compatible bug fixes

### Current Version: 1.0.0

## Schema Declaration

Profiles can declare their schema version:

```markdown
# Schema Version: 1.2.0

# My Profile Title

## Instructions
- Follow these guidelines...
```

Or using JSON metadata:

```markdown
<!-- 
{
  "$schema": "https://schemas.omni-mcp-hub.dev/v1.2.0/claude-config.json",
  "$version": "1.2.0"
}
-->

# My Profile Title
```

## Migration Strategy

### Automatic Migration

The system automatically migrates profiles when:

1. Loading a profile with an older schema version
2. The current system version is newer
3. A valid migration path exists

```typescript
const versionManager = new SchemaVersionManager();
const migratedConfig = await versionManager.migrateConfig(config);
```

### Migration Rules

Each migration step is defined by a `MigrationRule`:

```typescript
interface MigrationRule {
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  description: string;
  migrate: (config: VersionedConfig) => VersionedConfig;
  validate?: (config: VersionedConfig) => boolean;
  rollback?: (config: VersionedConfig) => VersionedConfig;
}
```

### Example Migration

```typescript
// Migration from v1.0.0 to v1.1.0
{
  fromVersion: { major: 1, minor: 0, patch: 0 },
  toVersion: { major: 1, minor: 1, patch: 0 },
  description: 'Add support for profile inheritance',
  migrate: (config) => {
    if (!config.inheritance) {
      config.inheritance = {
        enabled: false,
        baseProfiles: []
      };
    }
    return config;
  },
  validate: (config) => config.inheritance !== undefined
}
```

## Version History

### Version 1.0.0 (Current)

**Initial schema with basic features:**

- Basic profile structure
- Instructions, guidelines, context sections
- Tools and memory configuration
- Simple string-based content

### Version 1.1.0 (Planned)

**Profile Inheritance System:**

- `inheritance` section for profile composition
- Base profile references
- Override mechanisms
- Dependency resolution

**Breaking Changes:**
- None (backward compatible)

**New Features:**
```yaml
inheritance:
  enabled: true
  baseProfiles:
    - "base-assistant"
    - "domain-expert"
  overrideStrategy: "merge" # merge | replace
```

### Version 1.2.0 (Planned)

**Enhanced Content Structure:**

- Object-based instructions with metadata
- Conditional sections
- Environment-specific configurations

**Migration Required:**
- String arrays → Object structures
- Simple sections → Enhanced metadata

**Example:**
```yaml
# Before (v1.1.0)
instructions:
  - "Be helpful and accurate"
  - "Follow best practices"

# After (v1.2.0)
instructions:
  - title: "Core Behavior"
    content: "Be helpful and accurate"
    priority: "high"
    conditions: ["always"]
  - title: "Best Practices"
    content: "Follow best practices"
    priority: "medium"
    conditions: ["development", "production"]
```

## Compatibility Matrix

| Config Version | System Version | Compatible | Requires Migration | Notes |
|----------------|---------------|------------|-------------------|--------|
| 1.0.0 | 1.0.0 | ✅ | ❌ | Exact match |
| 1.0.0 | 1.1.0 | ✅ | ✅ | Auto-migration available |
| 1.0.0 | 1.2.0 | ✅ | ✅ | Multi-step migration |
| 1.1.0 | 1.0.0 | ❌ | ❌ | Downgrade not supported |
| 2.0.0 | 1.x.x | ❌ | ❌ | Major version incompatibility |

## Migration Process

### 1. Detection

```typescript
const compatibility = versionManager.checkCompatibility(config);
console.log(compatibility);
// {
//   version: { major: 1, minor: 0, patch: 0 },
//   compatible: true,
//   requiresMigration: true,
//   migrationPath: [{ major: 1, minor: 1, patch: 0 }],
//   deprecationWarnings: ["String arrays deprecated"],
//   breakingChanges: []
// }
```

### 2. Backup Creation

Before migration, the system creates a backup:

```
.migrations/
├── my-profile-v1.0.0-2024-01-15T10-30-00-000Z.md
├── my-profile-v1.1.0-2024-01-15T10-35-00-000Z.md
└── migration-log.json
```

### 3. Step-by-Step Migration

Each migration step is applied sequentially:

1. Load original config
2. Apply migration rule
3. Validate result
4. Update metadata
5. Save migrated config

### 4. Validation

Post-migration validation ensures:

- All required fields are present
- Data types are correct
- Business rules are satisfied
- No data loss occurred

## Error Handling

### Migration Failures

When migration fails:

1. **Preserve Original**: Keep the original config unchanged
2. **Log Details**: Record failure reason and context
3. **Fallback**: Use compatibility mode if possible
4. **User Notification**: Inform user of manual intervention needed

### Rollback Strategy

For critical failures:

```typescript
const rollbackConfig = migrationRule.rollback?.(migratedConfig);
```

Rollback limitations:
- Not all migrations are reversible
- Data added in newer versions may be lost
- Manual review recommended

## Best Practices

### For Profile Authors

1. **Always specify version** in new profiles
2. **Test migrations** before deploying
3. **Document changes** that may affect migrations
4. **Use semantic versioning** for profile releases

### For System Integrators

1. **Backup before migration** (automatic)
2. **Validate after migration** (automatic)
3. **Monitor migration logs** for issues
4. **Plan migration windows** for major versions

### For Developers

1. **Write comprehensive migration tests**
2. **Document breaking changes clearly**
3. **Provide rollback functions when possible**
4. **Consider performance impact of migrations**

## CLI Commands

### Check Version

```bash
omni-admin status
# Shows current schema version and compatibility info
```

### Migrate Profile

```bash
omni-profile-admin migrate profile.md
# Migrates single profile to current version
```

### Batch Migration

```bash
omni-profile-admin migrate-all --backup --dry-run
# Migrates all profiles with backup and preview
```

### Version Information

```bash
omni-profile-admin version --profile profile.md
# Shows version info for specific profile
```

## API Integration

### Version Manager Usage

```typescript
import { SchemaVersionManager } from './utils/schema-version-manager.js';

const versionManager = new SchemaVersionManager();

// Check compatibility
const info = versionManager.checkCompatibility(config);
if (info.requiresMigration) {
  // Create backup
  await versionManager.createBackup(config, profilePath);
  
  // Migrate
  const migrated = await versionManager.migrateConfig(config);
  
  // Save updated profile
  await saveProfile(migrated, profilePath);
}
```

### Custom Migration Rules

```typescript
versionManager.registerMigrationRule({
  fromVersion: { major: 1, minor: 1, patch: 0 },
  toVersion: { major: 1, minor: 2, patch: 0 },
  description: 'Convert instructions to object format',
  migrate: (config) => {
    if (Array.isArray(config.instructions)) {
      config.instructions = config.instructions.map(instruction => ({
        title: 'Instruction',
        content: instruction,
        priority: 'medium'
      }));
    }
    return config;
  }
});
```

## Testing Strategy

### Migration Tests

```typescript
describe('Schema Migration v1.0.0 -> v1.1.0', () => {
  it('should add inheritance section', () => {
    const input = { /* v1.0.0 config */ };
    const result = migrationRule.migrate(input);
    expect(result.inheritance).toBeDefined();
  });

  it('should preserve existing data', () => {
    const input = { instructions: ['test'] };
    const result = migrationRule.migrate(input);
    expect(result.instructions).toEqual(['test']);
  });
});
```

### Compatibility Tests

```typescript
describe('Version Compatibility', () => {
  it('should be compatible within minor versions', () => {
    const compatible = SchemaVersionManager.isCompatible(
      { major: 1, minor: 0, patch: 0 },
      { major: 1, minor: 1, patch: 0 }
    );
    expect(compatible).toBe(true);
  });
});
```

## Future Considerations

### Long-term Strategy

1. **Schema Registry**: Central repository for schema definitions
2. **Automated Testing**: CI/CD integration for migration validation
3. **Performance Optimization**: Efficient bulk migration tools
4. **Cross-version Support**: Extended compatibility windows

### Deprecation Policy

- **Minor versions**: 2 versions backward compatibility
- **Major versions**: 1 version overlap period
- **End-of-life**: 6-month notice for unsupported versions

### Extension Points

The system is designed to be extensible:

- Custom migration rules
- Plugin-based validators
- External schema sources
- Integration with other tools