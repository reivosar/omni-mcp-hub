# Backend Team Configuration

Backend team specific resources and MCP server configurations.

## Backend-Specific Sources

### API Documentation
```yaml
github_sources:
  - url: "github:company/backend-apis"
  - url: "github:company/microservices-docs"
  - url: "github:company/database-schemas"
  - url: "github:company/deployment-configs"
```

### Local Development
```yaml
local_sources:
  - url: "/workspace/backend"
  - url: "/workspace/apis"
  - url: "/workspace/schemas"
```

## Backend MCP Servers

### Database Tools
```yaml
mcp_servers:
  - name: backend-sqlite
    type: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-sqlite"
      - "/app/data/backend.db"
    env:
      DB_POOL_SIZE: "10"
      DB_TIMEOUT: "5000"
      
  - name: backend-filesystem
    type: stdio
    command: npx
    args:
      - "-y" 
      - "@modelcontextprotocol/server-filesystem"
      - "/app/data/backend"
      - "/app/data/migrations"
    env:
      FILESYSTEM_READ_ONLY: "false"
```

## Development Tools

### API Testing
```yaml
development_tools:
  api_mocking:
    enabled: true
    mock_data_path: "/app/data/mocks"
    
  schema_validation:
    enabled: true
    openapi_specs: "/app/data/schemas"
    
  database_migrations:
    auto_run: false
    migration_path: "/app/data/migrations"
```

## Team Permissions

### Access Control
```yaml
access_control:
  allowed_operations:
    - "read_database_schema"
    - "execute_queries"
    - "read_api_specs"
    - "write_test_data"
  
  restricted_operations:
    - "drop_tables"
    - "delete_production_data"
    - "modify_user_credentials"
```

## Monitoring

### Backend-Specific Metrics
```yaml
monitoring:
  custom_metrics:
    - name: "database_connection_count"
      type: "gauge"
    - name: "api_response_times"
      type: "histogram"
    - name: "query_execution_time"
      type: "histogram"
      
  alerts:
    - name: "Slow Database Queries"
      condition: "query_time > 1000ms"
      notification: "backend-team-slack"
```

Backend team configuration focuses on database access, API development, and service integration.