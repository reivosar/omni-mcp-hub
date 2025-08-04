#!/bin/bash

# Claude Desktop Integration Startup Script
# Usage: ./start.sh [github_sources|local_sources|mcp_servers]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    echo -e "${BLUE}Usage: $0 [source_type]${NC}"
    echo ""
    echo "Available source types:"
    echo -e "  ${GREEN}github_sources${NC}  - Aggregate GitHub repository documentation"
    echo -e "  ${GREEN}local_sources${NC}   - Aggregate local filesystem documentation"  
    echo -e "  ${GREEN}mcp_servers${NC}     - Pure MCP server aggregation"
    echo ""
    echo "Example:"
    echo -e "  ${YELLOW}$0 github_sources${NC}"
    exit 1
}

check_dependencies() {
    echo -e "${BLUE}Checking dependencies...${NC}"
    
    # Check if we're in the right directory
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        echo -e "${RED}Error: Not in omni-mcp-hub project root${NC}"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        exit 1
    fi
    
    # Check npm dependencies
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        echo -e "${YELLOW}Installing npm dependencies...${NC}"
        cd "$PROJECT_ROOT" && npm install
    fi
}

setup_claude_desktop_config() {
    local source_type="$1"
    local config_path="$SCRIPT_DIR/$source_type/mcp-sources.yaml"
    
    if [ ! -f "$config_path" ]; then
        echo -e "${RED}Error: Configuration file not found: $config_path${NC}"
        exit 1
    fi
    
    # Claude Desktop MCP configuration directory
    local claude_config_dir="$HOME/.config/claude-desktop"
    local claude_mcp_config="$claude_config_dir/claude_desktop_config.json"
    
    # Create Claude Desktop config directory if it doesn't exist
    mkdir -p "$claude_config_dir"
    
    # Copy configuration to Claude Desktop
    echo -e "${BLUE}Setting up Claude Desktop integration...${NC}"
    cp "$config_path" "$claude_config_dir/mcp-sources.yaml"
    
    # Create or update Claude Desktop MCP configuration
    if [ ! -f "$claude_mcp_config" ]; then
        cat > "$claude_mcp_config" << EOF
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "node",
      "args": ["$PROJECT_ROOT/dist/servers/server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
EOF
        echo -e "${GREEN}Created Claude Desktop MCP configuration${NC}"
    else
        echo -e "${YELLOW}Claude Desktop MCP configuration already exists${NC}"
        echo -e "${YELLOW}Please manually add omni-mcp-hub server configuration${NC}"
    fi
    
    echo -e "${GREEN}Configuration copied to: $claude_config_dir/mcp-sources.yaml${NC}"
}

setup_environment() {
    local source_type="$1"
    
    echo -e "${BLUE}Environment setup for $source_type:${NC}"
    
    case "$source_type" in
        "github_sources")
            echo -e "${YELLOW}Required environment variables:${NC}"
            echo -e "  export GITHUB_TOKEN=\"your_github_token_here\""
            echo -e "  export PORT=3000"
            echo ""
            echo -e "${YELLOW}To get a GitHub token:${NC}"
            echo -e "  1. Go to https://github.com/settings/tokens"
            echo -e "  2. Generate new token (classic)"
            echo -e "  3. Select 'public_repo' scope"
            ;;
        "local_sources")
            echo -e "${YELLOW}Optional environment variables:${NC}"
            echo -e "  export PROJECTS_PATH=\"/path/to/your/projects\""
            echo -e "  export DOCS_PATH=\"/path/to/your/docs\""
            echo -e "  export WORKSPACE_PATH=\"/path/to/your/workspace\""
            echo -e "  export PORT=3000"
            ;;
        "mcp_servers")
            echo -e "${YELLOW}Optional environment variables:${NC}"
            echo -e "  export ARXIV_API_KEY=\"your_arxiv_key\"  # For research papers"
            echo -e "  export ALLOWED_PATHS=\"/tmp,/var/tmp\"   # For filesystem access"
            echo -e "  export DATABASE_PATH=\"./data.db\"      # For SQLite operations"
            echo -e "  export PORT=3000"
            ;;
    esac
    echo ""
}

build_project() {
    echo -e "${BLUE}Building project...${NC}"
    cd "$PROJECT_ROOT"
    
    if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
        npm run build
    else
        echo -e "${GREEN}Project already built${NC}"
    fi
}

start_server() {
    local source_type="$1"
    
    echo -e "${BLUE}Starting Omni MCP Hub with $source_type configuration...${NC}"
    
    # Set configuration file
    export CONFIG_FILE="$HOME/.config/claude-desktop/mcp-sources.yaml"
    
    cd "$PROJECT_ROOT"
    
    echo -e "${GREEN}Server starting...${NC}"
    echo -e "${YELLOW}Configuration: $source_type${NC}"
    echo -e "${YELLOW}Config file: $CONFIG_FILE${NC}"
    echo ""
    echo -e "${BLUE}To use with Claude Desktop:${NC}"
    echo -e "  1. Restart Claude Desktop application"
    echo -e "  2. The MCP server will start automatically with Claude"
    echo -e "  3. Access aggregated content through Claude's interface"
    echo ""
    echo -e "${YELLOW}Starting in standalone mode for testing...${NC}"
    
    npm start
}

main() {
    local source_type="$1"
    
    if [ -z "$source_type" ]; then
        usage
    fi
    
    # Validate source type
    case "$source_type" in
        "github_sources"|"local_sources"|"mcp_servers")
            ;;
        *)
            echo -e "${RED}Error: Invalid source type '$source_type'${NC}"
            usage
            ;;
    esac
    
    echo -e "${GREEN}🚀 Omni MCP Hub - Claude Desktop Integration${NC}"
    echo -e "${BLUE}Source Type: $source_type${NC}"
    echo ""
    
    check_dependencies
    setup_claude_desktop_config "$source_type"
    setup_environment "$source_type"
    build_project
    start_server "$source_type"
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Shutting down...${NC}"; exit 0' INT TERM

main "$@"