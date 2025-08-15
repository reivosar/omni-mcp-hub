#!/bin/bash

# Docker Test with Lum-chan Configuration
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
PINK='\033[0;95m'
NC='\033[0m' # No Color

echo -e "${PINK}Lum-chan Docker Test${NC}"
echo "======================================"

# Navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}Working directory: ${PWD}${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running ${NC}"
    echo "Please start Docker and try again."
    exit 1
fi

# Parse command line arguments
INTERACTIVE=""
SHELL_ACCESS=""
VERBOSE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --interactive)
            INTERACTIVE="true"
            shift
            ;;
        --shell)
            SHELL_ACCESS="true"
            shift
            ;;
        --verbose)
            VERBOSE="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --interactive    Interactive mode with Lum-chan"
            echo "  --shell         Access container shell"
            echo "  --verbose       Show detailed output"
            echo "  --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Basic Lum-chan container test"
            echo "  $0 --interactive      # Chat with Lum-chan interactively"
            echo "  $0 --shell --verbose  # Debug mode with shell access"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${PINK}Starting Lum-chan container ${NC}"

# Stop existing containers
echo -e "${YELLOW} Cleaning up existing containers...${NC}"
docker-compose -f docker/docker-compose.yml down --remove-orphans 2>/dev/null || true

# Copy Lum-chan config to project root for Docker access
echo -e "${PINK} Preparing Lum-chan configuration ...${NC}"
cp examples/docker-test/local-resources/omni-config.yaml ./omni-config.yaml

# Build Docker image with Lum-chan files
echo -e "${PINK} Building Lum-chan Docker image ...${NC}"
if [[ -n "$VERBOSE" ]]; then
    docker-compose -f docker/docker-compose.yml build
else
    docker-compose -f docker/docker-compose.yml build > /dev/null 2>&1
fi

# Start Docker container with Lum-chan configuration
echo -e "${PINK} Starting container with Lum-chan powers ${NC}"
if [[ -n "$VERBOSE" ]]; then
    docker-compose -f docker/docker-compose.yml up -d
else
    docker-compose -f docker/docker-compose.yml up -d > /dev/null 2>&1
fi

# Wait for container to be ready
echo -e "${YELLOW} Waiting for Lum-chan to wake up ...${NC}"
sleep 8

# Check if container is running
if ! docker-compose -f docker/docker-compose.yml ps | grep -q "omni-mcp-hub.*Up"; then
    echo -e "${RED} Container failed to start ${NC}"
    echo "Checking logs..."
    docker-compose -f docker/docker-compose.yml logs
    exit 1
fi

echo -e "${GREEN} Lum-chan container is running ${NC}"

# Test Lum-chan configuration
echo -e "${PINK} Testing Lum-chan configuration ...${NC}"

# Test 1: Check if container is healthy
echo -e "${BLUE}Testing container health ...${NC}"
if docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub node -e "process.exit(0)"; then
    echo -e "${GREEN} Container health check passed ${NC}"
else
    echo -e "${RED} Container health check failed ...${NC}"
fi

# Test 2: Check if Lum-chan config is loaded
echo -e "${BLUE}Testing Lum-chan configuration loading ...${NC}"
if docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub ls -la /app | grep -q "omni-config.yaml"; then
    echo -e "${GREEN} Lum-chan config file found ${NC}"
else
    echo -e "${RED} Lum-chan config file missing ...${NC}"
fi

# Test 3: Check if examples are mounted
echo -e "${BLUE}Testing examples directory mount ...${NC}"
if docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub ls -la /app/examples | grep -q "local-resources"; then
    echo -e "${GREEN} Examples directory mounted correctly ${NC}"
else
    echo -e "${RED} Examples directory not found ...${NC}"
fi

# Test 4: Check if Lum-chan behavior file exists
echo -e "${BLUE}Testing Lum-chan behavior file ...${NC}"
if docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub ls -la /app/examples/local-resources | grep -q "lum-behavior.md"; then
    echo -e "${GREEN} Lum-chan behavior file found ${NC}"
    
    # Show a snippet of the Lum-chan config
    echo -e "${PINK} Here's a peek at Lum-chan's personality :${NC}"
    docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub head -n 5 /app/examples/local-resources/lum-behavior.md || true
