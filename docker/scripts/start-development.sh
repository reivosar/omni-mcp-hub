#!/bin/bash

# Development environment script for Omni MCP Hub
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛠️  Starting Omni MCP Hub Development Environment${NC}"
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    echo "Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Error: docker-compose is not installed${NC}"
    echo "Please install docker-compose and try again."
    exit 1
fi

# Navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}📂 Working directory: ${PWD}${NC}"

# Check if required files exist
if [[ ! -f "docker/docker-compose.yml" ]]; then
    echo -e "${RED}❌ Error: docker/docker-compose.yml not found${NC}"
    exit 1
fi

if [[ ! -f "package.json" ]]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    exit 1
fi

# Parse command line arguments
PROFILES="--profile dev"
SERVICES="omni-mcp-hub-dev"
REBUILD=""
LOGS=""
SHELL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --with-postgres)
            PROFILES="$PROFILES --profile postgres"
            shift
            ;;
        --with-redis)
            PROFILES="$PROFILES --profile redis"
            shift
            ;;
        --with-test)
            PROFILES="$PROFILES --profile test"
            shift
            ;;
        --rebuild)
            REBUILD="--build"
            shift
            ;;
        --logs)
            LOGS="true"
            shift
            ;;
        --shell)
            SHELL="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --with-postgres    Start with PostgreSQL database"
            echo "  --with-redis      Start with Redis cache"
            echo "  --with-test       Start with test MCP server"
            echo "  --rebuild         Rebuild development image"
            echo "  --logs            Show logs after starting"
            echo "  --shell           Open shell in development container"
            echo "  --help            Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Stop existing development containers
echo -e "${YELLOW}🛑 Stopping existing development containers...${NC}"
docker-compose -f docker/docker-compose.yml --profile dev down --remove-orphans 2>/dev/null || true

# Install dependencies if node_modules doesn't exist
if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Build development image if requested
if [[ -n "$REBUILD" ]]; then
    echo -e "${YELLOW}🏗️  Rebuilding development image...${NC}"
    docker-compose -f docker/docker-compose.yml build omni-mcp-hub-dev
fi

# Start development services
echo -e "${YELLOW}🚀 Starting development environment...${NC}"
START_CMD="docker-compose -f docker/docker-compose.yml $PROFILES up $REBUILD"
echo -e "${BLUE}Running: $START_CMD${NC}"

if [[ -n "$SHELL" ]]; then
    # Start in background and then open shell
    echo -e "${YELLOW}🔧 Starting services in background...${NC}"
    docker-compose -f docker/docker-compose.yml $PROFILES up -d $REBUILD
    
    echo -e "${BLUE}📝 Opening development shell...${NC}"
    echo "You are now in the development container."
    echo "Available commands:"
    echo "  npm run dev     # Start development server"
    echo "  npm test        # Run tests"
    echo "  npm run build   # Build project"
    echo "  exit            # Exit container shell"
    echo ""
    
    docker-compose -f docker/docker-compose.yml exec omni-mcp-hub-dev sh
    
else
    # Start normally
    if $START_CMD; then
        echo -e "${GREEN}✅ Development environment started successfully!${NC}"
        
        # Show service status
        echo ""
        echo -e "${BLUE}📊 Service Status:${NC}"
        docker-compose -f docker/docker-compose.yml ps
        
        # Show logs if requested
        if [[ -n "$LOGS" ]]; then
            echo ""
            echo -e "${BLUE}📋 Development Logs:${NC}"
            docker-compose -f docker/docker-compose.yml logs --tail=50 omni-mcp-hub-dev
        fi
        
        echo ""
        echo -e "${GREEN}🎉 Development Environment Ready!${NC}"
        echo "======================================"
        echo ""
        echo -e "${BLUE}📡 Development Information:${NC}"
        echo "• Service: omni-mcp-hub-dev (with hot reload)"
        echo "• Source code: Mounted from $(pwd)"
        echo "• Node modules: Cached in container volume"
        echo "• Logs: docker-compose logs -f omni-mcp-hub-dev"
        
        if [[ "$PROFILES" == *"postgres"* ]]; then
            echo "• PostgreSQL: Available for development"
        fi
        
        if [[ "$PROFILES" == *"redis"* ]]; then
            echo "• Redis: Available for development"
        fi
        
        echo ""
        echo -e "${YELLOW}💡 Development Commands:${NC}"
        echo "  docker-compose -f docker/docker-compose.yml exec omni-mcp-hub-dev npm test    # Run tests"
        echo "  docker-compose -f docker/docker-compose.yml exec omni-mcp-hub-dev npm run build  # Build"
        echo "  docker-compose -f docker/docker-compose.yml exec omni-mcp-hub-dev sh         # Open shell"
        echo "  docker-compose -f docker/docker-compose.yml restart omni-mcp-hub-dev         # Restart dev server"
        echo "  docker-compose -f docker/docker-compose.yml --profile dev down               # Stop development"
        
        echo ""
        echo -e "${BLUE}🔄 Hot Reload:${NC} File changes will automatically restart the server"
        echo -e "${BLUE}📝 Access Shell:${NC} Use --shell flag or the exec command above"
        
    else
        echo -e "${RED}❌ Failed to start development environment${NC}"
        echo ""
        echo "Checking for issues..."
        docker-compose -f docker/docker-compose.yml ps
        echo ""
        echo "Recent logs:"
        docker-compose -f docker/docker-compose.yml logs --tail=20 omni-mcp-hub-dev
        exit 1
    fi
fi