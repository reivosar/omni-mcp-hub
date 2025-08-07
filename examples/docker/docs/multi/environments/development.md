# Development Environment Configuration

Development-specific settings and overrides for local development workflow.

## Development Overrides

### Relaxed Security
```yaml
security_overrides:
  debug_mode: true
  verbose_logging: true
  cors_strict: false
  rate_limiting: false
```

### Local Development Sources
```yaml
local_sources:
  - url: "/workspace/docs"
  - url: "/workspace/projects"
  - url: "/workspace/examples"

github_sources:
  - url: "github:company/development-configs"
  - url: "github:company/test-repositories"
```

## Development MCP Servers

### Test Servers
```yaml
mcp_servers:
  - name: dev-filesystem
    type: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/workspace"
    env:
      DEBUG: "true"
      
  - name: dev-sqlite
    type: stdio  
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-sqlite"
      - "/tmp/dev.db"
```

## Hot Reload Configuration

### File Watching
```yaml
hot_reload:
  enabled: true
  watch_paths:
    - "/workspace"
    - "/app/config"
  ignore_patterns:
    - "node_modules"
    - ".git"
  debounce_ms: 500
```

## Development Tools

### Debug Endpoints
```yaml
debug_endpoints:
  - path: "/debug/config"
    description: "Current configuration dump"
  - path: "/debug/sources"
    description: "Active source status"
  - path: "/debug/cache"
    description: "Cache statistics"
```

Development environment prioritizes developer productivity and debugging capabilities.