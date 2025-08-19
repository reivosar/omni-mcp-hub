# Omni MCP Hub Examples

This directory contains examples and test configurations for the Omni MCP Hub.

## Quick Start

Choose your configuration and run:

```bash
# Mixed MCP servers (Recommended)
./mixed/start.sh

# Local resources only
./local-resources/start.sh

# External MCP servers
./mcp/start.sh
```

## Usage Examples

### Mixed MCP Environment
```bash
# Switch between development profiles
/use apply_claude_config profileName:"dev-assistant"
/use apply_claude_config profileName:"code-reviewer"

# Use integrated MCP tools
/use serena__find_symbol className:"UserController"
/use filesystem__read_file path:"README.md"
```

### Character Behaviors
```bash
# Apply character personalities
/use apply_claude_config profileName:"lum"
/use apply_claude_config profileName:"zoro"
/use apply_claude_config profileName:"tsundere"
/use apply_claude_config profileName:"naruto"

# List available configurations
/use list_claude_configs

# Check current configuration
/use get_applied_config
```

## Directory Structure

### `local-resources/`
Character behavior profiles and personality configurations for Claude Code.

- **Character Behaviors**: Anime character personalities (Lum, Zoro, Tsundere, Naruto)
- **CLAUDE.md Format**: Demonstration of configuration file structure
- **Auto-loading**: Example profiles that load automatically

### `mcp/`
External MCP server integration examples and test configurations.

- **Test Server**: Simple MCP server implementation (`test-server.js`)
- **Configuration Examples**: Real-world MCP server integration patterns
- **Proxy Testing**: Tools for testing MCP protocol functionality

### `docker/`
Docker-based test environments for different use cases.

#### `docker/local-resources/`
- Behavior profile testing in containerized environment
- Auto-applies "lum" personality by default
- Full CLAUDE.md configuration management

#### `docker/mcp/`
- External MCP server integration testing
- Runs test MCP server with proxy functionality
- Minimal configuration for focused testing

## Quick Start

### Test Character Behaviors
```bash
cd local-resources/
# Files ready for use with apply_claude_config tool
```

### Test MCP Integration
```bash
cd mcp/
node test-server.js  # Run standalone
# Or use configuration files with main application
```

### Docker Testing
```bash
cd docker/local-resources/
./start.sh  # Full behavior profile environment

# Or
cd docker/mcp/
./start.sh  # MCP server integration testing
```

## Use Cases

- **Development**: Test new personality profiles and behaviors
- **Integration**: Validate external MCP server connections
- **Demo**: Showcase different Claude Code personalities
- **CI/CD**: Automated testing of configuration changes