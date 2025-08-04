# Claude App Integration

This guide explains how to integrate Omni MCP Hub with Claude applications, including automated setup with Claude Code.

## Quick Start

Run the automated setup script:

```bash
# Interactive mode - select configuration and Claude options
./start.sh

# Direct mode - use specific configuration
./start.sh github_sources
```

## Available Configurations

Choose from the following configuration directories:
- `github_sources/` - GitHub repository documentation
- `local_sources/` - Local filesystem documentation  
- `mcp_servers/` - MCP server aggregation

## Features

### 🎯 Interactive Configuration Selection
- Automatically detects available configurations
- Numbered menu for easy selection
- Descriptions for each configuration type

### 🤖 Claude Options Configuration
- **Model Selection**: Sonnet 3.5, Haiku 3.5, Opus 3, etc.
- **Temperature**: Creativity level (0.0-1.0)
- **Max Tokens**: Response length control
- **System Prompts**: Default, Code Assistant, Documentation Expert, Custom

### ⚡ Automatic Claude Code Registration
- Checks for Claude CLI installation
- Removes existing registrations to avoid conflicts
- Automatically executes `claude mcp add` command
- Verifies registration success

## Configuration File Location

Find your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

The script automatically creates configuration in:
- `~/.config/claude-app/mcp-sources.yaml`
- `~/.config/claude-app/claude_app_config.json`
- `~/.config/claude-app/.env` (Claude options)

## Integration Methods

### Method 1: Automated Setup (Recommended)

```bash
cd /path/to/omni-mcp-hub/examples/claude-app
./start.sh
```

The script will:
1. 📋 Show available configurations
2. 🤖 Optionally configure Claude options
3. 🔧 Set up configuration files
4. 🚀 Build and start the server
5. ✅ Register with Claude Code automatically

### Method 2: Local Node.js Process

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "node",
      "args": [
        "/path/to/omni-mcp-hub/dist/servers/claude-code-stdio-server.js"
      ],
      "env": {
        "CONFIG_FILE": "/Users/yourusername/.config/claude-app/mcp-sources.yaml",
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

### Method 3: NPM Script

```json
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/path/to/omni-mcp-hub",
      "env": {
        "CONFIG_FILE": "/Users/yourusername/.config/claude-app/mcp-sources.yaml",
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

### Method 4: Docker Container

```json
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--network", "host",
        "-v", "${HOME}/.config/claude-app/mcp-sources.yaml:/app/mcp-sources.yaml:ro",
        "-v", "${HOME}/projects:/projects:ro",
        "-e", "GITHUB_TOKEN=${GITHUB_TOKEN}",
        "omni-mcp-hub"
      ]
    }
  }
}
```

## Manual Configuration Setup

### 1. Create Configuration Directory

```bash
mkdir -p ~/.config/claude-app
```

### 2. Copy Configuration File

Choose based on your use case:

```bash
# For MCP servers aggregation
cp /path/to/omni-mcp-hub/examples/claude-app/mcp_servers/mcp-sources.yaml ~/.config/claude-app/

# For GitHub documentation
cp /path/to/omni-mcp-hub/examples/claude-app/github_sources/mcp-sources.yaml ~/.config/claude-app/

# For local documentation
cp /path/to/omni-mcp-hub/examples/claude-app/local_sources/mcp-sources.yaml ~/.config/claude-app/
```

### 3. Edit Configuration

Customize the configuration file:
```bash
nano ~/.config/claude-app/mcp-sources.yaml
```

## Environment Variables

Set these in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
# GitHub token for private repositories
export GITHUB_TOKEN="ghp_your_token_here"

# Custom paths for local sources
export PROJECTS_PATH="${HOME}/projects"
export DOCS_PATH="${HOME}/documents"

# Claude configuration (set by automated setup)
export CLAUDE_MODEL="claude-3-5-sonnet-20241022"
export CLAUDE_TEMPERATURE="0.3"
export CLAUDE_MAX_TOKENS="4096"
export CLAUDE_SYSTEM_PROMPT="You are Claude, a helpful AI assistant."
```

## Claude Code Integration

### Automatic Registration

The script automatically registers with Claude Code:

