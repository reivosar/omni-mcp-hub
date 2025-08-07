# Multi-Tier Configuration

Hierarchical configuration with external references and modular documentation structure.

## External References

This configuration demonstrates external reference capabilities:

- [Base Common Configuration](./base/common.md) - Core settings and defaults
- [Security Policies](./base/security.md) - Security configuration and restrictions
- [Development Environment](./environments/development.md) - Development-specific overrides
- [Production Environment](./environments/production.md) - Production hardening and monitoring
- [Backend Team Config](./teams/backend.md) - Backend team resources and tools
- [Frontend Team Config](./teams/frontend.md) - Frontend team assets and workflows
- [MCP Server Templates](./templates/mcp-server.md) - Reusable MCP server configurations
- [GitHub Organization Templates](./templates/github-org.md) - GitHub access patterns and templates

## Overview

Multi-tier configuration provides advanced modularity and external reference resolution. This approach supports:

- Enterprise-scale deployments
- Complex multi-environment setups
- Team collaboration with shared components
- Dynamic configuration loading

## External Reference System

### Reference Types

#### HTTP/HTTPS References
```yaml
# External configuration files
github_sources: 
  - url: "https://raw.githubusercontent.com/org/config/main/github-repos.yaml"

# External documentation
documentation_refs:
  - url: "https://docs.company.com/api/mcp-config.json"
```

#### GitHub File References
```yaml
# Reference files directly from GitHub
config_refs:
  - url: "github:org/infrastructure/configs/production.yaml"
  - url: "github:org/infrastructure/configs/staging.yaml"

# Team-specific configurations
team_configs:
  - url: "github:org/team-configs/backend-team.yaml" 
  - url: "github:org/team-configs/frontend-team.yaml"
```

#### Relative File References
```yaml
# Local modular configuration
base_config:
  - url: "./base/common.yaml"
  - url: "./base/security.yaml"

# Environment-specific overrides
environment_refs:
  - url: "../environments/${ENVIRONMENT}/config.yaml"
  - url: "../environments/${ENVIRONMENT}/secrets.yaml"
```

## Hierarchical Structure

### Configuration Layers
```
multi/
├── CLAUDE.md                 # This documentation
├── base/                     # Base configurations
│   ├── common.yaml          # Shared settings
│   ├── security.yaml        # Security policies
│   └── monitoring.yaml      # Monitoring config
├── environments/            # Environment-specific
│   ├── development/
│   │   ├── config.yaml     # Dev overrides
│   │   └── secrets.yaml    # Dev credentials
│   ├── staging/
│   │   ├── config.yaml     # Staging overrides
│   │   └── secrets.yaml    # Staging credentials
│   └── production/
│       ├── config.yaml     # Prod overrides
│       └── secrets.yaml    # Prod credentials
├── teams/                   # Team-specific configs
│   ├── backend.yaml        # Backend team resources
│   ├── frontend.yaml       # Frontend team resources
│   └── devops.yaml         # DevOps team resources
└── templates/              # Reusable templates
    ├── mcp-server.yaml     # MCP server template
    ├── github-org.yaml     # GitHub org template
    └── local-dirs.yaml     # Local directory template
```

### Master Configuration
```yaml
# Main mcp-sources.yaml with external references
references:
  # Base configuration layers
  - url: "./base/common.yaml"
  - url: "./base/security.yaml"
  
  # Environment-specific settings
  - url: "./environments/${ENVIRONMENT:-development}/config.yaml"
  
  # Team configurations
  - url: "github:org/team-configs/${TEAM:-default}.yaml"
  
  # External shared resources
  - url: "https://config-server.company.com/mcp/${SERVICE_NAME}.json"

# Local overrides (highest priority)
local_overrides:
  security:
    audit_logging: true
    max_memory: 1024
```

## Dynamic Resolution

### Environment Variables
```yaml
# Configuration supports environment variable substitution
github_sources:
  - url: "github:${GITHUB_ORG}/${GITHUB_REPO}"
  
local_sources:
  - url: "${DATA_PATH}/documents"
  - url: "${WORKSPACE_PATH}/projects"

mcp_servers:
  - name: database
    command: npx
    args: 
      - "-y"
      - "@modelcontextprotocol/server-sqlite"
      - "${DB_PATH}/production.db"
    env:
      DB_CONNECTION_STRING: "${DATABASE_URL}"
```

### Conditional Loading
```yaml
# Load different configurations based on conditions
conditional_configs:
  - condition: "${ENVIRONMENT} == 'production'"
    refs:
      - url: "github:org/prod-configs/strict-security.yaml"
      - url: "https://secrets.company.com/prod/mcp-secrets.json"
  
  - condition: "${TEAM} == 'security'"
    refs:
      - url: "github:security/audit-configs/extended-logging.yaml"
      
  - condition: "${ENABLE_MONITORING} == 'true'"
    refs:
      - url: "./monitoring/prometheus.yaml"
      - url: "./monitoring/grafana.yaml"
```

