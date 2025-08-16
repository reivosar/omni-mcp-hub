#!/bin/bash

# Start Docker test environment
set -e

echo "Starting Omni MCP Hub Docker test environment..."

# Navigate to script directory
cd "$(dirname "$0")"

# Stop existing containers
echo "Cleaning up existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Start container
echo "Starting container..."
docker-compose up -d

# Wait for container to be ready
echo "Waiting for container to start..."
sleep 5

# Check if container is running
if docker-compose ps | grep -q "omni-mcp-hub-test.*Up"; then
    echo "✅ Container is running"
else
    echo "❌ Container failed to start"
    echo "Logs:"
    docker-compose logs
    exit 1
fi

echo ""
echo "🎉 Docker test environment ready!"
echo ""

# Update Claude Code MCP configuration
echo "Updating Claude Code MCP settings..."
PROJECT_ROOT=$(cd ../../.. && pwd)
cat > ~/.claude.json << EOF
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "docker",
      "args": ["exec", "-i", "omni-mcp-hub-test", "node", "dist/index.js"],
      "description": "Omni MCP Hub - Docker test environment"
    }
  }
}
EOF

echo "Claude Code MCP configuration updated!"
echo ""
echo "Commands:"
echo "  View logs:    docker-compose logs -f"
echo "  Shell access: docker-compose exec omni-mcp-hub-test sh"
echo "  Stop:         docker-compose down"
echo ""
echo "Starting Claude Code..."

# Simply start Claude Code without trying to stop existing processes
# The user should manage their own Claude Code sessions
claude