# Omni MCP Hub Examples

This directory contains configuration examples for different use cases.

## Quick Start

### Option 1: Local Development
1. Choose an example configuration from below
2. Copy to root: `cp examples/[chosen]/mcp-sources.yaml ./`
3. Set environment variables as needed
4. Start server: `npm start`
5. Add to Claude: `claude mcp add omni-mcp-hub`

### Option 2: Docker + Claude Desktop
1. Copy configuration: `cp examples/[chosen]/mcp-sources.yaml ~/.config/omni-mcp-hub/`
2. Add configuration to Claude Desktop (see `claude-desktop/README.md`)
3. Restart Claude Desktop
4. The server starts automatically when Claude launches

## Available Examples

### GitHub Sources (`github_sources/`)
Aggregate documentation from multiple GitHub repositories.
- Features: Repository docs, branch tracking, token authentication
- Use case: Access API documentation and development guides

### Local Sources (`local_sources/`)
Aggregate documentation from local filesystem directories.
- Features: Local file access, multiple directories, pattern matching
- Use case: Personal projects and local documentation

### MCP Servers (`mcp_servers/`)
Pure MCP server aggregation with auto-installation.
- Features: Research, file ops, web browsing, database, git, time tools
- Use case: Unified access to multiple MCP server capabilities

### Docker Deployment (`docker/`)
Run Omni MCP Hub in Docker containers.
- Features: Dockerfile, docker-compose, production setup
- Use case: Containerized deployment and Claude Desktop integration

### Claude Desktop Integration (`claude-desktop/`)
Configure Omni MCP Hub with Claude Desktop application.
- Features: Configuration examples, multiple integration methods
- Use case: Direct integration with Claude Desktop app

