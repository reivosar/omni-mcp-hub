# Omni MCP Hub Examples

This directory contains configuration examples for different use cases.

## Quick Start

1. Choose an example configuration from below
2. Copy to root: `cp examples/[chosen]/mcp-sources.yaml ./`
3. Set environment variables as needed
4. Start server: `npm start`
5. Add to Claude: `claude mcp add omni-mcp-hub`

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

### Complete Configuration (`mcp-sources.example.yaml`)
All-in-one setup combining documentation sources and MCP servers.
- Features: GitHub + local sources + MCP server aggregation
- Use case: Comprehensive development environment