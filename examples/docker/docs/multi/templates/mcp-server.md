# MCP Server Template

Reusable template for MCP server configurations across all environments and teams.

## Base MCP Server Template

### Standard Configuration
```yaml
mcp_server_template: &mcp_server_base
  type: stdio
  enabled: true
  timeout: 30000
  retry_attempts: 3
  health_check_interval: 60000
  
  security:
    sandbox_enabled: true
    max_memory: 512MB
    max_cpu_percent: 50
    network_access: false
    
  logging:
    level: "info"
    structured: true
    include_performance: true
```

## Filesystem Server Template

### Standard Filesystem MCP
```yaml
filesystem_server_template: &filesystem_mcp
  <<: *mcp_server_base
  command: npx
  args:
    - "-y"
    - "@modelcontextprotocol/server-filesystem"
  
  security:
    <<: *mcp_server_base.security
    allowed_paths: []  # To be overridden
    read_only: true
    max_file_size: 10MB
    
  performance:
    cache_enabled: true
    cache_ttl: 300
    max_concurrent_operations: 10
```

## Database Server Template

### SQLite MCP Template
```yaml
sqlite_server_template: &sqlite_mcp
  <<: *mcp_server_base
  command: npx
  args:
    - "-y"
    - "@modelcontextprotocol/server-sqlite"
  
  database:
    connection_pool_size: 5
    query_timeout: 5000
    max_query_complexity: 100
    read_only: false
    
  security:
    <<: *mcp_server_base.security
    sql_injection_prevention: true
    query_validation: strict
```

## Usage Examples

### Development Environment
```yaml
mcp_servers:
  - name: dev-filesystem
    <<: *filesystem_mcp
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/workspace"
    security:
      read_only: false
      allowed_paths: ["/workspace", "/tmp"]
    logging:
      level: "debug"
      
  - name: dev-database
    <<: *sqlite_mcp
    args:
      - "-y"
      - "@modelcontextprotocol/server-sqlite"
      - "/tmp/dev.db"
    database:
      read_only: false
```

### Production Environment
```yaml
mcp_servers:
  - name: prod-filesystem
    <<: *filesystem_mcp
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/app/data"
    security:
      read_only: true
      allowed_paths: ["/app/data"]
    timeout: 10000
    health_check_interval: 30000
    
  - name: prod-database
    <<: *sqlite_mcp
    args:
      - "-y"
      - "@modelcontextprotocol/server-sqlite"
      - "/app/data/prod.db"
    database:
      read_only: true
      connection_pool_size: 10
```

## Custom Server Templates

### HTTP Server Template
```yaml
http_server_template: &http_mcp
  type: http
  enabled: true
  timeout: 15000
  
  http:
    base_url: ""  # To be specified
    headers:
      "User-Agent": "omni-mcp-hub/1.0"
      "Accept": "application/json"
    
  security:
    ssl_verify: true
    max_redirects: 3
    allowed_methods: ["GET", "POST"]
    
  retry:
    attempts: 3
    delay: 1000
    exponential_backoff: true
```

## Template Customization

### Environment-Specific Overrides
```yaml
# Development overrides
development_overrides: &dev_overrides
  logging:
    level: "debug"
    verbose: true
  security:
    strict_mode: false
  performance:
    cache_enabled: false

# Production overrides  
production_overrides: &prod_overrides
  logging:
    level: "warn"
    audit_enabled: true
  security:
    strict_mode: true
    fail_secure: true
  performance:
    cache_enabled: true
    cache_ttl: 600
```

## Validation Schema

### Template Validation
```yaml
template_validation:
  required_fields:
    - "type"
    - "command"
    - "timeout"
  
  field_constraints:
    timeout:
      min: 1000
      max: 300000
    retry_attempts:
      min: 1
      max: 10
    max_memory:
      pattern: "^[0-9]+[KMGT]?B$"
```

Templates provide consistent, secure, and maintainable MCP server configurations across all deployments.