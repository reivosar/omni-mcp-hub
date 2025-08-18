#!/bin/bash

# Omni MCP Hub - Mixed MCP Servers Setup
# Usage: ./examples/mixed/start.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo -e "${BLUE}Omni MCP Hub - Mixed MCP Servers Setup${NC}"
echo ""

# 1. Build
echo -e "${YELLOW}1. Building Omni MCP Hub...${NC}"
cd "$PROJECT_DIR"
if ! npm run build; then
    echo -e "${RED}Build failed! Exiting.${NC}"
    exit 1
fi
cd - > /dev/null

# Verify dist directory exists
if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
    echo -e "${RED}Build output not found: $PROJECT_DIR/dist/index.js${NC}"
    exit 1
fi

echo -e "${GREEN}Build completed${NC}"
echo ""

# 2. Claude Code MCP Configuration
echo -e "${YELLOW}2. Setting up Claude Code MCP Configuration...${NC}"

MCP_CONFIG=".claude"

if [ -f "$MCP_CONFIG" ]; then
    echo "Updating existing MCP configuration..."
    
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
    'description': 'Omni MCP Hub - Mixed MCP Servers Integration'
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
      "description": "Omni MCP Hub - Mixed MCP Servers Integration"
    }
  }
}
EOF
fi

echo -e "${GREEN}MCP configuration updated in .claude${NC}"
echo ""

# 3. Display configuration
echo -e "${YELLOW}3. Displaying Mixed MCP configuration...${NC}"
echo ""
if [ -f "omni-config.yaml" ]; then
    echo -e "${BLUE}Configured MCP servers:${NC}"
    grep -A 2 "- name:" omni-config.yaml | grep -E "(name:|description:)" | sed 's/^/  /'
    echo ""
    echo -e "${GREEN}Mixed MCP configuration loaded successfully${NC}"
else
    echo -e "${RED}Configuration file not found: omni-config.yaml${NC}"
fi
echo ""

# 4. Launch Claude Code
echo -e "${YELLOW}4. Starting Claude Code with Mixed MCP servers...${NC}"
echo ""
echo -e "${GREEN}Setup completed! Starting Claude Code with flexible MCP integration...${NC}"
echo ""
echo -e "${BLUE}Available Tool Categories:${NC}"
echo "   • Semantic Code Tools (Serena) - Symbol finding, code insertion"
echo "   • Codebase Analysis - Repository search and analysis"  
echo "   • Desktop Automation - System control and automation"
echo "   • Code Intelligence - Cross-repository insights"
echo "   • Custom Tools - Add your own MCP servers"
echo ""
echo -e "${BLUE}Example Usage:${NC}"
echo "   /use serena__find_symbol className:\"UserController\""
echo "   /use codebase__search pattern:\"function.*login\""
echo "   /use desktop__open_application name:\"VS Code\""
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "   • Edit omni-config.yaml to enable/disable servers"
echo "   • Uncomment servers you want to use"
echo "   • Add custom MCP servers as needed"
echo ""
# Launch Claude Code with mixed MCP configuration
cd "$(dirname "$0")"
echo -e "${GREEN}Launching Claude Code with Mixed MCP servers...${NC}"
exec claude --mcp-config .claude