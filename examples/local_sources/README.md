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

1. Set environment variables (optional)
2. Copy configuration: `cp examples/local_sources/mcp-sources.yaml ./`
3. Start server: `npm start`
4. Add to Claude: `claude mcp add omni-mcp-hub`

## Available Data

After setup, you'll have access to:
- Local project documentation
- Development notes and guides
- Configuration files and examples
- Personal documentation and notes