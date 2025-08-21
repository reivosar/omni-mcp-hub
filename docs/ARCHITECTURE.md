# Omni MCP Hub Architecture

## System Overview

```
┌────────────────────────────────────────────────────────────┐
│                        Client Layer                         │
│  (Claude, Cursor, Other MCP Clients)                       │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│                    MCP Server Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Request    │  │   Security   │  │  Rate        │    │
│  │   Handler    │◄─┤   Filter     │◄─┤  Limiter     │    │
│  └──────┬───────┘  └──────────────┘  └──────────────┘    │
└─────────┼──────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────┐
│                    Core Components                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Resource   │  │    Tool      │  │   Profile    │    │
│  │   Handlers   │  │   Handlers   │  │   Manager    │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
└─────────┼──────────────────┼─────────────────┼────────────┘
          │                  │                 │
          ▼                  ▼                 ▼
┌────────────────────────────────────────────────────────────┐
│                    Service Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   GitHub     │  │   Execution  │  │   Audit      │    │
│  │   Client     │  │   Sandbox    │  │   Logger     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└────────────────────────────────────────────────────────────┘
```

## Data Flow

### Request Processing Flow
```
Client Request
     │
     ▼
Authentication ──► Rate Limiting ──► Input Sanitization
     │                                      │
     ▼                                      ▼
Route Handler ◄─────────────────────── Validation
     │
     ▼
Business Logic ──► Audit Logging
     │
     ▼
Response ──► Output Filtering ──► Client
```

### Security Flow
```
Incoming Request
     │
     ├─► TLS/mTLS Validation
     │
     ├─► JWT/Token Verification  
     │
     ├─► Rate Limit Check
     │
     ├─► Input Sanitization
     │    ├─► SQL Injection Detection
     │    ├─► XSS Prevention
     │    └─► Command Injection Prevention
     │
     ├─► Authorization Check (RBAC)
     │
     └─► Audit Trail
```

## Component Details

### Core Components

#### MCP Server
- Handles MCP protocol communication
- WebSocket and HTTP support
- Request routing and response handling

#### Resource Handlers
- GitHub engineering guide resources
- Local file resources
- Dynamic resource generation
- Caching layer with TTL

#### Tool Handlers
- Code execution (sandboxed)
- File operations
- Search capabilities
- Integration with external services

#### Profile Manager
- Profile loading and switching
- Configuration management
- Permission enforcement
- Profile verification

### Security Components

#### Input Sanitization
- Pattern-based threat detection
- Type validation
- Length and format enforcement
- Recursive object sanitization

#### Rate Limiter
- Token bucket algorithm
- Per-IP and per-user limits
- DoS protection
- Request throttling

#### Audit Logger
- Tamper-evident logging
- Hash chain integrity
- Event categorization
- External sink support

#### Execution Sandbox
- VM2-based isolation
- Resource limits
- Timeout enforcement
- Dangerous API blocking

### Infrastructure Components

#### Monitoring
- Prometheus metrics
- Health checks
- Performance tracking
- Alert thresholds

#### Caching
- In-memory cache for GitHub content
- TTL-based expiration
- LRU eviction policy

#### Configuration
- YAML-based configuration
- Environment variable support
- Hot-reloading capability
- Schema validation

## Deployment Architecture

### Kubernetes Deployment
```
┌─────────────────────────────────────────────┐
│              Ingress Controller              │
└────────────────────┬────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼─────┐           ┌────▼─────┐
    │  Pod 1   │           │  Pod 2   │
    │  Node.js │           │  Node.js │
    └──────────┘           └──────────┘
         │                       │
    ┌────▼───────────────────────▼────┐
    │          ConfigMap              │
    │       (Configuration)           │
    └──────────────────────────────────┘
```

### Container Structure
```
omni-mcp-hub:latest
├── /app
│   ├── dist/           # Compiled TypeScript
│   ├── node_modules/   # Dependencies
│   ├── scripts/        # Operational scripts
│   └── config/         # Runtime configuration
├── /logs               # Application logs
└── /data              # Persistent data
```

## Security Model

### Authentication Layers
1. **Transport Security**: TLS 1.3 minimum
2. **Client Authentication**: mTLS for service-to-service
3. **User Authentication**: JWT tokens
4. **API Keys**: For programmatic access

### Authorization Model
```
User/Service ──► Role ──► Permissions
                  │
                  ├─► Read Resources
                  ├─► Execute Tools
                  ├─► Modify Profiles
                  └─► Admin Operations
```

### Threat Model

#### External Threats
- **DDoS Attacks**: Mitigated by rate limiting
- **Injection Attacks**: Prevented by input sanitization
- **Man-in-the-Middle**: Prevented by TLS/mTLS
- **Credential Theft**: Mitigated by secure storage

#### Internal Threats
- **Privilege Escalation**: RBAC enforcement
- **Data Tampering**: Audit log integrity
- **Resource Exhaustion**: Resource limits
- **Code Injection**: Sandboxed execution

## Performance Considerations

### Optimization Strategies
- Connection pooling for external services
- Caching for frequently accessed resources
- Async/await for non-blocking operations
- Worker threads for CPU-intensive tasks

### Scalability
- Horizontal scaling via Kubernetes
- Stateless design for easy scaling
- External state management (Redis/PostgreSQL)
- Load balancing across instances

## Monitoring & Observability

### Metrics Collection
```
Application Metrics ──► Prometheus ──► Grafana
         │
         └─► Custom Dashboards
              ├─► Request rates
              ├─► Error rates
              ├─► Response times
              └─► Resource usage
```

### Logging Strategy
- Structured JSON logging
- Log levels: ERROR, WARN, INFO, DEBUG
- Centralized log aggregation
- Correlation IDs for request tracing

## Disaster Recovery

### Backup Strategy
- Nightly configuration backups
- Audit log archival
- Profile data snapshots
- 30-day retention policy

### Recovery Procedures
1. Configuration restoration from backup
2. Profile data recovery
3. Audit trail reconstruction
4. Service health verification