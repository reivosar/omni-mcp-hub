# Omni MCP Hub Examples

This directory contains configuration examples for different deployment scenarios.

## 🚀 Quick Start (New!)

### Option 1: Claude Desktop Integration (Recommended)
One command to set up and start:

```bash
cd examples/claude-desktop
./start.sh github_sources    # or local_sources or mcp_servers
```

This script automatically:
- Sets up Claude Desktop configuration
- Builds the project  
- Provides environment setup instructions
- Starts the server for Claude Desktop integration

### Option 2: Docker Deployment
One command for containerized deployment:

```bash
cd examples/docker
./start.sh mcp_servers       # or github_sources or local_sources
```

This script automatically:
- Creates Docker configuration
- Builds Docker image
- Sets up docker-compose
- Starts containers with health checks

### Option 3: Manual Local Development
For custom setups:

```bash
# 1. Copy configuration
cp examples/github_sources/mcp-sources.yaml ./

# 2. Set environment variables
export GITHUB_TOKEN="your_token_here"
export PORT=3000

# 3. Start server
npm start
```

## 📁 Available Source Types

### `github_sources` - GitHub Repository Aggregation
Aggregate documentation from multiple GitHub repositories.
- **Features**: Repository docs, branch tracking, token authentication
- **Environment**: Requires `GITHUB_TOKEN`
- **Use case**: Access API documentation and development guides
- **Example**: `./start.sh github_sources`

### `local_sources` - Local Filesystem Aggregation
Aggregate documentation from local filesystem directories.
- **Features**: Local file access, multiple directories, pattern matching
- **Environment**: Optional paths (`PROJECTS_PATH`, `DOCS_PATH`, `WORKSPACE_PATH`)
- **Use case**: Personal projects and local documentation
- **Example**: `./start.sh local_sources`

### `mcp_servers` - Pure MCP Server Aggregation
Pure MCP server aggregation with auto-installation.
- **Features**: Research (arxiv), file ops, web browsing, database, git, time tools
- **Environment**: Optional keys (`ARXIV_API_KEY`, `DATABASE_PATH`)
- **Use case**: Unified access to multiple MCP server capabilities
- **Example**: `./start.sh mcp_servers`

## 🔧 Deployment Methods

### `claude-desktop/` - Native Claude Desktop Integration
- **Script**: `examples/claude-desktop/start.sh [source_type]`
- **Features**: Direct Claude Desktop integration, automatic config setup
- **Best for**: Desktop users, development, testing

### `docker/` - Containerized Deployment
- **Script**: `examples/docker/start.sh [source_type]`
- **Features**: Docker containers, health checks, production-ready
- **Best for**: Production deployment, isolated environments

## 🛡️ Security Features

All configurations include:
- Command execution sandboxing
- Content validation and filtering
- Audit logging for security events
- Resource limits and monitoring
- Path restrictions and access controls

