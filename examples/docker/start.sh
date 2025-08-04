#!/bin/bash

# Docker Deployment Startup Script
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
    echo -e "${BLUE}Checking Docker dependencies...${NC}"
    
    # Check if we're in the right directory
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        echo -e "${RED}Error: Not in omni-mcp-hub project root${NC}"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        echo -e "${YELLOW}Install Docker: https://docs.docker.com/get-docker/${NC}"
        exit 1
    fi
    
    # Check docker-compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}Error: Docker Compose is not installed${NC}"
        echo -e "${YELLOW}Install Docker Compose: https://docs.docker.com/compose/install/${NC}"
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        echo -e "${RED}Error: Docker daemon is not running${NC}"
        echo -e "${YELLOW}Start Docker and try again${NC}"
        exit 1
    fi
}

setup_docker_config() {
    local source_type="$1"
    local config_path="$SCRIPT_DIR/$source_type/mcp-sources.yaml"
    
    if [ ! -f "$config_path" ]; then
        echo -e "${RED}Error: Configuration file not found: $config_path${NC}"
        exit 1
    fi
    
    # Create Docker configuration directory
    local docker_config_dir="$PROJECT_ROOT/.docker-config"
    mkdir -p "$docker_config_dir"
    
    # Copy configuration for Docker
    echo -e "${BLUE}Setting up Docker configuration...${NC}"
    cp "$config_path" "$docker_config_dir/mcp-sources.yaml"
    
    # Create docker-compose.yml if it doesn't exist
    local compose_file="$docker_config_dir/docker-compose.yml"
    if [ ! -f "$compose_file" ]; then
        cat > "$compose_file" << EOF
version: '3.8'

services:
  omni-mcp-hub:
    image: docker-config-omni-mcp-hub:latest
    container_name: omni-mcp-hub
    ports:
      - "\${PORT:-3000}:\${PORT:-3000}"
    volumes:
      - "$docker_config_dir/mcp-sources.yaml:/app/mcp-sources.yaml:ro"
      - "\${PROJECTS_PATH:-./data}:/workspace:ro"
    environment:
      - NODE_ENV=production
      - CONFIG_FILE=/app/mcp-sources.yaml
      - PORT=\${PORT:-3000}
      - GITHUB_TOKEN=\${GITHUB_TOKEN:-}
      - PROJECTS_PATH=\${PROJECTS_PATH:-/workspace}
      - DOCS_PATH=\${DOCS_PATH:-/workspace/docs}
      - WORKSPACE_PATH=\${WORKSPACE_PATH:-/workspace}
      - ARXIV_API_KEY=\${ARXIV_API_KEY:-}
      - ALLOWED_PATHS=\${ALLOWED_PATHS:-/tmp,/var/tmp}
      - DATABASE_PATH=\${DATABASE_PATH:-./data.db}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:\${PORT:-3000}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

networks:
  default:
    name: omni-mcp-hub-network
EOF
        echo -e "${GREEN}Created docker-compose.yml${NC}"
    fi
    
    # Create .env file with source-specific defaults
    local env_file="$docker_config_dir/.env"
    cat > "$env_file" << EOF
# Omni MCP Hub Docker Configuration
# Source Type: $source_type

# Server Configuration
PORT=3000
NODE_ENV=production

EOF

    case "$source_type" in
        "github_sources")
            cat >> "$env_file" << EOF
# GitHub Configuration (Required)
GITHUB_TOKEN=your_github_token_here

# Optional: Override default port
# PORT=3001
EOF
            ;;
        "local_sources")
            cat >> "$env_file" << EOF
# Local Sources Configuration
PROJECTS_PATH=./data/projects
DOCS_PATH=./data/docs
WORKSPACE_PATH=./data/workspace

# Create these directories if they don't exist
EOF
            # Create local data directories
            mkdir -p "$docker_config_dir/data/projects"
            mkdir -p "$docker_config_dir/data/docs"  
            mkdir -p "$docker_config_dir/data/workspace"
            ;;
        "mcp_servers")
            cat >> "$env_file" << EOF
# MCP Servers Configuration
ARXIV_API_KEY=optional_arxiv_key
ALLOWED_PATHS=/tmp,/var/tmp
DATABASE_PATH=./data/data.db
GIT_USER_NAME=Claude
GIT_USER_EMAIL=claude@anthropic.com

# Create data directory for SQLite
EOF
            mkdir -p "$docker_config_dir/data"
            ;;
    esac
    
    echo -e "${GREEN}Configuration copied to: $docker_config_dir/${NC}"
    echo -e "${YELLOW}Edit $env_file to customize settings${NC}"
}

