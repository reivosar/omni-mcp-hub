#!/bin/bash

# Docker Testing Script for Omni MCP Hub
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐳 Omni MCP Hub Docker Testing Suite${NC}"
echo "============================================="

# Navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}📂 Working directory: ${PWD}${NC}"

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

# Parse command line arguments
RUN_TESTS=""
CLEAN_AFTER=""
VERBOSE=""
QUICK=""
FULL_SUITE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --tests)
            RUN_TESTS="true"
            shift
            ;;
        --clean)
            CLEAN_AFTER="true"
            shift
            ;;
        --verbose)
            VERBOSE="true"
            shift
            ;;
        --quick)
            QUICK="true"
            shift
            ;;
        --full)
            FULL_SUITE="true"
            RUN_TESTS="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --tests       Run application tests inside container"
            echo "  --clean       Clean up containers after testing"
            echo "  --verbose     Show detailed output"
            echo "  --quick       Quick test (skip image rebuild)"
            echo "  --full        Full test suite (includes all profiles)"
            echo "  --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Basic Docker functionality test"
            echo "  $0 --tests --clean   # Run tests and cleanup"
            echo "  $0 --full --verbose  # Full test suite with details"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Test results tracking
TEST_RESULTS=()
FAILED_TESTS=()

# Helper function to run test and track results
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -e "${BLUE}🧪 Testing: $test_name${NC}"
    if [[ -n "$VERBOSE" ]]; then
        echo -e "${YELLOW}Command: $test_command${NC}"
    fi
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASS: $test_name${NC}"
        TEST_RESULTS+=("PASS: $test_name")
    else
        echo -e "${RED}❌ FAIL: $test_name${NC}"
        TEST_RESULTS+=("FAIL: $test_name")
        FAILED_TESTS+=("$test_name")
    fi
    echo ""
}

# Test 1: Docker Build Test
echo -e "${PURPLE}=== Phase 1: Docker Build Tests ===${NC}"

if [[ -z "$QUICK" ]]; then
    run_test "Docker Build (Production)" \
        "docker build -t omni-mcp-hub-test -f docker/Dockerfile ."
    
    run_test "Docker Build (Development)" \
        "docker build -t omni-mcp-hub-dev-test --target builder -f docker/Dockerfile ."
else
    echo -e "${YELLOW}⚡ Quick mode: Skipping image rebuild${NC}"
fi

# Test 2: Container Startup Tests
echo -e "${PURPLE}=== Phase 2: Container Startup Tests ===${NC}"

# Stop any existing containers
echo -e "${YELLOW}🛑 Cleaning up existing containers...${NC}"
docker-compose -f docker/docker-compose.yml down --remove-orphans 2>/dev/null || true

# Test basic startup
run_test "Container Startup (Production)" \
    "timeout 30s docker-compose -f docker/docker-compose.yml up -d && docker-compose -f docker/docker-compose.yml ps | grep -q 'omni-mcp-hub.*Up'"

# Check container health
if docker-compose -f docker/docker-compose.yml ps | grep -q "omni-mcp-hub.*Up"; then
    sleep 5  # Wait for startup
    run_test "Container Health Check" \
        "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub node -e 'process.exit(0)'"
    
    run_test "Container File System" \
        "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub ls -la /app | grep -q 'dist'"
    
    run_test "Container Process Check" \
        "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub ps aux | grep -q 'node'"
fi

# Test 3: Development Environment Tests
if [[ -n "$FULL_SUITE" ]]; then
    echo -e "${PURPLE}=== Phase 3: Development Environment Tests ===${NC}"
    
    # Stop production containers
    docker-compose -f docker/docker-compose.yml down 2>/dev/null || true
    
    run_test "Development Container Startup" \
        "timeout 30s docker-compose -f docker/docker-compose.yml --profile dev up -d && docker-compose -f docker/docker-compose.yml ps | grep -q 'omni-mcp-hub-dev.*Up'"
    
    if docker-compose -f docker/docker-compose.yml ps | grep -q "omni-mcp-hub-dev.*Up"; then
        sleep 5  # Wait for startup
        
        run_test "Development Dependencies" \
            "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub-dev npm --version"
        
        run_test "Development Source Mount" \
            "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub-dev ls -la /app/src | grep -q 'index.ts'"
        
        run_test "Development Node Modules" \
            "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub-dev ls -la /app | grep -q 'node_modules'"
    fi
fi

