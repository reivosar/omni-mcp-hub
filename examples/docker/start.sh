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

# Function to show available source types and let user select
select_source_type() {
    local available_types=()
    
    # Find all directories in the docker examples folder
    for dir in "$SCRIPT_DIR"/*/ ; do
        if [ -d "$dir" ]; then
            local dirname=$(basename "$dir")
            # Skip common directories that aren't source types
            if [[ "$dirname" != "dist" && "$dirname" != "node_modules" && "$dirname" != ".git" ]]; then
                # Check if directory contains mcp-sources.yaml
                if [ -f "$dir/mcp-sources.yaml" ]; then
                    available_types+=("$dirname")
                fi
            fi
        fi
    done
    
    if [ ${#available_types[@]} -eq 0 ]; then
        echo -e "${RED}Error: No configuration directories found with mcp-sources.yaml${NC}" >&2
        exit 1
    fi
    
    echo -e "${BLUE}Available source configurations:${NC}" >&2
    echo "" >&2
    
    for i in "${!available_types[@]}"; do
        local type="${available_types[$i]}"
        local desc=""
        case "$type" in
            *github*) desc="GitHub repositories and documentation" ;;
            *local*) desc="Local filesystem directories" ;;
            *mcp*) desc="MCP server integrations" ;;
            *) desc="Custom configuration" ;;
        esac
        echo -e "  ${GREEN}$((i+1)))${NC} ${YELLOW}$type${NC} - $desc" >&2
    done
    
    echo "" >&2
    echo -n -e "${BLUE}Select configuration (1-${#available_types[@]}): ${NC}" >&2
    read -r selection
    
    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt "${#available_types[@]}" ]; then
        echo -e "${RED}Invalid selection. Please choose a number between 1 and ${#available_types[@]}${NC}" >&2
        exit 1
    fi
    
    local selected_type="${available_types[$((selection-1))]}"
    echo -e "${GREEN}Selected: $selected_type${NC}" >&2
    echo "" >&2
    
    # Return the selected type (this will be captured by the calling code)
    printf "%s" "$selected_type"
}

usage() {
    echo -e "${BLUE}Usage: $0 [source_type]${NC}"
    echo ""
    echo "If no source_type is provided, you will be prompted to select from available configurations."
    echo ""
    echo "Available source types:"
    for dir in "$SCRIPT_DIR"/*/ ; do
        if [ -d "$dir" ] && [ -f "$dir/mcp-sources.yaml" ]; then
            local dirname=$(basename "$dir")
            local desc=""
            case "$dirname" in
                *github*) desc="GitHub repositories and documentation" ;;
                *local*) desc="Local filesystem directories" ;;
                *mcp*) desc="MCP server integrations" ;;
                *) desc="Custom configuration" ;;
            esac
            echo -e "  ${GREEN}$dirname${NC} - $desc"
        fi
    done
    echo ""
    echo "Example:"
    echo -e "  ${YELLOW}$0 github_sources${NC}  # Direct selection"
    echo -e "  ${YELLOW}$0${NC}                 # Interactive selection"
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
    
    # Use examples/docker as the configuration directory
    local docker_config_dir="$SCRIPT_DIR"
    
    # Copy the selected configuration file to dist directory
    echo -e "${BLUE}Setting up Docker configuration...${NC}"
    local dist_config="$dist_docker_dir/current-config.yaml"
    cp "$config_path" "$dist_config"
    
    # Use existing docker-compose.yml in the docker directory
    local compose_file="$docker_config_dir/docker-compose.yml"
    if [ ! -f "$compose_file" ]; then
        echo -e "${RED}Error: docker-compose.yml not found in $docker_config_dir${NC}"
        exit 1
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
PROJECTS_PATH=./dist/data/projects
DOCS_PATH=./dist/data/docs
WORKSPACE_PATH=./dist/data/workspace

# Create these directories if they don't exist
EOF
            # Create local data directories in dist
            mkdir -p "$dist_docker_dir/data/projects"
            mkdir -p "$dist_docker_dir/data/docs"  
            mkdir -p "$dist_docker_dir/data/workspace"
            ;;
        "mcp_servers")
            cat >> "$env_file" << EOF
# MCP Servers Configuration
ARXIV_API_KEY=optional_arxiv_key
ALLOWED_PATHS=/tmp,/var/tmp
DATABASE_PATH=./dist/data/data.db
GIT_USER_NAME=Claude
GIT_USER_EMAIL=claude@anthropic.com

# Create data directory for SQLite
EOF
            mkdir -p "$dist_docker_dir/data"
            ;;
    esac
    
    echo -e "${GREEN}Configuration ready in: $docker_config_dir/${NC}"
    echo -e "${YELLOW}Edit $env_file to customize settings${NC}"
}

