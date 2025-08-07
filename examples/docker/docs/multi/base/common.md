# Common Base Configuration

This document describes the common base configuration settings used across all environments.

## Core Settings

### Server Configuration
```yaml
server:
  port: 3000
  timeout: 30000
  max_connections: 100
  cors_enabled: true
```

### Logging Configuration
```yaml
logging:
  level: info
  format: json
  output: stdout
  audit_enabled: true
```

### Performance Settings
```yaml
performance:
  cache_size: 100MB
  worker_processes: 4
  memory_limit: 512MB
  gc_interval: 60000
```

## Default Resource Patterns

### File Patterns
```yaml
file_patterns:
  include:
    - "*.md"
    - "*.txt" 
    - "*.json"
    - "*.yaml"
    - "*.yml"
  exclude:
    - "node_modules/**"
    - ".git/**"
    - "*.log"
```

### Security Defaults
```yaml
security:
  sandbox_enabled: true
  read_only_sources: true
  max_file_size: 10MB
  allowed_domains:
    - "github.com"
    - "raw.githubusercontent.com"
```

These settings form the foundation for all other configurations.