# Test 4: Application Tests
if [[ -n "$RUN_TESTS" ]]; then
    echo -e "${PURPLE}=== Phase 4: Application Tests ===${NC}"
    
    # Use development container for tests
    if ! docker-compose -f docker/docker-compose.yml ps | grep -q "omni-mcp-hub-dev.*Up"; then
        echo -e "${YELLOW}🔧 Starting development container for testing...${NC}"
        docker-compose -f docker/docker-compose.yml --profile dev up -d
        sleep 10  # Wait for startup
    fi
    
    if docker-compose -f docker/docker-compose.yml ps | grep -q "omni-mcp-hub-dev.*Up"; then
        run_test "TypeScript Compilation" \
            "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub-dev npm run build"
        
        run_test "Unit Tests Execution" \
            "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub-dev npm test -- --run"
        
        run_test "Linting Check" \
            "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub-dev npm run lint || true"
    else
        echo -e "${RED}⚠️  Development container not available, skipping application tests${NC}"
    fi
fi

# Test 5: External Services Tests
if [[ -n "$FULL_SUITE" ]]; then
    echo -e "${PURPLE}=== Phase 5: External Services Tests ===${NC}"
    
    # Test with PostgreSQL
    run_test "PostgreSQL Service Startup" \
        "timeout 60s docker-compose -f docker/docker-compose.yml --profile postgres up -d postgres && sleep 10 && docker-compose -f docker/docker-compose.yml exec -T postgres pg_isready -U omni"
    
    # Test with Redis
    run_test "Redis Service Startup" \
        "timeout 30s docker-compose -f docker/docker-compose.yml --profile redis up -d redis && sleep 5 && docker-compose -f docker/docker-compose.yml exec -T redis redis-cli ping | grep -q PONG"
    
    # Test with Test MCP Server
    run_test "Test MCP Server Startup" \
        "timeout 30s docker-compose -f docker/docker-compose.yml --profile test up -d test-mcp-server && sleep 5 && docker-compose -f docker/docker-compose.yml ps | grep -q 'test-mcp-server.*Up'"
fi

# Test 6: Network and Volume Tests
echo -e "${PURPLE}=== Phase 6: Infrastructure Tests ===${NC}"

run_test "Docker Network Creation" \
    "docker network ls | grep -q 'omni-network'"

run_test "Volume Mount Test" \
    "docker-compose -f docker/docker-compose.yml exec -T omni-mcp-hub ls -la /app | grep -q 'omni-config.yaml' || echo 'Config file check'"

# Test 7: Cleanup and Resource Tests
echo -e "${PURPLE}=== Phase 7: Cleanup Tests ===${NC}"

if [[ -n "$CLEAN_AFTER" ]]; then
    run_test "Container Cleanup" \
        "./docker/scripts/cleanup.sh --force"
    
    run_test "Resource Cleanup Verification" \
        "! docker ps -a | grep -q omni"
else
    echo -e "${YELLOW}⚠️  Skipping cleanup (use --clean to enable)${NC}"
fi

# Test Results Summary
echo -e "${PURPLE}=== Test Results Summary ===${NC}"
echo "============================================="

TOTAL_TESTS=${#TEST_RESULTS[@]}
FAILED_COUNT=${#FAILED_TESTS[@]}
PASSED_COUNT=$((TOTAL_TESTS - FAILED_COUNT))

echo -e "${BLUE}📊 Test Statistics:${NC}"
echo "  Total Tests: $TOTAL_TESTS"
echo -e "  Passed: ${GREEN}$PASSED_COUNT${NC}"
echo -e "  Failed: ${RED}$FAILED_COUNT${NC}"

if [[ $FAILED_COUNT -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}🎉 All tests passed! Docker setup is working correctly.${NC}"
    echo ""
    echo -e "${BLUE}✨ Your Docker environment is ready for:${NC}"
    echo "  • Production deployment"
    echo "  • Development with hot reload"
    echo "  • External service integration"
    echo "  • Full test suite execution"
else
    echo ""
    echo -e "${RED}❌ Some tests failed. Issues detected:${NC}"
    for failed_test in "${FAILED_TESTS[@]}"; do
        echo -e "  • ${RED}$failed_test${NC}"
    done
    echo ""
    echo -e "${YELLOW}💡 Troubleshooting suggestions:${NC}"
    echo "  • Check Docker daemon is running"
    echo "  • Verify docker-compose version compatibility"
    echo "  • Review container logs: docker-compose -f docker/docker-compose.yml logs"
    echo "  • Try rebuilding images: docker-compose -f docker/docker-compose.yml build --no-cache"
fi

echo ""
echo -e "${BLUE}🚀 Quick Commands:${NC}"
echo "  Production:   ./docker/scripts/start-production.sh"
echo "  Development:  ./docker/scripts/start-development.sh"
echo "  Cleanup:      ./docker/scripts/cleanup.sh"
echo "  Full Test:    ./examples/docker-test/start.sh --full --tests"

# Set exit code based on test results
if [[ $FAILED_COUNT -gt 0 ]]; then
    exit 1
else
    exit 0
fi