#!/bin/bash

# Production deployment script for Omni MCP Hub
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Omni MCP Hub Production Deployment${NC}"
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

if [[ ! -f "docker/Dockerfile" ]]; then
    echo -e "${RED}❌ Error: docker/Dockerfile not found${NC}"
    exit 1
fi

# Parse command line arguments
PROFILES=""
DETACHED="-d"
BUILD="--build"
LOGS=""

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
        --foreground)
            DETACHED=""
            shift
            ;;
        --no-build)
            BUILD=""
            shift
            ;;
        --logs)
            LOGS="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --with-postgres    Start with PostgreSQL database"
            echo "  --with-redis      Start with Redis cache"
            echo "  --with-test       Start with test MCP server"
            echo "  --foreground      Run in foreground (don't detach)"
            echo "  --no-build        Skip building images"
            echo "  --logs            Show logs after starting"
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

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose -f docker/docker-compose.yml down --remove-orphans 2>/dev/null || true

# Pull latest images if not building
if [[ -z "$BUILD" ]]; then
    echo -e "${YELLOW}📥 Pulling latest images...${NC}"
    docker-compose -f docker/docker-compose.yml pull
fi

# Start services
echo -e "${YELLOW}🏗️  Starting services...${NC}"
START_CMD="docker-compose -f docker/docker-compose.yml up $DETACHED $BUILD $PROFILES"
echo -e "${BLUE}Running: $START_CMD${NC}"

if $START_CMD; then
    echo -e "${GREEN}✅ Services started successfully!${NC}"
    
    # Show service status
    echo ""
    echo -e "${BLUE}📊 Service Status:${NC}"
    docker-compose -f docker/docker-compose.yml ps
    
    # Show logs if requested
    if [[ -n "$LOGS" ]]; then
        echo ""
        echo -e "${BLUE}📋 Service Logs:${NC}"
        docker-compose -f docker/docker-compose.yml logs --tail=50
    fi
    
    # Show connection information
    echo ""
    echo -e "${GREEN}🎉 Deployment Complete!${NC}"
    echo "=============================="
    echo ""
    echo -e "${BLUE}📡 Service Information:${NC}"
    echo "• Main service: omni-mcp-hub"
    echo "• Health check: docker-compose ps"
    echo "• View logs: docker-compose logs -f omni-mcp-hub"
    echo "• Stop services: docker-compose down"
    
    if [[ "$PROFILES" == *"postgres"* ]]; then
        echo "• PostgreSQL: Available on internal network"
    fi
    
    if [[ "$PROFILES" == *"redis"* ]]; then
        echo "• Redis: Available on internal network"
    fi
    
    if [[ "$PROFILES" == *"test"* ]]; then
        echo "• Test MCP Server: Available for proxy testing"
    fi
    
    echo ""
    echo -e "${YELLOW}💡 Useful Commands:${NC}"
    echo "  docker-compose -f docker/docker-compose.yml logs -f omni-mcp-hub  # Follow logs"
    echo "  docker-compose -f docker/docker-compose.yml exec omni-mcp-hub sh  # Access container"
    echo "  docker-compose -f docker/docker-compose.yml restart omni-mcp-hub  # Restart service"
    echo "  docker-compose -f docker/docker-compose.yml down                  # Stop all services"
    
else
    echo -e "${RED}❌ Failed to start services${NC}"
    echo ""
    echo "Checking for issues..."
    docker-compose -f docker/docker-compose.yml ps
    echo ""
    echo "Recent logs:"
    docker-compose -f docker/docker-compose.yml logs --tail=20
    exit 1
fi