setup_environment() {
    local source_type="$1"
    
    echo -e "${BLUE}Environment setup for $source_type:${NC}"
    
    case "$source_type" in
        "github_sources")
            echo -e "${YELLOW}Required environment variables:${NC}"
            echo -e "  Edit examples/docker/.env and set:"
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
            echo -e "  - Edit examples/docker/.env to change PROJECTS_PATH, DOCS_PATH"
            echo -e "  - Default: ./dist/data/* directories"
            ;;
        "mcp_servers")
            echo -e "${YELLOW}MCP servers configuration:${NC}"
            echo -e "  - All MCP servers run inside the container"
            echo -e "  - Optional: Set ARXIV_API_KEY for research papers"
            echo -e "  - Database stored in ./dist/data/data.db"
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
    local docker_config_dir="$SCRIPT_DIR"
    
    echo -e "${BLUE}Starting Docker containers with $source_type configuration...${NC}"
    
    cd "$docker_config_dir"
    
    # Read port from .env file
    local port="3000"
    if [ -f "$docker_config_dir/.env" ]; then
        port=$(grep "^PORT=" "$docker_config_dir/.env" | cut -d'=' -f2)
        port=${port:-3000}
    fi
    
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
    echo -e "  ${YELLOW}Config file: $docker_config_dir/$source_type/mcp-sources.yaml${NC}"
    echo -e "  ${YELLOW}Environment: $docker_config_dir/.env${NC}"
    echo ""
    echo -e "${BLUE}Access the server:${NC}"
    echo -e "  ${YELLOW}HTTP: http://localhost:${port}${NC}"
    echo -e "  ${YELLOW}Health: http://localhost:${port}/health${NC}"
    echo ""
    echo -e "${BLUE}Setting up Claude Code MCP configuration...${NC}"
    
    # Create stdio server wrapper in dist directory
    local dist_docker_dir="$SCRIPT_DIR/dist"
    mkdir -p "$dist_docker_dir"
    local stdio_server="$dist_docker_dir/claude-stdio-server.js"
    if [ ! -f "$stdio_server" ]; then
        cat > "$stdio_server" << 'EOF'
#!/usr/bin/env node

// Claude Code Stdio Server Wrapper
const path = require('path');

// Configuration for the stdio server
const configPath = process.env.CONFIG_FILE || path.join(__dirname, 'current-config.yaml');

// Set environment variables
process.env.CONFIG_FILE = configPath;
process.env.NODE_ENV = 'production';

// Start the stdio server
const serverPath = path.join(__dirname, '../../../dist/servers/claude-code-stdio-server.js');
try {
  require(serverPath);
} catch (error) {
  console.error('Failed to start stdio server:', error);
  process.exit(1);
}
EOF
        chmod +x "$stdio_server"
    fi
    
    echo ""
    echo -e "${BLUE}To register with Claude Code (stdio mode):${NC}"
    echo -e "  ${YELLOW}claude mcp add omni-mcp-hub node $stdio_server${NC}"
    echo ""
    echo -e "${BLUE}To verify registration:${NC}"
    echo -e "  ${YELLOW}claude mcp list${NC}"
    echo ""
    echo -e "${BLUE}To remove (if needed):${NC}"
    echo -e "  ${YELLOW}claude mcp remove omni-mcp-hub${NC}"
}


main() {
    echo -e "${GREEN}🐳 Omni MCP Hub - Docker Deployment${NC}"
    echo ""
    
    local source_type=""
    
    if [ "$#" -eq 0 ]; then
        # Interactive mode - let user select
        source_type=$(select_source_type)
    else
        # Command line argument provided
        source_type="$1"
        
        # Handle help flags
        if [[ "$source_type" == "--help" || "$source_type" == "-h" || "$source_type" == "help" ]]; then
            usage
        fi
        
        # Validate source type
        if [ ! -d "$SCRIPT_DIR/$source_type" ]; then
            echo -e "${RED}Error: Source type '$source_type' not found${NC}"
            echo ""
            echo -e "${YELLOW}Available configurations:${NC}"
            for dir in "$SCRIPT_DIR"/*/ ; do
                if [ -d "$dir" ] && [ -f "$dir/mcp-sources.yaml" ]; then
                    local dirname=$(basename "$dir")
                    echo -e "  - $dirname"
                fi
            done
            exit 1
        fi
        
        if [ ! -f "$SCRIPT_DIR/$source_type/mcp-sources.yaml" ]; then
            echo -e "${RED}Error: Configuration file not found: $SCRIPT_DIR/$source_type/mcp-sources.yaml${NC}"
            exit 1
        fi
    fi
    
    echo -e "${BLUE}Source Type: $source_type${NC}"
    echo ""
    
    check_dependencies
    setup_docker_config "$source_type"
    setup_environment "$source_type"
    build_project
    start_containers "$source_type"
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Shutting down containers...${NC}"; cd "$SCRIPT_DIR" && docker-compose down; exit 0' INT TERM

main "$@"