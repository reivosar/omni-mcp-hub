# Docker Test Environment

This directory contains Docker configuration for testing Omni MCP Hub with external MCP server integration.

## Quick Start

```bash
./start.sh
```

This will:
1. Start the Docker container with Omni MCP Hub
2. Configure Claude Code to connect to the containerized instance
3. Launch Claude Code

## Files

- `docker-compose.yml` - Docker Compose configuration
- `omni-config.yaml` - Omni MCP Hub configuration with external servers
- `start.sh` - Startup script
- `*-behavior.md` - Behavior profile files for testing

## Manual Commands

```bash
# Start container
docker-compose up -d

# View logs
docker-compose logs -f

# Shell access
docker-compose exec omni-mcp-hub-test sh

# Stop container
docker-compose down
```