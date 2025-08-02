# Claude Desktop Integration

This guide explains how to integrate Omni MCP Hub with Claude Desktop application.

## Available Configurations

Choose from the following configuration directories:
- `github_sources/` - GitHub repository documentation
- `local_sources/` - Local filesystem documentation  
- `mcp_servers/` - MCP server aggregation

## Configuration File Location

Find your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## Integration Methods

### Method 1: Local Node.js Process

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "node",
      "args": [
        "/path/to/omni-mcp-hub/dist/index.js"
      ],
      "env": {
        "PORT": "3000",
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

### Method 2: NPM Script

```json
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/path/to/omni-mcp-hub",
      "env": {
        "PORT": "3000",
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

### Method 3: Docker Container

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
        "-v", "${HOME}/.config/omni-mcp-hub/mcp-sources.yaml:/app/mcp-sources.yaml:ro",
        "-v", "${HOME}/projects:/projects:ro",
        "-e", "GITHUB_TOKEN=${GITHUB_TOKEN}",
        "omni-mcp-hub"
      ]
    }
  }
}
```

### Method 4: Docker Compose

```json
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "docker-compose",
      "args": [
        "-f", "/path/to/omni-mcp-hub/examples/docker/docker-compose.yml",
        "up"
      ],
      "env": {
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

## Configuration Setup

### 1. Create Configuration Directory

```bash
mkdir -p ~/.config/omni-mcp-hub
```

### 2. Copy Configuration File

Choose based on your use case:

```bash
# For MCP servers aggregation
cp /path/to/omni-mcp-hub/examples/mcp_servers/mcp-sources.yaml ~/.config/omni-mcp-hub/

# For GitHub documentation
cp /path/to/omni-mcp-hub/examples/github_sources/mcp-sources.yaml ~/.config/omni-mcp-hub/

# For local documentation
cp /path/to/omni-mcp-hub/examples/local_sources/mcp-sources.yaml ~/.config/omni-mcp-hub/
```

### 3. Edit Configuration

Customize the configuration file:
```bash
nano ~/.config/omni-mcp-hub/mcp-sources.yaml
```

## Environment Variables

Set these in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
# GitHub token for private repositories
export GITHUB_TOKEN="ghp_your_token_here"

# Custom paths for local sources
export PROJECTS_PATH="${HOME}/projects"
export DOCS_PATH="${HOME}/documents"
```

## Verification

### 1. Check Claude Desktop recognizes the server:

Restart Claude Desktop and check the MCP servers menu.

### 2. Test the connection:

In Claude, you should be able to access the aggregated tools and documentation.

### 3. Check logs:

**macOS/Linux**:
```bash
tail -f ~/Library/Logs/Claude/mcp-server-omni-mcp-hub.log
```

**Windows**:
```powershell
Get-Content "$env:APPDATA\Claude\Logs\mcp-server-omni-mcp-hub.log" -Tail 50 -Wait
```

## Troubleshooting

### Server not appearing in Claude:

1. Ensure configuration file is valid JSON
2. Check file paths are absolute, not relative
3. Restart Claude Desktop completely
4. Check logs for errors

### Permission errors:

1. Ensure mounted directories are readable
2. Check Docker has file sharing permissions
3. Verify configuration file permissions

### Connection failures:

1. Check if port 3000 is already in use
2. Verify Docker daemon is running
3. Check network connectivity
4. Review server logs

## Advanced Configuration

### Multiple Configurations

You can run multiple instances with different configs:

```json
{
  "mcpServers": {
    "omni-hub-dev": {
      "command": "node",
      "args": ["/path/to/omni-mcp-hub/dist/index.js"],
      "env": {
        "PORT": "3000",
        "CONFIG_FILE": "dev-config.yaml"
      }
    },
    "omni-hub-prod": {
      "command": "node", 
      "args": ["/path/to/omni-mcp-hub/dist/index.js"],
      "env": {
        "PORT": "3001",
        "CONFIG_FILE": "prod-config.yaml"
      }
    }
  }
}
```

### Custom Scripts

Create a wrapper script for complex setups:

```bash
#!/bin/bash
# ~/.config/omni-mcp-hub/start.sh

# Set environment
export GITHUB_TOKEN=$(security find-generic-password -s "github-token" -w)
export CONFIG_DIR="${HOME}/.config/omni-mcp-hub"

# Start server
cd /path/to/omni-mcp-hub
npm start
```

Then in Claude config:
```json
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "bash",
      "args": ["${HOME}/.config/omni-mcp-hub/start.sh"]
    }
  }
}
```