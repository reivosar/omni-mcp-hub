#!/bin/bash

# Cleanup script for Omni MCP Hub Docker environment
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧹 Omni MCP Hub Docker Cleanup${NC}"
echo "================================"

# Parse command line arguments
FULL_CLEANUP=""
VOLUMES=""
IMAGES=""
NETWORKS=""
FORCE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --full)
            FULL_CLEANUP="true"
            VOLUMES="true"
            IMAGES="true"
            NETWORKS="true"
            shift
            ;;
        --volumes)
            VOLUMES="true"
            shift
            ;;
        --images)
            IMAGES="true"
            shift
            ;;
        --networks)
            NETWORKS="true"
            shift
            ;;
        --force)
            FORCE="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --full        Full cleanup (containers, volumes, images, networks)"
            echo "  --volumes     Remove volumes (persistent data will be lost!)"
            echo "  --images      Remove built images"
            echo "  --networks    Remove custom networks"
            echo "  --force       Skip confirmation prompts"
            echo "  --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Stop containers only"
            echo "  $0 --volumes          # Stop containers and remove volumes"
            echo "  $0 --full --force     # Complete cleanup without prompts"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}📂 Working directory: ${PWD}${NC}"

# Confirmation for destructive operations
if [[ -n "$VOLUMES" && -z "$FORCE" ]]; then
    echo ""
    echo -e "${YELLOW}⚠️  WARNING: This will remove all persistent data!${NC}"
    echo "This includes:"
    echo "  • Application logs"
    echo "  • Database data (if using --profile postgres)"
    echo "  • Redis data (if using --profile redis)"
    echo ""
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}ℹ️  Cleanup cancelled${NC}"
        exit 0
    fi
fi

# Stop and remove containers
echo -e "${YELLOW}🛑 Stopping and removing containers...${NC}"
docker-compose -f docker/docker-compose.yml down --remove-orphans 2>/dev/null || {
    echo -e "${YELLOW}⚠️  No running containers found or docker-compose not available${NC}"
}

# Stop development profile specifically
docker-compose -f docker/docker-compose.yml --profile dev down --remove-orphans 2>/dev/null || true

# Stop all profiles
docker-compose -f docker/docker-compose.yml --profile postgres --profile redis --profile test --profile dev down --remove-orphans 2>/dev/null || true

# Remove volumes if requested
if [[ -n "$VOLUMES" ]]; then
    echo -e "${YELLOW}🗑️  Removing volumes...${NC}"
    docker-compose -f docker/docker-compose.yml down --volumes 2>/dev/null || true
    
    # Remove named volumes specifically
    VOLUMES_TO_REMOVE=(
        "omni-mcp-hub_omni-logs"
        "omni-mcp-hub_omni-logs-dev"
        "omni-mcp-hub_postgres-data"
        "omni-mcp-hub_redis-data"
    )
    
    for volume in "${VOLUMES_TO_REMOVE[@]}"; do
        if docker volume ls | grep -q "$volume"; then
            echo -e "  • Removing volume: $volume"
            docker volume rm "$volume" 2>/dev/null || echo -e "${YELLOW}    ⚠️  Volume $volume could not be removed${NC}"
        fi
    done
fi

# Remove images if requested
if [[ -n "$IMAGES" ]]; then
    echo -e "${YELLOW}🖼️  Removing built images...${NC}"
    
    # Get image names from docker-compose
    IMAGES_TO_REMOVE=(
        "omni-mcp-hub"
        "omni-mcp-hub:latest"
        "omni-mcp-hub_omni-mcp-hub"
        "omni-mcp-hub_omni-mcp-hub-dev"
        "omni-mcp-hub_test-mcp-server"
    )
    
    for image in "${IMAGES_TO_REMOVE[@]}"; do
        if docker images | grep -q "$image"; then
            echo -e "  • Removing image: $image"
            docker rmi "$image" 2>/dev/null || echo -e "${YELLOW}    ⚠️  Image $image could not be removed${NC}"
        fi
    done
    
    # Remove dangling images
    echo -e "${YELLOW}🧹 Removing dangling images...${NC}"
    docker image prune -f || true
fi

# Remove networks if requested
if [[ -n "$NETWORKS" ]]; then
    echo -e "${YELLOW}🌐 Removing custom networks...${NC}"
    
    NETWORKS_TO_REMOVE=(
        "omni-mcp-hub_omni-network"
    )
    
    for network in "${NETWORKS_TO_REMOVE[@]}"; do
        if docker network ls | grep -q "$network"; then
            echo -e "  • Removing network: $network"
            docker network rm "$network" 2>/dev/null || echo -e "${YELLOW}    ⚠️  Network $network could not be removed${NC}"
        fi
    done
fi

# Clean up any orphaned containers
echo -e "${YELLOW}🔍 Cleaning up orphaned containers...${NC}"
ORPHANED=$(docker ps -a --filter "name=omni" --format "{{.Names}}" 2>/dev/null || true)
if [[ -n "$ORPHANED" ]]; then
    echo "$ORPHANED" | while read -r container; do
        echo -e "  • Removing orphaned container: $container"
        docker rm -f "$container" 2>/dev/null || true
    done
else
    echo -e "  • No orphaned containers found"
fi

# System cleanup
if [[ -n "$FULL_CLEANUP" ]]; then
    echo -e "${YELLOW}🧽 Running Docker system cleanup...${NC}"
    docker system prune -f || true
fi

# Final status
echo ""
echo -e "${GREEN}✅ Cleanup completed successfully!${NC}"
echo "=================================="

# Show remaining Docker resources
echo ""
echo -e "${BLUE}📊 Remaining Docker Resources:${NC}"

echo ""
echo -e "${YELLOW}Containers:${NC}"
CONTAINERS=$(docker ps -a --filter "name=omni" --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || echo "None found")
if [[ "$CONTAINERS" == "None found" ]]; then
    echo "  • No omni-related containers"
else
    echo "$CONTAINERS"
fi

echo ""
echo -e "${YELLOW}Images:${NC}"
IMAGES=$(docker images | grep -E "(omni|mcp)" 2>/dev/null || echo "")
if [[ -z "$IMAGES" ]]; then
    echo "  • No omni/mcp-related images"
else
    echo "$IMAGES"
fi

echo ""
echo -e "${YELLOW}Volumes:${NC}"
VOLUMES=$(docker volume ls | grep -E "(omni|mcp)" 2>/dev/null || echo "")
if [[ -z "$VOLUMES" ]]; then
    echo "  • No omni/mcp-related volumes"
else
    echo "$VOLUMES"
fi

echo ""
echo -e "${YELLOW}Networks:${NC}"
NETWORKS=$(docker network ls | grep -E "(omni|mcp)" 2>/dev/null || echo "")
if [[ -z "$NETWORKS" ]]; then
    echo "  • No omni/mcp-related networks"
else
    echo "$NETWORKS"
fi

echo ""
echo -e "${BLUE}💡 Quick Start Again:${NC}"
echo "  ./docker/scripts/start-production.sh  # Production deployment"
echo "  ./docker/scripts/start-development.sh # Development environment"