#!/bin/bash

# Omni MCP Hub - Setup Script
# Usage: ./examples/start.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "${BLUE}Omni MCP Hub Setup${NC}"
echo ""

cd "$PROJECT_DIR"

# 1. Build
echo -e "${YELLOW}1. Building project...${NC}"
npm run build
echo -e "${GREEN}Build completed${NC}"
echo ""

# 2. Claude Code MCP Configuration
echo -e "${YELLOW}2. Configuring Claude Code...${NC}"
cat > ~/.claude.json << 'EOF'
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "node",
      "args": ["/Users/mac/workspace/omni-mcp-hub/dist/index.js"],
      "description": "Omni MCP Hub - CLAUDE.md configuration manager",
      "env": {}
    }
  }
}
EOF
echo -e "${GREEN}Configuration saved to ~/.claude.json${NC}"
echo ""

# 3. Launch Claude Code
echo -e "${YELLOW}3. Starting Claude Code...${NC}"
echo ""
echo -e "${GREEN}Setup completed! Starting Claude Code...${NC}"
echo ""
echo -e "${BLUE}Available commands:${NC}"
echo "   /use add a:5 b:3"
echo "   /use echo message:\"Hello MCP!\""
echo "   /use load_claude_config filePath:\"./lum-behavior.md\" profileName:\"lum\""
echo "   /use list_claude_configs"
echo ""

# 4. Display YAML configuration file
echo -e "${YELLOW}4. Displaying YAML configuration file...${NC}"
echo ""
if [ -f "./omni-config.yaml" ]; then
    cat ./omni-config.yaml
    echo -e "${GREEN}YAML configuration file loaded successfully${NC}"
else
    echo -e "${RED}YAML configuration file not found: ./omni-config.yaml${NC}"
fi
echo ""

# Launch Claude Code from examples directory
cd "$(dirname "$0")"
exec claude