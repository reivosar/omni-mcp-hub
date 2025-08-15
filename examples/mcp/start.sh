#!/bin/bash

# Omni MCP Hub - MCP Integration Setup Script
# Usage: ./examples/mcp/start.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo -e "${BLUE}Omni MCP Hub - MCP Integration Setup${NC}"
echo ""

# 1. Build
echo -e "${YELLOW}1. Building project...${NC}"
cd "$PROJECT_DIR"
npm run build
cd - > /dev/null
echo -e "${GREEN}Build completed${NC}"
echo ""

# 2. Claude Code MCP Configuration
echo -e "${YELLOW}2. Setting up MCP Configuration for External Servers...${NC}"

MCP_CONFIG=".claude"

if [ -f "$MCP_CONFIG" ]; then
    echo "Updating existing MCP configuration..."
    cp "$MCP_CONFIG" "$MCP_CONFIG.backup"
    
    python3 -c "
import json

config_path = '$MCP_CONFIG'
with open(config_path, 'r') as f:
    config = json.load(f)

if 'mcpServers' not in config:
    config['mcpServers'] = {}

config['mcpServers']['omni-mcp-hub'] = {
    'command': 'node',
    'args': ['../../dist/index.js'],
    'description': 'Omni MCP Hub - External MCP Integration'
}

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)
"
else
    echo "Creating new MCP configuration..."
    cat > "$MCP_CONFIG" <<EOF
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "node",
      "args": [
        "../../dist/index.js"
      ],
      "description": "Omni MCP Hub - External MCP Integration"
    }
  }
}
EOF
fi

echo -e "${GREEN}MCP configuration updated in .claude${NC}"
echo ""

# 3. Display configuration
echo -e "${YELLOW}3. Displaying MCP Integration configuration...${NC}"
echo ""
if [ -f "omni-config.yaml" ]; then
    cat omni-config.yaml
    echo -e "${GREEN}MCP Integration configuration loaded successfully${NC}"
else
    echo -e "${RED}MCP configuration file not found: omni-config.yaml${NC}"
fi
echo ""

# 4. Launch Claude Code
echo -e "${YELLOW}4. Starting Claude Code...${NC}"
echo ""
echo -e "${GREEN}Setup completed! Starting Claude Code with MCP Integration...${NC}"
echo ""
echo -e "${BLUE}Available commands:${NC}"
echo "   /use apply_claude_config profileName:\"lum\""
echo "   /use list_claude_configs"  
echo "   /use get_applied_config"
echo ""
echo -e "${BLUE}External MCP Integration:${NC}"
echo "   - Tools from external MCP servers will be prefixed (e.g., 'servername__toolname')"
echo "   - Resources from external servers accessible with server URIs"
echo "   - Edit examples/mcp/omni-config.yaml to add your MCP servers"
echo ""
echo -e "${YELLOW}⚠️  External Server Setup:${NC}"
echo "   - Uncomment and configure external servers in omni-config.yaml"
echo "   - Test server is included for development/testing"
echo "   - Check examples/mcp/README.md for more server configurations"
echo ""

# Kill any existing MCP hub processes
echo -e "${YELLOW}Cleaning up existing MCP processes...${NC}"
pkill -f "dist/index.js" 2>/dev/null || true
pkill -f "test-server.js" 2>/dev/null || true
sleep 1

# Move to examples/mcp directory and launch Claude Code
cd "$(dirname "$0")"
echo -e "${GREEN}Launching Claude Code...${NC}"
exec claude