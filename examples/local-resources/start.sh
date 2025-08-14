#!/bin/bash

# Omni MCP Hub - Local Resources Setup Script
# Usage: ./examples/local-resources/start.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo -e "${BLUE}Omni MCP Hub - Local Resources Setup${NC}"
echo ""

# 1. Build
echo -e "${YELLOW}1. Building project...${NC}"
cd "$PROJECT_DIR"
npm run build
cd - > /dev/null
echo -e "${GREEN}Build completed${NC}"
echo ""

# 2. Claude Code MCP Configuration
echo -e "${YELLOW}2. Setting up MCP Configuration...${NC}"

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
    'args': ['$PROJECT_DIR/dist/index.js'],
    'description': 'Omni MCP Hub - Local Resources focused configuration',
    'env': {
        'OMNI_CONFIG_PATH': './omni-config.yaml'
    }
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
        "$PROJECT_DIR/dist/index.js"
      ],
      "description": "Omni MCP Hub - Local Resources focused configuration",
      "env": {
        "OMNI_CONFIG_PATH": "./omni-config.yaml"
      }
    }
  }
}
EOF
fi

echo -e "${GREEN}MCP configuration updated in .claude${NC}"
echo ""

# 3. Display configuration
echo -e "${YELLOW}3. Displaying Local Resources configuration...${NC}"
echo ""
if [ -f "omni-config.yaml" ]; then
    cat omni-config.yaml
    echo -e "${GREEN}Local Resources configuration loaded successfully${NC}"
else
    echo -e "${RED}Local Resources configuration file not found: omni-config.yaml${NC}"
fi
echo ""

# 4. Launch Claude Code
echo -e "${YELLOW}4. Starting Claude Code...${NC}"
echo ""
echo -e "${GREEN}Setup completed! Starting Claude Code with Local Resources focus...${NC}"
echo ""
echo -e "${BLUE}Available commands:${NC}"
echo "   /use apply_claude_config profileName:\"lum\""
echo "   /use apply_claude_config profileName:\"zoro\""
echo "   /use apply_claude_config profileName:\"tsundere\""
echo "   /use apply_claude_config profileName:\"naruto\""
echo "   /use list_claude_configs"
echo "   /use get_applied_config"
echo ""
echo -e "${BLUE}Character Behaviors Available:${NC}"
echo "   - Lum (Urusei Yatsura) - Auto-applied on startup"
echo "   - Zoro (One Piece) - Direct and disciplined"
echo "   - Tsundere character - Classic anime personality"
echo "   - Naruto (Naruto) - Enthusiastic and determined"
echo ""

# Move to examples/local-resources directory and launch Claude Code
cd "$(dirname "$0")"
exec claude