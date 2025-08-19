# Local Resources Examples

This folder contains local CLAUDE.md configuration files and behavior profiles that demonstrate Claude Code's personality and behavior customization capabilities.

## Quick Start

```bash
# Start with character behaviors
./start.sh
```

## Usage Examples

### Character Personalities
```bash
# Apply anime character behaviors
/use apply_claude_config profileName:"lum"       # Lum (auto-loaded)
/use apply_claude_config profileName:"zoro"      # Zoro personality
/use apply_claude_config profileName:"tsundere"  # Tsundere character
/use apply_claude_config profileName:"naruto"    # Naruto personality

# List available characters
/use list_claude_configs

# Check current character
/use get_applied_config
```

### Profile Management
```bash
# Load custom profile
/use apply_claude_config filePath:"./custom-behavior.md"

# Load without auto-applying
/use apply_claude_config profileName:"zoro" autoApply:false

# Switch between characters
/use apply_claude_config profileName:"tsundere"
/use apply_claude_config profileName:"lum"
```

## Available Character Behaviors

### Anime Character Personalities

- **`lum-behavior.md`** - Lum from Urusei Yatsura
  - Characteristic "だっちゃ" speech pattern
  - Playful and affectionate personality
  - Auto-applied on startup by default

- **`zoro-behavior.md`** - Roronoa Zoro from One Piece  
  - Direct, serious communication style
  - Focus on discipline and strength
  - Sword-related metaphors

- **`tsundere-behavior.md`** - Classic tsundere character
  - Initially cold, gradually warming personality
  - Characteristic speech patterns and reactions

- **`naruto-behavior.md`** - Naruto Uzumaki from Naruto
  - Enthusiastic and determined personality
  - Use of "だってばよ" speech pattern
  - Focus on perseverance and friendship

- **`unloaded-behavior.md`** - Test configuration
  - Excluded from auto-loading for testing purposes
  - Demonstrates configuration filtering

## Usage

### Applying Character Behaviors

```bash
# Apply different character personalities in Claude Code
/use apply_claude_config profileName:"lum"      # Lum personality
/use apply_claude_config profileName:"zoro"     # Zoro personality  
/use apply_claude_config profileName:"tsundere" # Tsundere character
/use apply_claude_config profileName:"naruto"   # Naruto personality

# Or use full file paths
/use apply_claude_config filePath:"./examples/local-resources/zoro-behavior.md"
```

### Listing Available Profiles

```bash
# See all available configurations
/use list_claude_configs

# Check currently applied configuration
/use get_applied_config
```

## File Structure

Each behavior file follows the CLAUDE.md format with these sections:

- **System Instructions** - Core personality and behavior guidelines
- **Custom Instructions** - Specific speech patterns and mannerisms  
- **Rules to Follow** - Behavioral constraints and consistency rules
- **Context Information** - Character background and perspective
- **Knowledge Base** - Domain-specific knowledge for the character
- **Memory Context** - Persistent personality context
- **Available Tools** - Character-specific capabilities

## Configuration Integration

These profiles are automatically scanned and loaded by the main configuration:

```yaml
# In omni-config.yaml
autoLoad:
  profiles:
    - name: "lum"
      path: "./local-resources/lum-behavior.md"
      autoApply: true    # Automatically applied on startup
    - name: "zoro" 
      path: "./local-resources/zoro-behavior.md"
      autoApply: false   # Available but not auto-applied

fileSettings:
  includePaths:
    - "./local-resources/"
  
  configFiles:
    behavior: "*-behavior.md"  # Pattern for behavior files
```

## Creating Custom Behaviors

1. **Create a new .md file** following the naming pattern `*-behavior.md`
2. **Use the CLAUDE.md format** with appropriate sections
3. **Test with Claude Code** using `/use apply_claude_config`
4. **Add to auto-load** (optional) in the main configuration file

## Best Practices

- **Consistent Character Voice** - Maintain personality throughout all sections
- **Clear Rules** - Define specific behavioral constraints  
- **Rich Context** - Provide detailed background information
- **Testing** - Verify behavior works as expected before production use
- **Documentation** - Include clear descriptions of the character's traits