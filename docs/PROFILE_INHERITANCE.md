# Profile Inheritance System

This document describes the profile inheritance system that allows CLAUDE.md profiles to extend and compose other profiles.

## Overview

The profile inheritance system provides:

- **Profile Composition**: Combine multiple base profiles into a single profile
- **Override Strategies**: Control how configurations are merged (merge vs replace)
- **Multi-level Inheritance**: Support for inheritance chains with multiple levels
- **Circular Dependency Detection**: Automatic detection and prevention of circular references
- **Validation**: Comprehensive validation of inheritance configurations
- **Resolution Caching**: Performance optimization through intelligent caching

## Basic Usage

### Enabling Inheritance

To enable inheritance in a profile, add an `inheritance` section:

```markdown
# My Profile

inheritance:
  enabled: true
  baseProfiles:
    - "base-assistant.md"
    - "domain-expert.md"
  overrideStrategy: merge
  mergeArrays: true

## Instructions
- Follow my specific guidelines
```

### Inheritance Configuration

The inheritance configuration supports these options:

```yaml
inheritance:
  enabled: true                    # Enable/disable inheritance
  baseProfiles:                   # Array of base profile paths
    - "path/to/base1.md"
    - "path/to/base2.md"
  overrideStrategy: "merge"       # "merge" or "replace"
  mergeArrays: true               # Merge or replace array values
  respectOrder: true              # Respect order of base profiles
```

#### Configuration Options

- **`enabled`** (boolean): Whether inheritance is active
- **`baseProfiles`** (string[]): Paths to base profiles (relative or absolute)
- **`overrideStrategy`** ("merge" | "replace"): How to handle conflicting values
- **`mergeArrays`** (boolean): Whether to merge or replace array values (default: true)
- **`respectOrder`** (boolean): Process base profiles in specified order (default: true)

## Override Strategies

### Merge Strategy (Default)

Combines values from base profiles with the current profile:

```markdown
# Base Profile
## Instructions
- Base instruction 1
- Base instruction 2

# Main Profile
inheritance:
  enabled: true
  baseProfiles: ["base.md"]
  overrideStrategy: merge

## Instructions
- Main instruction

# Result:
## Instructions
- Base instruction 1
- Base instruction 2
- Main instruction
```

### Replace Strategy

Replaces base profile values entirely:

```markdown
# Base Profile
## Instructions
- Base instruction 1
- Base instruction 2

# Main Profile
inheritance:
  enabled: true
  baseProfiles: ["base.md"]
  overrideStrategy: replace

## Instructions
- Main instruction

# Result:
## Instructions
- Main instruction
```

## Multi-level Inheritance

Profiles can inherit from other profiles that also have inheritance:

```markdown
# grandparent.md
## Instructions
- Grandparent instruction

# parent.md
inheritance:
  enabled: true
  baseProfiles: ["grandparent.md"]

## Instructions
- Parent instruction

# child.md
inheritance:
  enabled: true
  baseProfiles: ["parent.md"]

## Instructions
- Child instruction

# Result in child.md:
## Instructions
- Grandparent instruction
- Parent instruction
- Child instruction
```

## Multiple Base Profiles

A profile can inherit from multiple base profiles:

```markdown
# base-assistant.md
## Instructions
- Be helpful and polite

## Context
- You are an AI assistant

# domain-expert.md
## Instructions
- Provide expert knowledge

## Tools
- Use specialized tools

# main.md
inheritance:
  enabled: true
  baseProfiles:
    - "base-assistant.md"
    - "domain-expert.md"

## Instructions
- Follow specific guidelines

# Result:
## Instructions
- Be helpful and polite
- Provide expert knowledge
- Follow specific guidelines

## Context
- You are an AI assistant

## Tools
- Use specialized tools
```

## Path Resolution

Profile paths in `baseProfiles` are resolved as follows:

1. **Absolute paths**: Used as-is
2. **Relative paths**: Resolved relative to the current profile's directory
3. **File extension**: `.md` extension is added automatically if not present

Examples:
```yaml
baseProfiles:
  - "/absolute/path/to/base.md"     # Absolute path
  - "../shared/base"                # Relative path, .md added automatically  
  - "../../common/assistant.md"     # Relative path with extension
```

## Circular Dependency Detection

The system automatically detects and prevents circular dependencies:

```markdown
# profile-a.md
inheritance:
  enabled: true
  baseProfiles: ["profile-b.md"]

# profile-b.md
inheritance:
  enabled: true
  baseProfiles: ["profile-a.md"]  # Creates circular dependency

# Error: Circular dependency detected: profile-a.md -> profile-b.md -> profile-a.md
```

## API Usage

### ProfileManager

The `ProfileManager` class provides high-level profile management with inheritance:

```typescript
import { ProfileManager } from './utils/profile-manager.js';

const profileManager = new ProfileManager();

// Load profile with inheritance resolution
const result = await profileManager.loadProfile('profile.md');
console.log(result.config);      // Resolved configuration
console.log(result.chain);       // Inheritance chain
console.log(result.resolved);    // Whether inheritance was applied

// Load without inheritance resolution
const simpleResult = await profileManager.loadProfile('profile.md', false);
```

### ProfileInheritanceManager

Lower-level inheritance management:

```typescript
import { ProfileInheritanceManager } from './utils/profile-inheritance.js';
import { ClaudeConfigManager } from './utils/claude-config.js';

const configManager = new ClaudeConfigManager();
const inheritanceManager = new ProfileInheritanceManager(configManager);

// Resolve inheritance
const result = await inheritanceManager.resolveProfile('profile.md');

// Check for circular dependencies
const check = await inheritanceManager.checkCircularDependencies('profile.md');
console.log(check.hasCircular);  // boolean
console.log(check.chain);        // string[]
```

## Validation

The system provides comprehensive validation:

```typescript
// Validate inheritance configuration
const validation = inheritanceManager.validateInheritanceConfig(config);
console.log(validation.valid);     // boolean
console.log(validation.errors);    // string[]
console.log(validation.warnings);  // string[]

// Validate entire profile with inheritance
const profileValidation = await profileManager.validateProfile('profile.md');
```

## Caching

The inheritance system includes intelligent caching:

- **Resolution caching**: Resolved profiles are cached to improve performance
- **Cache invalidation**: Cache is cleared when profiles are updated
- **Statistics**: Monitor cache performance and usage

```typescript
// Get cache statistics
const stats = inheritanceManager.getCacheStats();
console.log(stats.size);     // number of cached profiles
console.log(stats.paths);    // cached profile paths

// Clear cache manually
inheritanceManager.clearCache();
```

## Examples

### Basic Inheritance

```markdown
# base-assistant.md
## Instructions
- Be helpful and accurate
- Maintain professional tone

## Context
- You are a helpful AI assistant

# specialized-assistant.md
inheritance:
  enabled: true
  baseProfiles: ["base-assistant.md"]

## Instructions
- Specialize in technical topics
- Provide code examples when relevant

## Tools
- Use code analysis tools
```

### Multi-Domain Expert

```markdown
# base-expert.md
## Instructions
- Provide authoritative information
- Cite sources when possible

# security-expert.md
inheritance:
  enabled: true
  baseProfiles: ["base-expert.md"]

## Instructions
- Focus on security best practices
- Always consider threat models

## Context
- You specialize in cybersecurity

# ai-security-expert.md
inheritance:
  enabled: true
  baseProfiles: 
    - "security-expert.md"
    - "../ai/ai-specialist.md"

## Instructions
- Combine AI knowledge with security expertise
- Address AI-specific security concerns
```

### Profile Composition

```markdown
# communication-style.md
## Instructions
- Use clear, concise language
- Avoid jargon unless necessary
- Be empathetic and understanding

# technical-knowledge.md
## Instructions
- Provide accurate technical information
- Use appropriate technical terminology
- Include relevant examples

## Tools
- Technical documentation tools
- Code analysis capabilities

# customer-support.md
inheritance:
  enabled: true
  baseProfiles:
    - "communication-style.md"
    - "technical-knowledge.md"
  overrideStrategy: merge

## Instructions
- Prioritize customer satisfaction
- Escalate complex issues appropriately

## Context
- You are providing customer support
- Focus on solving user problems
```

## Error Handling

The inheritance system provides detailed error reporting:

### Common Errors

1. **Missing base profile**:
   ```
   Failed to resolve base profile missing-profile.md: ENOENT: no such file or directory
   ```

2. **Circular dependency**:
   ```
   Circular dependency detected: profile-a.md -> profile-b.md -> profile-a.md
   ```

3. **Invalid configuration**:
   ```
   Invalid inheritance configuration: inheritance.overrideStrategy must be "merge" or "replace"
   ```

### Error Recovery

The system continues processing when possible:
- Invalid base profiles are skipped with warnings
- Partial inheritance is applied when some bases fail to load
- Original configuration is preserved if inheritance fails completely

## Best Practices

### Profile Organization

1. **Create reusable base profiles** for common configurations
2. **Use descriptive names** that indicate the profile's purpose
3. **Organize profiles in directories** by domain or function
4. **Keep inheritance chains shallow** (avoid deep nesting)

### Configuration Management

1. **Use merge strategy** for most cases to combine capabilities
2. **Use replace strategy** when you need to completely override sections
3. **Enable mergeArrays** to combine instructions and other lists
4. **Test inheritance chains** to ensure expected behavior

### Performance Considerations

1. **Leverage caching** by reusing ProfileManager instances
2. **Validate profiles** during development, not runtime
3. **Use absolute paths** for base profiles in production
4. **Monitor cache statistics** to optimize performance

## Testing

The inheritance system includes comprehensive tests:

```bash
# Run inheritance tests
npm test -- --testPathPattern=profile-inheritance

# Run profile manager tests  
npm test -- --testPathPattern=profile-manager
```

## CLI Support

The admin CLI provides inheritance management commands:

```bash
# Validate profile inheritance
omni-admin profile validate path/to/profile.md

# Show inheritance chain
omni-admin profile chain path/to/profile.md

# Check for circular dependencies
omni-admin profile check-circular path/to/profile.md

# Export resolved profile
omni-admin profile export path/to/profile.md output.md
```

## Schema Version Compatibility

The inheritance system is part of schema version 1.1.0 and later. Profiles with inheritance configuration will be automatically migrated from earlier schema versions.

```markdown
# Schema Version: 1.1.0

# Profile with Inheritance

inheritance:
  enabled: true
  baseProfiles: ["base.md"]
```

## Future Enhancements

Planned features for future versions:

1. **Conditional inheritance**: Apply inheritance based on environment or context
2. **Profile templates**: Template-based profile generation
3. **Dependency resolution**: Automatic resolution of profile dependencies
4. **Profile registries**: Remote profile repositories and sharing
5. **Visual inheritance tools**: GUI tools for managing inheritance chains