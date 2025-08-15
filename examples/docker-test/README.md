# Docker Testing Suite

Comprehensive testing framework for Omni MCP Hub Docker containerization.

## Quick Start

```bash
# Basic Docker functionality test
./examples/docker-test/start.sh

# Full test suite with application tests
./examples/docker-test/start.sh --full --tests --clean

# Quick test (skip rebuild)
./examples/docker-test/start.sh --quick --verbose

# Test with Lum-chan configuration (推奨！)
./examples/docker-test/test-lum.sh --interactive --verbose
```

## Test Options

### Basic Options
- `--tests` - Run application tests inside container
- `--clean` - Clean up containers after testing
- `--verbose` - Show detailed output
- `--quick` - Skip image rebuild (faster testing)
- `--full` - Complete test suite with all profiles

### Usage Examples

```bash
# Development workflow testing
./examples/docker-test/start.sh --tests

# Production deployment testing
./examples/docker-test/start.sh --verbose

# Complete integration testing
./examples/docker-test/start.sh --full --tests --clean --verbose

# Quick smoke test
./examples/docker-test/start.sh --quick

# Lum-chan specific testing (キャラクター設定テスト)
./examples/docker-test/test-lum.sh --interactive    # Interactive mode
./examples/docker-test/test-lum.sh --shell         # Shell access
./examples/docker-test/test-lum.sh --verbose       # Detailed output
```

## Test Phases

### Phase 1: Docker Build Tests
- ✅ Production image build
- ✅ Development image build
- ✅ Multi-stage build verification

### Phase 2: Container Startup Tests
- ✅ Production container startup
- ✅ Container health checks
- ✅ File system verification
- ✅ Process validation

### Phase 3: Development Environment Tests
- ✅ Development container startup
- ✅ Hot reload functionality
- ✅ Source code mounting
- ✅ Development dependencies

### Phase 4: Application Tests
- ✅ TypeScript compilation
- ✅ Unit test execution
- ✅ Linting verification
- ✅ Build process validation

### Phase 5: External Services Tests
- ✅ PostgreSQL integration
- ✅ Redis connectivity
- ✅ Test MCP server functionality
- ✅ Service orchestration

### Phase 6: Infrastructure Tests
- ✅ Docker network creation
- ✅ Volume mounting
- ✅ Configuration management
- ✅ Resource allocation

### Phase 7: Cleanup Tests
- ✅ Container cleanup
- ✅ Resource cleanup verification
- ✅ Network cleanup
- ✅ Volume cleanup

## Test Results

The script provides comprehensive feedback:

```
🧪 Testing: Container Startup (Production)
✅ PASS: Container Startup (Production)

🧪 Testing: Container Health Check
✅ PASS: Container Health Check

📊 Test Statistics:
  Total Tests: 15
  Passed: 15
  Failed: 0

🎉 All tests passed! Docker setup is working correctly.
```

## Troubleshooting

### Common Issues

1. **Docker Not Running**
   ```bash
   # Start Docker daemon
   # macOS: Open Docker Desktop
   # Linux: sudo systemctl start docker
   ```

2. **Permission Errors**
   ```bash
   # Fix script permissions
   chmod +x examples/docker-test/start.sh
   
   # Fix Docker permissions (Linux)
   sudo usermod -aG docker $USER
   ```

3. **Port Conflicts**
   ```bash
   # Check for port usage
   lsof -i :3000
   
   # Stop conflicting containers
   docker-compose -f docker/docker-compose.yml down
   ```

4. **Build Failures**
   ```bash
   # Clean rebuild
   docker system prune -f
   ./examples/docker-test/start.sh --verbose
   ```

### Debug Commands

```bash
# View container logs
docker-compose -f docker/docker-compose.yml logs omni-mcp-hub

# Access container shell
docker-compose -f docker/docker-compose.yml exec omni-mcp-hub sh

# Check container status
docker-compose -f docker/docker-compose.yml ps

# Monitor resources
docker stats
```

## Continuous Integration

This test suite can be integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run Docker Tests
  run: |
    chmod +x examples/docker-test/start.sh
    ./examples/docker-test/start.sh --full --tests --clean

# GitLab CI example
test_docker:
  script:
    - chmod +x examples/docker-test/start.sh
    - ./examples/docker-test/start.sh --full --tests --clean
```

## Performance Testing

```bash
# Quick smoke test (30 seconds)
./examples/docker-test/start.sh --quick

# Full integration test (5-10 minutes)
./examples/docker-test/start.sh --full --tests

# Production deployment test (2-3 minutes)
./examples/docker-test/start.sh --verbose --clean
```

## Development Workflow

1. **Code Changes**
   ```bash
   # Quick test after changes
   ./examples/docker-test/start.sh --quick --tests
   ```

2. **Pre-commit Testing**
   ```bash
   # Comprehensive test before commit
   ./examples/docker-test/start.sh --full --tests --clean
   ```

3. **Release Testing**
   ```bash
   # Full production readiness test
   ./examples/docker-test/start.sh --full --verbose
   ```

## Environment Verification

The test suite verifies:
- ✅ Docker 20.10+ compatibility
- ✅ docker-compose 2.0+ support
- ✅ Node.js 22 LTS functionality
- ✅ Alpine Linux compatibility
- ✅ Multi-arch support (amd64/arm64)
- ✅ Resource constraints compliance
- ✅ Security best practices
- ✅ Production deployment readiness