## Advanced Features

### Template System
```yaml
# Template definition
templates:
  mcp_server_template: &mcp_server
    type: stdio
    timeout: 30000
    security:
      sandbox: true
      max_memory: 512
      allowed_paths: ["/tmp", "/var/tmp"]

# Template usage
mcp_servers:
  - name: filesystem
    <<: *mcp_server
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem"]
    
  - name: sqlite
    <<: *mcp_server
    command: npx
    args: ["-y", "@modelcontextprotocol/server-sqlite"]
```

### Configuration Validation
```yaml
# Schema validation for external references
validation:
  schemas:
    - type: "github_sources"
      schema: "https://schemas.company.com/mcp/github-v1.json"
    - type: "mcp_servers" 
      schema: "./schemas/mcp-server-v2.yaml"
  
  required_fields:
    - "github_sources[].url"
    - "mcp_servers[].name"
    - "mcp_servers[].command"
```

### Caching Strategy
```yaml
# External reference caching configuration
caching:
  external_refs:
    ttl: 3600  # 1 hour cache
    retry_on_failure: true
    fallback_to_cache: true
  
  github_files:
    ttl: 1800  # 30 minute cache
    branch_tracking: true
    webhook_invalidation: true
```

## Deployment Strategies

### Development Environment
```bash
# Use development configuration
export ENVIRONMENT=development
export TEAM=backend
./start.sh multi
```

### Staging Environment
```bash
# Use staging with monitoring
export ENVIRONMENT=staging
export ENABLE_MONITORING=true
./start.sh multi
```

### Production Environment
```bash
# Use production with strict security
export ENVIRONMENT=production  
export TEAM=production
export GITHUB_ORG=company
./start.sh multi
```

## Security Considerations

### External Reference Validation
- All external URLs validated against allowlist
- SSL/TLS verification for HTTPS references
- GitHub references require valid authentication
- Timeout limits for external fetches

### Credential Management
```yaml
# Secure credential handling
credentials:
  github_token:
    source: "env:GITHUB_TOKEN"
    required: true
    
  database_password:
    source: "vault:secret/mcp/database"
    fallback: "env:DB_PASSWORD"
```

### Access Control
```yaml
# Fine-grained access controls
access_control:
  external_refs:
    allowed_domains: 
      - "github.com"
      - "raw.githubusercontent.com"
      - "config.company.com"
    
  file_access:
    allowed_paths:
      - "/app/data"
      - "/tmp"
    read_only: true
```

## Monitoring and Observability

### Reference Resolution Tracking
```yaml
monitoring:
  reference_resolution:
    track_performance: true
    log_failures: true
    metrics_enabled: true
    
  external_dependencies:
    health_checks: true
    timeout_monitoring: true
    retry_tracking: true
```

### Configuration Drift Detection
```yaml
drift_detection:
  enabled: true
  check_interval: 300  # 5 minutes
  alert_on_changes: true
  snapshot_storage: "/app/data/config-snapshots"
```

## Best Practices

### Reference Management
- Use semantic versioning for configuration files
- Implement proper caching strategies
- Monitor external dependency health
- Have fallback configurations ready

### Team Collaboration
- Separate team-specific from shared configurations
- Use pull requests for configuration changes
- Implement configuration validation in CI/CD
- Document all external dependencies

### Performance Optimization
- Cache frequently accessed external references
- Use conditional loading to minimize overhead
- Implement parallel reference resolution
- Monitor configuration loading times

## Troubleshooting

### Reference Resolution Issues
```bash
# Check external reference accessibility
curl -I https://config.company.com/mcp/service.json

# Verify GitHub access
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/org/config/contents/config.yaml

# Test local file references
ls -la ./environments/production/config.yaml
```

### Configuration Validation
```bash
# Validate configuration syntax
docker run --rm -v $PWD:/workspace \
  omni-mcp-hub:latest node -e "
    const yaml = require('js-yaml');
    const fs = require('fs');
    try {
      yaml.load(fs.readFileSync('/workspace/mcp-sources.yaml'));
      console.log('Configuration is valid');
    } catch (e) {
      console.error('Configuration error:', e.message);
    }
  "
```

### Performance Analysis
```bash
# Monitor configuration loading time
docker-compose logs | grep "Configuration loaded"

# Check external reference response times
docker-compose logs | grep "External reference"

# Analyze cache hit rates
curl http://localhost:3000/debug/cache-stats
```