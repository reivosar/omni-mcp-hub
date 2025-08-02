# Docker Deployment Example

This example shows how to run Omni MCP Hub with Docker and integrate it with Claude Desktop.

## Quick Start

### 1. Choose and Enter Configuration Directory

```bash
# For GitHub sources
cd github_sources

# For local sources
cd local_sources

# For MCP servers
cd mcp_servers
```

### 2. Build and Run with Docker Compose

```bash
# From the chosen directory (e.g., docker/github_sources)
docker-compose -f ../docker-compose.yml up -d
```

### 3. Configure Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

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
        "-v", "${HOME}/projects:/projects:ro",
        "-v", "${HOME}/.config/omni-mcp-hub/mcp-sources.yaml:/app/mcp-sources.yaml:ro",
        "-e", "GITHUB_TOKEN=${GITHUB_TOKEN}",
        "omni-mcp-hub"
      ]
    }
  }
}
```

## Alternative: Direct Docker Run

### Build the image:
```bash
docker build -t omni-mcp-hub -f examples/docker/Dockerfile ../..
```

### Run directly:
```bash
docker run -d \
  --name omni-mcp-hub \
  -p 3000:3000 \
  -v $(pwd)/mcp-sources.yaml:/app/mcp-sources.yaml:ro \
  -v ${HOME}/projects:/projects:ro \
  -e GITHUB_TOKEN=${GITHUB_TOKEN} \
  omni-mcp-hub
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `GITHUB_TOKEN`: GitHub personal access token (for private repos)
- `NODE_ENV`: Node environment (production recommended)

## Volume Mounts

### Required:
- `/app/mcp-sources.yaml`: Your configuration file

### Optional (for local_sources):
- `/projects`: Mount your projects directory
- `/documents`: Mount your documents directory
- Add more as needed based on your configuration

## Networking

### Docker Compose (default):
- Exposes port 3000 to host
- Access via `http://localhost:3000`

### Claude Desktop Integration:
- Uses `--network host` for direct access
- No port mapping needed

## Troubleshooting

### Check logs:
```bash
docker logs omni-mcp-hub
```

### Verify server is running:
```bash
curl http://localhost:3000/health
```

### Test MCP endpoint:
```bash
curl -X POST http://localhost:3000/sse \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'
```

## Production Deployment

For production use:

1. Use specific image tags instead of `latest`
2. Set up proper logging and monitoring
3. Use environment-specific configurations
4. Consider using secrets management for tokens
5. Set resource limits in docker-compose.yml:

```yaml
services:
  omni-mcp-hub:
    # ... other config ...
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```