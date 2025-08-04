# Local Sources Example

This example demonstrates how to aggregate documentation from local filesystem directories.

## Features

- **Local File Access**: Read documentation from filesystem paths
- **Multiple Directories**: Configure multiple source directories
- **Pattern Matching**: Filter files by extensions and patterns
- **Environment Variables**: Flexible path configuration

## Environment Variables

Set these environment variables to customize paths:

```bash
export PROJECTS_PATH="/home/user/projects"
export DOCS_PATH="/usr/local/docs"  
export WORKSPACE_PATH="/workspace"
export PORT=3000  # Optional, defaults to 3000
```

## Configuration

The configuration reads documentation from:
- Current directory (`./`)
- User's projects directory
- System documentation directory
- Workspace directory

## File Patterns

Includes these file types:
- `CLAUDE.md` - Claude-specific documentation
- `README.md` - Project documentation
- `*.md` - All Markdown files
- `docs/**/*.md` - Documentation directory
- `**/*.txt` - Text files
- `CHANGELOG.md` - Change logs
- `CONTRIBUTING.md` - Contribution guides

## Usage

### Claude Desktop Integration
```bash
# 1. Copy configuration to Claude config directory
mkdir -p ~/.config/omni-mcp-hub
cp mcp-sources.yaml ~/.config/omni-mcp-hub/

# 2. Add to Claude Desktop config (see ../README.md for config file location)
# Add the Docker configuration from ../claude_desktop_config.example.json

# 3. Restart Claude Desktop - the server starts automatically
```

### Configuration Example
Add this to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "omni-mcp-hub-local": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", "--network", "host",
        "-v", "${HOME}/.config/omni-mcp-hub/mcp-sources.yaml:/app/mcp-sources.yaml:ro",
        "-v", "${HOME}/projects:/projects:ro",
        "-v", "${HOME}/documents:/documents:ro",
        "reivosar/omni-mcp-hub:latest"
      ]
    }
  }
}
```

### Testing with Sample Project
The `sample-project` directory contains example documentation files.
Mount this directory by adding to the Docker args:
```
"-v", "$(pwd)/sample-project:/sample-project:ro"
```

## Available Data

After setup, you'll have access to:
- Local project documentation
- Development notes and guides
- Configuration files and examples
- Personal documentation and notes