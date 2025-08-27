# 🏠 Local Resources Examples

**Character Personalities & Behavior Profiles for Claude Code**

This folder contains local CLAUDE.md configuration files and anime character behavior profiles that demonstrate Claude Code's personality customization capabilities. Perfect for getting started with zero external dependencies!

## 🚀 Quick Start

```bash
# Start with anime character behaviors (30 seconds)
./start.sh

# Or run manually
npm run build
node dist/index.js
```

**Instant Results:** Lum personality auto-applied, ready to use!

## 🎭 Usage Examples

### 🎌 Character Personalities
```bash
# Apply anime character behaviors in Claude Code
/use apply_claude_config profileName:"lum"       # だっちゃ！Lum (auto-applied)
/use apply_claude_config profileName:"zoro"      # Direct swordsman style
/use apply_claude_config profileName:"tsundere"  # Classic tsundere behavior
/use apply_claude_config profileName:"naruto"    # だってばよ！Energetic ninja

# Manage characters
/use list_claude_configs                          # See all available
/use get_applied_config                           # Check current character
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

## 🎭 Available Character Behaviors

### 🎌 Anime Character Personalities

**👽 `lum-behavior.md`** - Lum from Urusei Yatsura
- 💫 Characteristic "だっちゃ" speech pattern
- 💖 Playful and affectionate personality  
- ⚡ Electric powers references
- 🎯 **Auto-applied on startup by default**

**⚔️ `zoro-behavior.md`** - Roronoa Zoro from One Piece
- 🗡️ Direct, serious communication style
- 💪 Focus on discipline and strength
- 🎯 Three-sword style references
- 🧭 Directionally challenged humor

**❄️ `tsundere-behavior.md`** - Classic tsundere archetype
- 🌡️ Initially cold, gradually warming personality
- 😤 "It's not like I wanted to help..." patterns
- 💕 Hidden caring nature
- 🎭 Characteristic emotional reactions

**🍜 `naruto-behavior.md`** - Naruto Uzumaki from Naruto
- 🔥 Enthusiastic and determined personality
- 🗣️ Use of "だってばよ" speech pattern
- 👥 Focus on perseverance and friendship
- 🍥 Ramen references and ninja spirit

**🧪 `unloaded-behavior.md`** - Test configuration
- ⚠️ Excluded from auto-loading for testing
- 🔧 Demonstrates configuration filtering
- 🧪 Development testing purposes

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

## ⚙️ Configuration Integration

### 🔧 Auto-Loading Configuration
These profiles are automatically scanned and loaded:

```yaml
# In omni-config.yaml
autoLoad:
  profiles:
    - name: "lum"
      path: "./examples/local-resources/lum-behavior.md"
      autoApply: true    # 🎯 Auto-applied on startup
    - name: "zoro" 
      path: "./examples/local-resources/zoro-behavior.md"
    - name: "tsundere"
      path: "./examples/local-resources/tsundere-behavior.md"
    - name: "naruto"
      path: "./examples/local-resources/naruto-behavior.md"

# File pattern scanning
fileSettings:
  includePaths:
    - "./examples/local-resources/"
  configFiles:
    behavior: "*-behavior.md"  # Auto-discover pattern
  excludePaths:
    - "**/unloaded-behavior.md"  # Exclude test files
```

### 🛠️ CLI Tools Integration
```bash
# Profile management with CLI tools
npm run profile:admin           # Interactive profile manager
npm run admin                   # Full admin interface
npm run config:doctor           # Configuration troubleshooting
```

## 🎨 Creating Custom Behaviors

### 📝 Step-by-Step Guide
1. **Create new behavior file:** `my-character-behavior.md`
2. **Use CLAUDE.md format** with character-specific sections
3. **Test in Claude Code:** `/use apply_claude_config filePath:"./my-character-behavior.md"`
4. **Add to config** (optional) for auto-loading
5. **Validate with CLI:** `npm run profile:admin validate`

### 🎯 Character Template
```markdown
# Character Name Behavior

# Instructions
You are [Character Name] from [Series]. 
[Core personality traits]

# Custom Instructions  
- Speech pattern: [unique phrases]
- Personality quirks: [specific behaviors]
- References: [show/series specific knowledge]

# Rules
- Stay in character consistently
- Use characteristic speech patterns
- Reference appropriate background knowledge
```

## 💡 Best Practices

### 🎭 **Character Development**
- **Consistent Voice:** Maintain personality throughout all sections
- **Authentic Speech:** Use character-specific language patterns
- **Rich Background:** Include series context and personality quirks
- **Emotional Range:** Define how character reacts in different situations

### 🔧 **Technical Guidelines**
- **Testing:** Use `npm run profile:admin validate` before deployment
- **CLI Integration:** Test with `npm run config:doctor` for validation
- **Documentation:** Include clear trait descriptions and examples
- **Security:** Use `npm run scan:secrets` to check for sensitive content

### 📊 **Quality Assurance**
```bash
# Test your custom behavior
npm run profile:admin validate --name="your-character"
npm run config:check
npm run scan:secrets
```

### 🌟 **Advanced Features**
- **Profile Inheritance:** Extend base character templates
- **Conditional Behaviors:** Use context-aware responses
- **Multi-language:** Support both English and native language patterns
- **Monitoring:** Track personality consistency with audit logs