else
    echo -e "${RED} Lum-chan behavior file missing ${NC}"
fi

# Interactive mode
if [[ -n "$INTERACTIVE" ]]; then
    echo ""
    echo -e "${PINK} Interactive mode with Lum-chan ${NC}"
    echo -e "${YELLOW}Note: This will show how the MCP tools would work with Lum-chan's config${NC}"
    echo ""
    
    # Simulate MCP tool interactions
    echo -e "${BLUE} Simulating MCP tool calls ...${NC}"
    
    echo -e "${PURPLE}Tool: apply_claude_config profileName:\"lum\"${NC}"
    echo -e "${PINK}Response: Successfully loaded Lum-chan configuration ${NC}"
    echo -e "${PINK}Auto-applying profile 'lum'... うちはラム${NC}"
    echo ""
    
    echo -e "${PURPLE}Tool: get_applied_config${NC}"
    echo -e "${PINK}Response: Current profile: lum (Lum-chan AI Assistant)${NC}"
    echo -e "${PINK}Applied at: $(date) ${NC}"
    echo ""
    
    echo -e "${PURPLE}Tool: list_claude_configs${NC}"
    echo -e "${PINK}Response: Available configs:${NC}"
    echo -e "${PINK}  • lum-behavior.md (loaded) - うちの設定${NC}"
    echo -e "${PINK}  • zoro-behavior.md (available)${NC}"
    echo -e "${PINK}  • tsundere-behavior.md (available)${NC}"
    echo ""
fi

# Shell access mode
if [[ -n "$SHELL_ACCESS" ]]; then
    echo ""
    echo -e "${PINK} Opening shell access ${NC}"
    echo -e "${YELLOW}You are now inside Lum-chan's container ${NC}"
    echo "Available commands:"
    echo "  • ls /app/examples/local-resources  # See all behavior files"
    echo "  • cat /app/omni-config.yaml        # View Lum-chan config"
    echo "  • npm test                         # Run tests"
    echo "  • exit                             # Exit container shell"
    echo ""
    
    docker-compose -f docker/docker-compose.yml exec omni-mcp-hub sh
fi

# Show container status
echo ""
echo -e "${BLUE} Container Status :${NC}"
docker-compose -f docker/docker-compose.yml ps

if [[ -n "$VERBOSE" ]]; then
    echo ""
    echo -e "${BLUE} Container Logs :${NC}"
    docker-compose -f docker/docker-compose.yml logs --tail=20 omni-mcp-hub
fi

echo ""
echo -e "${PINK} Lum-chan Docker test completed ${NC}"
echo "======================================"
echo ""
echo -e "${BLUE} Claude Code integration :${NC}"
echo ""
echo -e "${YELLOW}1. Add this to your Claude Code MCP settings:${NC}"
echo ""
cat << 'EOF'
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "docker-compose",
      "args": ["-f", "docker/docker-compose.yml", "exec", "-T", "omni-mcp-hub", "node", "dist/index.js"],
      "cwd": "/Users/mac/workspace/omni-mcp-hub"
    }
  }
}
EOF
echo ""
echo -e "${YELLOW}2. Available MCP tools :${NC}"
echo "  • apply_claude_config - Load Lum-chan personality"
echo "  • list_claude_configs - See all available configs"
echo "  • get_applied_config - Check current personality"
echo ""
echo -e "${YELLOW} Quick commands :${NC}"
echo "  View logs:     docker-compose -f docker/docker-compose.yml logs -f omni-mcp-hub"
echo "  Shell access:  docker-compose -f docker/docker-compose.yml exec omni-mcp-hub sh"
echo "  Stop container: docker-compose -f docker/docker-compose.yml down"
echo "  Restart test:  $0"
echo ""
echo -e "${PINK} Thanks for testing with Lum-chan ${NC}"

# Cleanup config file
rm -rf ./omni-config.yaml

# Launch Claude Code with MCP integration
echo ""
echo -e "${GREEN}Launching Claude Code with Lum-chan MCP integration...${NC}"
claude