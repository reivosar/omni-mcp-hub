#!/bin/bash

# Omni MCP Hub - Serena Semantic Code Editing Setup
# Usage: ./examples/serena/start.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo -e "${BLUE}Omni MCP Hub - Serena Semantic Code Editing Setup${NC}"
echo ""

# 1. Build
echo -e "${YELLOW}1. Building Omni MCP Hub...${NC}"
cd "$PROJECT_DIR"
npm run build
cd - > /dev/null
echo -e "${GREEN}Build completed${NC}"
echo ""

# 2. Claude Code MCP Configuration
echo -e "${YELLOW}2. Setting up Claude Code MCP Configuration...${NC}"

# Get absolute paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_PATH="$SCRIPT_DIR/omni-config.yaml"
INDEX_PATH="$PROJECT_ROOT/dist/index.js"

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

index_path = '$INDEX_PATH'
omni_config_path = '$CONFIG_PATH'

config['mcpServers']['omni-mcp-hub'] = {
    'command': 'node',
    'args': [index_path],
    'env': {
        'OMNI_CONFIG_PATH': omni_config_path
    },
    'description': 'Omni MCP Hub - Serena Integration'
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
        "$INDEX_PATH"
      ],
      "env": {
        "OMNI_CONFIG_PATH": "$CONFIG_PATH"
      },
      "description": "Omni MCP Hub - Serena Integration"
    }
  }
}
EOF
fi

echo -e "${GREEN}MCP configuration updated in .claude${NC}"
echo "  - Index path: $INDEX_PATH"
echo "  - Config path: $CONFIG_PATH"
echo ""

# 3. Display configuration
echo -e "${YELLOW}3. Displaying Serena configuration...${NC}"
echo ""
if [ -f "omni-config.yaml" ]; then
    echo -e "${BLUE}Active servers:${NC}"
    grep -A 3 "name: \"serena\"" omni-config.yaml | sed 's/^/  /'
    echo ""
    echo -e "${GREEN}Serena configuration loaded successfully${NC}"
else
    echo -e "${RED}Configuration file not found: omni-config.yaml${NC}"
fi
echo ""

# 4. Launch Claude Code
echo -e "${YELLOW}4. Starting Claude Code with Serena...${NC}"
echo ""
echo -e "${GREEN}Setup completed! Starting Claude Code with Serena integration...${NC}"
echo ""
echo -e "${BLUE}Serena Semantic Tools:${NC}"
echo "   /use serena__find_symbol - Find symbol definitions"
echo "   /use serena__find_referencing_symbols - Find all references"
echo "   /use serena__insert_after_symbol - Insert code after symbol"
echo "   /use serena__replace_symbol - Replace symbol semantically"
echo "   /use serena__get_symbol_info - Get symbol information"
echo ""
echo -e "${BLUE}Example Usage:${NC}"
echo "   /use serena__find_symbol className:\"UserController\""
echo "   /use serena__find_referencing_symbols symbol:\"getUserById\""
echo "   /use serena__insert_after_symbol symbol:\"constructor\" code:\"// New code\""
echo ""
echo -e "${YELLOW}Optional Semantic Tools:${NC}"
echo "   - Uncomment servers in omni-config.yaml to enable:"
echo "     • codebase - Whole codebase search"
echo "     • desktop-commander - Desktop automation"
echo "     • sourcegraph - Code intelligence"
echo "     • codemcp - Advanced code analysis"
echo "     • tree-sitter - Syntax tree analysis"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "   - Serena: https://github.com/oraios/serena"
echo "   - README: examples/serena/README.md"
echo ""

# Note: Not killing existing processes to allow MCP server to persist

# Move to examples/serena directory and launch Claude Code
cd "$(dirname "$0")"
echo -e "${GREEN}Launching Claude Code with Serena...${NC}"
exec claude --mcp-config .claude