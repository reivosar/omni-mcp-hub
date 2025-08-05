#!/bin/bash

# Docker Unified Mode Startup Script
# Usage: ./start-unified.sh [github_sources|local_sources|mcp_servers] [sse|stdio|unified]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SOURCE_TYPE="${1:-local_sources}"
MCP_MODE="${2:-sse}"

echo -e "${BLUE}🐳 Omni MCP Hub - Unified Docker Deployment${NC}"
echo -e "${BLUE}Source Type: ${SOURCE_TYPE}${NC}"
echo -e "${BLUE}MCP Mode: ${MCP_MODE}${NC}"
echo ""

# Validate source type
if [[ ! "$SOURCE_TYPE" =~ ^(github_sources|local_sources|mcp_servers)$ ]]; then
    echo -e "${RED}❌ Invalid source type: $SOURCE_TYPE${NC}"
    echo -e "${YELLOW}Usage: $0 [github_sources|local_sources|mcp_servers] [sse|stdio|unified]${NC}"
    exit 1
fi

# Validate MCP mode
if [[ ! "$MCP_MODE" =~ ^(sse|stdio|unified)$ ]]; then
    echo -e "${RED}❌ Invalid MCP mode: $MCP_MODE${NC}"
    echo -e "${YELLOW}Usage: $0 [github_sources|local_sources|mcp_servers] [sse|stdio|unified]${NC}"
    exit 1
fi

# Setup configuration (reuse existing logic from start.sh)
CONFIG_PATH="$SCRIPT_DIR/$SOURCE_TYPE/mcp-sources.yaml"

if [ ! -f "$CONFIG_PATH" ]; then
    echo -e "${RED}Error: Configuration file not found: $CONFIG_PATH${NC}"
    exit 1
fi

# Create dist directory for configuration
DIST_DIR="$SCRIPT_DIR/dist"
mkdir -p "$DIST_DIR"

# Copy the selected configuration file to dist directory
echo -e "${BLUE}Setting up Docker configuration...${NC}"
DIST_CONFIG="$DIST_DIR/current-config.yaml"
cp "$CONFIG_PATH" "$DIST_CONFIG"

# Create .env file with unified configuration
ENV_FILE="$SCRIPT_DIR/.env"
cat > "$ENV_FILE" << EOF
# Omni MCP Hub Unified Docker Configuration
# Source Type: $SOURCE_TYPE
# MCP Mode: $MCP_MODE

# Server Configuration
PORT=3000
NODE_ENV=production
SOURCE_TYPE=$SOURCE_TYPE
MCP_MODE=$MCP_MODE

EOF

# Add source-specific environment variables
case "$SOURCE_TYPE" in
    "github_sources")
        cat >> "$ENV_FILE" << EOF
# GitHub Configuration (Required)
GITHUB_TOKEN=your_github_token_here

EOF
        ;;
    "local_sources")
        cat >> "$ENV_FILE" << EOF
# Local Sources Configuration
PROJECTS_PATH=./dist/data/projects
DOCS_PATH=./dist/data/docs
WORKSPACE_PATH=./dist/data/workspace

EOF
        ;;
    "mcp_servers")
        cat >> "$ENV_FILE" << EOF
# MCP Servers Configuration
ARXIV_API_KEY=optional_arxiv_key
ALLOWED_PATHS=/tmp,/var/tmp
DATABASE_PATH=./dist/data/data.db
GIT_USER_NAME=Claude
GIT_USER_EMAIL=claude@anthropic.com

EOF
        ;;
esac

echo -e "${GREEN}Configuration ready in: $SCRIPT_DIR${NC}"
echo -e "${YELLOW}Edit $ENV_FILE to customize settings${NC}"

# Build Docker image
echo -e "${BLUE}Building Docker image...${NC}"
cd "$PROJECT_ROOT"
docker build -t docker-config-omni-mcp-hub:latest .

# Start appropriate service based on mode
echo -e "${BLUE}Starting Docker containers with $SOURCE_TYPE configuration in $MCP_MODE mode...${NC}"

cd "$SCRIPT_DIR"

# Stop any existing containers
echo -e "${YELLOW}Stopping existing containers...${NC}"
docker-compose -f docker-compose.unified.yml down 2>/dev/null || true

# Start the appropriate service
echo -e "${GREEN}Starting containers...${NC}"
case "$MCP_MODE" in
    "sse")
        docker-compose -f docker-compose.unified.yml up -d omni-mcp-hub-sse
        ;;
    "stdio")
        docker-compose -f docker-compose.unified.yml up -d omni-mcp-hub-stdio
        ;;
    "unified")
        docker-compose -f docker-compose.unified.yml up -d omni-mcp-hub-unified
        ;;
esac

echo ""
echo -e "${GREEN}✅ Docker containers started successfully!${NC}"
echo ""

# Show container status
echo -e "${BLUE}Container status:${NC}"
docker ps --filter "name=omni-mcp-hub" --format "table {{.Names}}\t{{.Image}}\t{{.Command}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo -e "${BLUE}View logs:${NC}"
echo -e "  ${YELLOW}docker-compose -f docker-compose.unified.yml logs -f${NC}"

echo ""
echo -e "${BLUE}Configuration:${NC}"
echo -e "  ${YELLOW}Source type: $SOURCE_TYPE${NC}"
echo -e "  ${YELLOW}MCP mode: $MCP_MODE${NC}"
echo -e "  ${YELLOW}Config file: $CONFIG_PATH${NC}"
echo -e "  ${YELLOW}Environment: $ENV_FILE${NC}"

if [[ "$MCP_MODE" == "sse" || "$MCP_MODE" == "unified" ]]; then
    echo ""
    echo -e "${BLUE}Access the server:${NC}"
    echo -e "  ${YELLOW}HTTP: http://localhost:3000${NC}"
    if [[ "$MCP_MODE" == "sse" ]]; then
        echo -e "  ${YELLOW}SSE: http://localhost:3000/sse${NC}"
    fi
fi

if [[ "$MCP_MODE" == "stdio" ]]; then
    echo ""
    echo -e "${BLUE}Stdio mode:${NC}"
    echo -e "  ${YELLOW}Use with Claude Code or other MCP clients via stdio${NC}"
    echo -e "  ${YELLOW}docker exec -i omni-mcp-hub-stdio-$SOURCE_TYPE node dist/servers/server.js${NC}"
fi

if [[ "$MCP_MODE" == "unified" ]]; then
    echo ""
    echo -e "${BLUE}Unified mode:${NC}"
    echo -e "  ${YELLOW}SSE: http://localhost:3000/sse${NC}"
    echo -e "  ${YELLOW}Stdio: docker exec -i omni-mcp-hub-unified-$SOURCE_TYPE node dist/servers/server.js${NC}"
fi