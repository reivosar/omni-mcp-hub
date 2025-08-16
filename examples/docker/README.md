# Docker Examples

This directory contains Docker-based test environments for Omni MCP Hub.

## Available Environments

### local-resources/
Docker test environment with behavior profile management and CLAUDE.md support.

- Mounts local behavior files for testing personality profiles
- Includes comprehensive configuration management
- Auto-applies default "lum" behavior profile

**Quick start:**
```bash
cd local-resources/
./start.sh
```

### mcp/
Docker test environment focused on external MCP server integration.

- Runs `test-server.js` as an external MCP server
- Tests proxy functionality and tool aggregation
- Minimal configuration for MCP testing

**Quick start:**
```bash
cd mcp/
./start.sh
```

## Common Commands

Both environments support:

```bash
# View logs
docker-compose logs -f

# Shell access
docker-compose exec <container-name> sh

# Stop environment
docker-compose down
```

Container names:
- `local-resources/`: `omni-mcp-hub-test`
- `mcp/`: `omni-mcp-hub-mcp`