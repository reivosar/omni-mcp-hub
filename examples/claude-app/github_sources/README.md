# GitHub Sources Example

This example demonstrates how to aggregate documentation from multiple GitHub repositories.

## Features

- **Repository Documentation**: Fetch README files and documentation from GitHub repos
- **Branch Specification**: Configure specific branches to track
- **Token Authentication**: Secure access to private repositories
- **Pattern Matching**: Filter files by patterns (*.md, docs/**/*.md)

## Environment Variables

Set these environment variables:

```bash
export GITHUB_TOKEN="your_github_personal_access_token"
export PORT=3000  # Optional, defaults to 3000
```

## Configuration

The configuration fetches documentation from:
- Claude Code Engineering Guide - Best practices and patterns for Claude Code development

## Usage

### Claude Desktop Integration
```bash
# 1. Copy configuration to Claude config directory
mkdir -p ~/.config/omni-mcp-hub
cp mcp-sources.yaml ~/.config/omni-mcp-hub/

# 2. Add to Claude Desktop config (see ../README.md for config file location)
# Add the Docker configuration from ../claude_desktop_config.example.json

# 3. Set environment variable
export GITHUB_TOKEN="your_github_personal_access_token"

# 4. Restart Claude Desktop - the server starts automatically
```

### Configuration Example
Add this to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "omni-mcp-hub-github": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", "--network", "host",
        "-v", "${HOME}/.config/omni-mcp-hub/mcp-sources.yaml:/app/mcp-sources.yaml:ro",
        "-e", "GITHUB_TOKEN=${GITHUB_TOKEN}",
        "reivosar/omni-mcp-hub:latest"
      ]
    }
  }
}
```

## Available Data

After setup, you'll have access to:
- Claude Code engineering best practices
- Development patterns and guidelines
- Code examples and templates
- Documentation for effective Claude Code usage