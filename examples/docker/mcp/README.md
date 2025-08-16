# Docker MCP Test Environment

This directory contains Docker configuration for testing Omni MCP Hub with MCP server integration using `test-server.js`.

## Quick Start

```bash
./start.sh
```

This will:
1. Start the Docker container with Omni MCP Hub
2. Run `test-server.js` as an external MCP server
3. Configure Claude Code to connect to the containerized instance
4. Launch Claude Code

## Files

- `docker-compose.yml` - Docker Compose configuration
- `omni-config.yaml` - Omni MCP Hub configuration for MCP server testing
- `start.sh` - Startup script

## Manual Commands

```bash
# Start container
docker-compose up -d

# View logs
docker-compose logs -f

# Shell access
docker-compose exec omni-mcp-hub-mcp sh

# Stop container
docker-compose down
```

## Test Tools Available

The test MCP server provides:
- `test-server__test_echo` - Echo back a message
- `test-server__test_math` - Simple math operations (add/multiply)