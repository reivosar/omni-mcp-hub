# Docker Configuration for Omni MCP Hub

This directory contains Docker configuration files and scripts for containerizing and deploying the Omni MCP Hub.

## Files Overview

### Core Docker Files
- **`Dockerfile`** - Multi-stage Docker build configuration
- **`docker-compose.yml`** - Multi-service orchestration
- **`.dockerignore`** - Build optimization exclusions

### Scripts
- **`scripts/start-production.sh`** - Production deployment automation
- **`scripts/start-development.sh`** - Development environment setup
- **`scripts/cleanup.sh`** - Environment cleanup utilities

## Quick Start

### Production Deployment
```bash
# Basic production deployment
./docker/scripts/start-production.sh

# With external databases
./docker/scripts/start-production.sh --with-postgres --with-redis

# View logs
./docker/scripts/start-production.sh --logs
```

### Development Environment
```bash
# Start development with hot reload
./docker/scripts/start-development.sh

# With external services
./docker/scripts/start-development.sh --with-postgres --with-test

# Open development shell
./docker/scripts/start-development.sh --shell
```

### Cleanup
```bash
# Stop containers only
./docker/scripts/cleanup.sh

# Full cleanup (careful - removes data!)
./docker/scripts/cleanup.sh --full --force
```

## Service Profiles

The docker-compose configuration uses profiles to manage different deployment scenarios:

### Default (Production)
- `omni-mcp-hub` - Main application container

### Development Profile (`--profile dev`)
- `omni-mcp-hub-dev` - Development container with hot reload
- Source code mounted as volume
- Development dependencies included

### Database Profile (`--profile postgres`)
- `postgres` - PostgreSQL database
- Persistent volume for data
- Pre-configured for MCP integration

### Cache Profile (`--profile redis`)
- `redis` - Redis cache
- Persistent volume for data
- Available for session management

### Test Profile (`--profile test`)
- `test-mcp-server` - Test MCP server
- Used for proxy functionality testing
- Configured with test endpoints

## Container Features

### Security
- **Non-root user**: Runs as `omni` user (UID 1001)
- **Minimal base image**: Alpine Linux for reduced attack surface
- **Read-only configurations**: Config files mounted as read-only
- **Signal handling**: Proper signal handling with dumb-init

### Performance
- **Multi-stage build**: Optimized production images
- **Layer caching**: Efficient Docker layer utilization
- **Volume mounts**: Persistent data and configuration
- **Health checks**: Container health monitoring

### Development Experience
- **Hot reload**: Automatic restart on code changes
- **Volume mounts**: Live code editing
- **Shell access**: Easy container debugging
- **Log streaming**: Real-time log viewing

## Environment Variables

### Production Environment
```bash
NODE_ENV=production
LOG_LEVEL=info
```

### Development Environment
```bash
NODE_ENV=development
LOG_LEVEL=debug
```

### Database Configuration (when using postgres profile)
```bash
POSTGRES_DB=omni_mcp
POSTGRES_USER=omni
POSTGRES_PASSWORD=omni_password
```

## Volume Mounts

### Configuration Files
- `./omni-config.yaml:/app/omni-config.yaml:ro` - Main configuration
- `./examples:/app/examples:ro` - Example configurations
- `./configs:/app/configs:ro` - Additional configurations (optional)

### Persistent Data
- `omni-logs:/app/logs` - Application logs
- `postgres-data:/var/lib/postgresql/data` - Database data
- `redis-data:/data` - Redis data

### Development Volumes
- `.:/app` - Source code (development only)
- `/app/node_modules` - Node modules cache

## Networking

All services run on a custom bridge network (`omni-network`) for:
- Service isolation
- Internal service discovery
- Network security

Services can communicate using service names:
- `omni-mcp-hub` - Main application
- `postgres` - Database (when enabled)
- `redis` - Cache (when enabled)
- `test-mcp-server` - Test server (when enabled)

## Health Monitoring

### Container Health Checks
```bash
# Check container health
docker-compose ps

# View detailed health status
docker inspect omni-mcp-hub --format='{{.State.Health.Status}}'
```

### Log Monitoring
```bash
# Follow logs
docker-compose logs -f omni-mcp-hub

# View recent logs
docker-compose logs --tail=50 omni-mcp-hub

# All services logs
docker-compose logs
```

### Resource Monitoring
```bash
# Container resource usage
docker stats omni-mcp-hub

# System resource usage
docker system df
```

## Troubleshooting

### Common Issues

1. **Permission Errors**
   ```bash
   # Fix file permissions
   chmod +x docker/scripts/*.sh
   sudo chown -R $USER:$USER .
   ```

2. **Port Conflicts**
   ```bash
   # Check for port usage
   lsof -i :3000
   
   # Stop conflicting services
   docker-compose down
   ```

3. **Volume Mount Issues**
   ```bash
   # Reset volumes
   ./docker/scripts/cleanup.sh --volumes
   ```

4. **Build Failures**
   ```bash
   # Clean build
   docker-compose build --no-cache
   
   # Or use rebuild flag
   ./docker/scripts/start-production.sh --no-build
   ```

### Debug Commands

```bash
# Access container shell
docker-compose exec omni-mcp-hub sh

# Check container logs
docker-compose logs omni-mcp-hub

# Inspect container
docker inspect omni-mcp-hub

# Check network connectivity
docker-compose exec omni-mcp-hub ping postgres

# Run commands in container
docker-compose exec omni-mcp-hub npm test
```

## Best Practices

### Production Deployment
1. Use specific image tags instead of `latest`
2. Set resource limits in docker-compose
3. Enable log rotation
4. Use secrets management for sensitive data
5. Regular backup of persistent volumes

### Development Workflow
1. Use development profile for hot reload
2. Mount source code as volumes
3. Use separate databases for dev/test
4. Regular cleanup of development containers
5. Version control docker-compose overrides

### Security
1. Run containers as non-root user
2. Use read-only file systems where possible
3. Limit container capabilities
4. Regular image updates
5. Network segmentation

## Production Considerations

### Scaling
```bash
# Scale main service
docker-compose up -d --scale omni-mcp-hub=3

# Load balancer configuration required
```

### Monitoring
- Container health checks
- Log aggregation (ELK stack)
- Metrics collection (Prometheus)
- Alerting (AlertManager)

### Backup
```bash
# Backup volumes
docker run --rm -v omni-mcp-hub_postgres-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data

# Restore volumes
docker run --rm -v omni-mcp-hub_postgres-data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres-backup.tar.gz -C /
```