```bash
# Check registration
claude mcp list

# Remove if needed
claude mcp remove omni-mcp-hub

# Manual registration
claude mcp add omni-mcp-hub node /path/to/claude-stdio-server.js
```

### Manual Registration

If automatic registration fails:

```bash
# Install Claude Code CLI
npm install -g @anthropic/claude-code

# Register the MCP server
claude mcp add omni-mcp-hub node /path/to/omni-mcp-hub/examples/claude-app/dist/claude-stdio-server.js
```

## Verification

### 1. Check Claude Code registration:

```bash
claude mcp list
```

### 2. Check Claude Desktop recognizes the server:

Restart Claude Desktop and check the MCP servers menu.

### 3. Test the connection:

In Claude, you should be able to access the aggregated tools and documentation.

### 4. Check logs:

**macOS/Linux**:
```bash
tail -f ~/Library/Logs/Claude/mcp-server-omni-mcp-hub.log
```

**Windows**:
```powershell
Get-Content "$env:APPDATA\Claude\Logs\mcp-server-omni-mcp-hub.log" -Tail 50 -Wait
```

## Troubleshooting

### Claude Code CLI not found:

```bash
# Install Claude Code CLI
npm install -g @anthropic/claude-code

# Verify installation
claude --version
```

### Server not appearing in Claude:

1. Ensure configuration file is valid JSON
2. Check file paths are absolute, not relative
3. Restart Claude Desktop completely
4. Check logs for errors
5. Verify Claude Code registration: `claude mcp list`

### Permission errors:

1. Ensure mounted directories are readable
2. Check Docker has file sharing permissions
3. Verify configuration file permissions
4. Check Node.js file access permissions

### Connection failures:

1. Check if port 3000 is already in use
2. Verify Node.js is installed and accessible
3. Check network connectivity
4. Review server logs
5. Verify environment variables are set

## Advanced Configuration

### Multiple Configurations

You can run multiple instances with different configs:

```json
{
  "mcpServers": {
    "omni-hub-dev": {
      "command": "node",
      "args": ["/path/to/omni-mcp-hub/dist/servers/claude-code-stdio-server.js"],
      "env": {
        "CONFIG_FILE": "/Users/yourusername/.config/claude-app/dev-config.yaml",
        "CLAUDE_MODEL": "claude-3-5-haiku-20241022"
      }
    },
    "omni-hub-prod": {
      "command": "node", 
      "args": ["/path/to/omni-mcp-hub/dist/servers/claude-code-stdio-server.js"],
      "env": {
        "CONFIG_FILE": "/Users/yourusername/.config/claude-app/prod-config.yaml",
        "CLAUDE_MODEL": "claude-3-5-sonnet-20241022"
      }
    }
  }
}
```

### Custom Scripts

Create a wrapper script for complex setups:

```bash
#!/bin/bash
# ~/.config/claude-app/start.sh

# Set environment
export GITHUB_TOKEN=$(security find-generic-password -s "github-token" -w)
export CONFIG_FILE="${HOME}/.config/claude-app/mcp-sources.yaml"

# Load Claude configuration
source "${HOME}/.config/claude-app/.env"

# Start server
cd /path/to/omni-mcp-hub
node dist/servers/claude-code-stdio-server.js
```

Then in Claude config:
```json
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "bash",
      "args": ["${HOME}/.config/claude-app/start.sh"]
    }
  }
}
```

## Example Usage

### Interactive Setup

```bash
$ ./start.sh

🚀 Omni MCP Hub - Claude App Integration

Available source configurations:

  1) github_sources - GitHub repositories and documentation
  2) local_sources - Local filesystem directories
  3) mcp_servers - MCP server integrations

Select configuration (1-3): 1
Selected: github_sources

Configure Claude options? (y/N): y

Claude Configuration

Select Claude Model:
  1) claude-3-5-sonnet-20241022 (Default - Latest Sonnet)
  2) claude-3-5-haiku-20241022 (Fast and efficient)
  ...

✅ Successfully registered omni-mcp-hub with Claude Code!
🎉 Setup complete! You can now use omni-mcp-hub in Claude Code.
```