setup_environment() {
    local source_type="$1"
    
    echo -e "${BLUE}Environment setup for $source_type:${NC}"
    
    case "$source_type" in
        "github_sources")
            echo -e "${YELLOW}Required environment variables:${NC}"
            echo -e "  Edit .docker-config/.env and set:"
            echo -e "  GITHUB_TOKEN=\"your_github_token_here\""
            echo ""
            echo -e "${YELLOW}To get a GitHub token:${NC}"
            echo -e "  1. Go to https://github.com/settings/tokens"
            echo -e "  2. Generate new token (classic)"
            echo -e "  3. Select 'public_repo' scope"
            ;;
        "local_sources")
            echo -e "${YELLOW}Local filesystem access:${NC}"
            echo -e "  - Host directories are mounted to /workspace in container"
            echo -e "  - Edit .docker-config/.env to change PROJECTS_PATH, DOCS_PATH"
            echo -e "  - Default: ./data/* directories"
            ;;
        "mcp_servers")
            echo -e "${YELLOW}MCP servers configuration:${NC}"
            echo -e "  - All MCP servers run inside the container"
            echo -e "  - Optional: Set ARXIV_API_KEY for research papers"
            echo -e "  - Database stored in ./data/data.db"
            ;;
    esac
    echo ""
}

build_project() {
    echo -e "${BLUE}Building Docker image...${NC}"
    cd "$PROJECT_ROOT"
    
    # Use existing Dockerfile
    
    # Build the image
    docker build -t docker-config-omni-mcp-hub:latest .
}

start_containers() {
    local source_type="$1"
    local docker_config_dir="$PROJECT_ROOT/.docker-config"
    
    echo -e "${BLUE}Starting Docker containers with $source_type configuration...${NC}"
    
    cd "$docker_config_dir"
    
    # Stop existing containers
    if docker-compose ps -q > /dev/null 2>&1; then
        echo -e "${YELLOW}Stopping existing containers...${NC}"
        docker-compose down
    fi
    
    # Start containers
    echo -e "${GREEN}Starting containers...${NC}"
    docker-compose up -d
    
    # Show status
    echo ""
    echo -e "${GREEN}✅ Docker containers started successfully!${NC}"
    echo ""
    echo -e "${BLUE}Container status:${NC}"
    docker-compose ps
    echo ""
    echo -e "${BLUE}View logs:${NC}"
    echo -e "  ${YELLOW}docker-compose logs -f${NC}"
    echo ""
    echo -e "${BLUE}Configuration:${NC}"
    echo -e "  ${YELLOW}Source type: $source_type${NC}"
    echo -e "  ${YELLOW}Config file: $docker_config_dir/mcp-sources.yaml${NC}"
    echo -e "  ${YELLOW}Environment: $docker_config_dir/.env${NC}"
    echo ""
    echo -e "${BLUE}Access the server:${NC}"
    echo -e "  ${YELLOW}HTTP: http://localhost:3000${NC}"
    echo -e "  ${YELLOW}Health: http://localhost:3000/health${NC}"
    echo ""
    echo -e "${BLUE}Setting up Claude Desktop integration...${NC}"
    setup_claude_desktop_integration
    
    echo -e "${BLUE}To use with Claude Desktop:${NC}"
    echo -e "  1. Restart Claude Desktop application"
    echo -e "  2. The MCP server will connect automatically"
    echo -e "  3. Access aggregated content through Claude's interface"
}

setup_claude_desktop_integration() {
    echo -e "${BLUE}Setting up Claude Desktop integration...${NC}"
    
    # Claude Desktop MCP configuration directory
    local claude_config_dir="$HOME/.config/claude-desktop"
    local claude_mcp_config="$claude_config_dir/claude_desktop_config.json"
    
    # Create Claude Desktop config directory if it doesn't exist
    mkdir -p "$claude_config_dir"
    
    # Create or update Claude Desktop MCP configuration
    if [ ! -f "$claude_mcp_config" ]; then
        cat > "$claude_mcp_config" << EOF
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "node",
      "args": ["$PROJECT_ROOT/dist/servers/server.js"],
      "env": {
        "NODE_ENV": "production",
        "CONFIG_FILE": "$PROJECT_ROOT/.docker-config/mcp-sources.yaml",
        "PORT": "3000"
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
    
    # Copy configuration to Claude Desktop
    cp "$PROJECT_ROOT/.docker-config/mcp-sources.yaml" "$claude_config_dir/mcp-sources.yaml"
    echo -e "${GREEN}Configuration copied to Claude Desktop directory${NC}"
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
    
    echo -e "${GREEN}🐳 Omni MCP Hub - Docker Deployment${NC}"
    echo -e "${BLUE}Source Type: $source_type${NC}"
    echo ""
    
    check_dependencies
    setup_docker_config "$source_type"
    setup_environment "$source_type"
    build_project
    start_containers "$source_type"
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Shutting down containers...${NC}"; cd "$PROJECT_ROOT/.docker-config" && docker-compose down; exit 0' INT TERM

main "$@"