# Data Flow Documentation - Omni MCP Hub

## Overview

This document describes the data flow patterns, transformations, and security boundaries within Omni MCP Hub. Understanding these flows is crucial for security analysis, performance optimization, and troubleshooting.

## High-Level Data Flow

```mermaid
graph TD
    subgraph "External Systems"
        CLIENT[Claude Code Client]
        GITHUB[GitHub API]
        VAULT[Secret Vault]
        KEYCHAIN[OS Keychain]
    end
    
    subgraph "Omni MCP Hub"
        API[API Gateway]
        AUTH[Auth Module]
        PROXY[MCP Proxy]
        CONFIG[Config Manager]
        SECRETS[Secret Manager]
        AUDIT[Audit Logger]
        CACHE[Cache Layer]
    end
    
    subgraph "MCP Servers"
        FILESYSTEM[Filesystem Server]
        GIT[Git Server]
        DATABASE[Database Server]
    end
    
    CLIENT -->|HTTPS/WSS| API
    API --> AUTH
    AUTH --> PROXY
    PROXY --> CONFIG
    CONFIG --> SECRETS
    SECRETS --> VAULT
    SECRETS --> KEYCHAIN
    CONFIG --> GITHUB
    PROXY --> FILESYSTEM
    PROXY --> GIT
    PROXY --> DATABASE
    API --> AUDIT
    CONFIG --> CACHE
```

## Detailed Data Flows

### 1. Authentication Flow

```mermaid
sequenceDiagram
    participant C as Claude Code
    participant API as API Gateway
    participant AUTH as Auth Module
    participant IDP as Identity Provider
    participant CACHE as Token Cache
    participant AUDIT as Audit Log
    
    Note over C,IDP: Initial Authentication
    C->>IDP: OAuth2/OIDC Login
    IDP-->>C: JWT Token
    
    Note over C,AUDIT: API Request with Token
    C->>API: Request + Bearer Token
    API->>AUTH: Validate Token
    AUTH->>CACHE: Check Token Cache
    
    alt Token in Cache
        CACHE-->>AUTH: Valid Token Info
    else Token Not Cached
        AUTH->>IDP: Verify Token (JWKS)
        IDP-->>AUTH: Token Validation
        AUTH->>CACHE: Cache Token Info
    end
    
    AUTH->>AUDIT: Log Auth Event
    AUTH-->>API: User Claims
    API-->>C: Authenticated Response
```

**Data Elements:**
- **Input**: JWT token, client credentials
- **Processing**: Token validation, JWKS verification, claims extraction
- **Output**: User identity, permissions, audit event
- **Storage**: Token cache (TTL-based), audit logs

### 2. Configuration Loading Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant API as API Gateway
    participant CONFIG as Config Manager
    participant SCANNER as File Scanner
    participant GITHUB as GitHub API
    participant SECRETS as Secret Manager
    participant VAULT as Vault/Keychain
    participant CACHE as Cache
    
    C->>API: Apply Profile Request
    API->>CONFIG: Load Profile "dev-assistant"
    
    CONFIG->>SCANNER: Scan for Profiles
    SCANNER-->>CONFIG: Available Profiles List
    
    alt Local Profile
        CONFIG->>CONFIG: Read Local CLAUDE.md
    else Remote Profile
        CONFIG->>GITHUB: Fetch Remote Profile
        GITHUB-->>CONFIG: Raw Profile Content
    end
    
    CONFIG->>SECRETS: Resolve ${SECRET:api-key}
    SECRETS->>VAULT: Get Secret "api-key"
    VAULT-->>SECRETS: Secret Value
    SECRETS-->>CONFIG: Resolved Value
    
    CONFIG->>CACHE: Store Processed Profile
    CONFIG-->>API: Profile Configuration
    API-->>C: Profile Applied
```

**Data Elements:**
- **Input**: Profile name, file paths, secret references
- **Processing**: File reading, secret resolution, variable substitution
- **Output**: Processed configuration, resolved secrets
- **Storage**: Profile cache, secret cache, audit trail

### 3. MCP Tool Execution Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant API as API Gateway
    participant AUTH as Auth Module
    participant PERM as Permission Validator
    participant PROXY as MCP Proxy
    participant MCP as MCP Server
    participant AUDIT as Audit Logger
    participant SANDBOX as Execution Sandbox
    
    C->>API: Call Tool "filesystem:read"
    API->>AUTH: Get User Context
    AUTH-->>API: User Permissions
    
    API->>PERM: Validate Tool Access
    PERM-->>API: Access Granted/Denied
    
    alt Access Granted
        API->>PROXY: Route to MCP Server
        PROXY->>MCP: Forward Tool Call
        
        alt Execution Required
            MCP->>SANDBOX: Execute in Sandbox
            SANDBOX-->>MCP: Execution Result
        end
        
        MCP-->>PROXY: Tool Response
        PROXY->>AUDIT: Log Tool Usage
        PROXY-->>API: Sanitized Response
        API-->>C: Tool Result
    else Access Denied
        API->>AUDIT: Log Access Denial
        API-->>C: 403 Forbidden
    end
```

**Data Elements:**
- **Input**: Tool name, parameters, user context
- **Processing**: Permission validation, request routing, response sanitization
- **Output**: Tool results, audit events, error messages
- **Storage**: Execution logs, audit trail, performance metrics

### 4. Secret Management Flow

```mermaid
sequenceDiagram
    participant APP as Application
    participant SM as Secret Manager
    participant EP as Env Provider
    participant KP as Keychain Provider
    participant VP as Vault Provider
    participant CACHE as Secret Cache
    participant AUDIT as Audit Logger
    
    APP->>SM: Resolve "${VAULT:db/password}"
    SM->>CACHE: Check Cache
    
    alt Cache Hit
        CACHE-->>SM: Cached Secret
        SM->>AUDIT: Log Cache Hit
    else Cache Miss
        SM->>VP: Resolve "db/password"
        
        alt Primary Provider Success
            VP-->>SM: Secret Value
        else Primary Provider Fail
            SM->>EP: Fallback to Env
            EP-->>SM: Environment Value
        end
        
        SM->>CACHE: Cache Secret (TTL)
        SM->>AUDIT: Log Secret Access
    end
    
    SM-->>APP: Resolved Secret
```

**Data Elements:**
- **Input**: Secret reference, provider configuration
- **Processing**: Provider selection, fallback handling, caching
- **Output**: Resolved secret value, audit events
- **Storage**: Secret cache (TTL), audit logs, provider metrics

### 5. Resource Access Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant API as API Gateway
    participant RH as Resource Handler
    participant GITHUB as GitHub API
    participant CACHE as Resource Cache
    participant SCANNER as File Scanner
    participant FS as Filesystem
    
    C->>API: Get Resource "github://guide/files"
    API->>RH: Handle Resource Request
    RH->>CACHE: Check Resource Cache
    
    alt Cache Hit
        CACHE-->>RH: Cached Resource
    else Cache Miss
        RH->>GITHUB: Fetch Resource List
        GITHUB-->>RH: API Response
        RH->>CACHE: Cache Response (TTL)
    end
    
    alt Local Resource Request
        C->>API: Get "config://profiles/active"
        API->>RH: Handle Local Resource
        RH->>SCANNER: Scan Active Profiles
        SCANNER->>FS: Read Profile Files
        FS-->>SCANNER: File Contents
        SCANNER-->>RH: Profile List
    end
    
    RH-->>API: Resource Data
    API-->>C: JSON Response
```

**Data Elements:**
- **Input**: Resource URI, access permissions
- **Processing**: URI parsing, cache lookup, external API calls
- **Output**: Resource content, metadata, cache entries
- **Storage**: Resource cache (TTL), API rate limit counters

## Security Boundaries and Controls

### 1. Input Validation Boundaries

```
External Input → Validation → Internal Processing
     │              │              │
     ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Raw Request │ │   Schema    │ │  Validated  │
│   Data      │ │ Validation  │ │    Data     │
└─────────────┘ └─────────────┘ └─────────────┘
     │              │              │
  Untrusted      Validation      Trusted
    Zone         Boundary        Zone
```

**Validation Controls:**
- JSON Schema validation
- Type checking and coercion
- Range and length validation
- Pattern matching (regex)
- Sanitization of dangerous characters

### 2. Secret Handling Boundaries

```
Secret References → Resolution → In-Memory → Disposal
        │              │           │          │
        ▼              ▼           ▼          ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Encrypted  │ │ Resolution  │ │ Plain Text  │ │   Memory    │
│  Storage    │ │  Process    │ │  (Temp)     │ │  Cleared    │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
        │              │           │          │
   Secure Store    Provider      Runtime     Cleanup
                   Boundary     Boundary
```

**Security Controls:**
- Encrypted storage at rest
- Secure transport (TLS)
- Memory clearing after use
- Access logging and audit
- Time-based cache expiration

### 3. Execution Boundaries

```
User Input → Validation → Sandbox → Output Filtering
    │            │          │           │
    ▼            ▼          ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│Untrusted│ │Validated│ │Isolated │ │Filtered │
│  Code   │ │  Code   │ │Execution│ │ Output  │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
    │            │          │           │
External      Validation   Sandbox    Response
Boundary      Boundary    Boundary    Boundary
```

**Execution Controls:**
- Code syntax validation
- Resource limits (CPU, memory, time)
- API restriction (file system, network)
- Output sanitization
- Error message filtering

## Performance and Scalability

### 1. Caching Strategy

```mermaid
graph TD
    subgraph "Cache Layers"
        L1[L1: In-Memory Cache]
        L2[L2: Redis Cache]
        L3[L3: Database Cache]
    end
    
    subgraph "Data Sources"
        GITHUB[GitHub API]
        VAULT[Secret Vault]
        FS[File System]
        DB[Database]
    end
    
    REQUEST[Request] --> L1
    L1 -->|Cache Miss| L2
    L2 -->|Cache Miss| L3
    L3 -->|Cache Miss| GITHUB
    L3 -->|Cache Miss| VAULT
    L3 -->|Cache Miss| FS
    L3 -->|Cache Miss| DB
```

**Cache Configuration:**
- **L1 Cache**: 5-minute TTL, 1000 entries max
- **L2 Cache**: 1-hour TTL, 10k entries max
- **L3 Cache**: 24-hour TTL, 100k entries max

### 2. Connection Pooling

```
Client Requests
      │
      ▼
┌─────────────┐
│  Connection │
│    Pool     │     ┌─── MCP Server 1
│  (Size: 10) │ ────┼─── MCP Server 2
│             │     └─── MCP Server 3
└─────────────┘
```

**Pool Configuration:**
- Initial size: 5 connections
- Maximum size: 20 connections
- Connection timeout: 30 seconds
- Idle timeout: 5 minutes

### 3. Async Processing

```mermaid
graph LR
    REQUEST[Request] --> QUEUE[Task Queue]
    QUEUE --> WORKER1[Worker 1]
    QUEUE --> WORKER2[Worker 2]
    QUEUE --> WORKER3[Worker 3]
    WORKER1 --> RESPONSE[Response]
    WORKER2 --> RESPONSE
    WORKER3 --> RESPONSE
```

**Processing Patterns:**
- **Synchronous**: Authentication, authorization
- **Asynchronous**: File processing, external API calls
- **Background**: Audit logging, cache warming

## Monitoring and Observability

### 1. Data Flow Metrics

| Metric | Description | Type | Alert Threshold |
|--------|-------------|------|-----------------|
| Request Rate | Requests per second | Counter | > 1000 rps |
| Response Time | Average response time | Histogram | > 500ms |
| Error Rate | Errors per second | Counter | > 10 eps |
| Cache Hit Rate | Cache effectiveness | Gauge | < 70% |
| Connection Pool | Active connections | Gauge | > 80% |

### 2. Security Metrics

| Metric | Description | Type | Alert Threshold |
|--------|-------------|------|-----------------|
| Auth Failures | Failed authentications | Counter | > 100/min |
| Permission Denials | Access denials | Counter | > 50/min |
| Anomalous Requests | Unusual patterns | Counter | > 10/min |
| Secret Access | Secret resolutions | Counter | > 1000/hour |

### 3. Performance Metrics

| Metric | Description | Type | Alert Threshold |
|--------|-------------|------|-----------------|
| Memory Usage | Heap memory usage | Gauge | > 1GB |
| CPU Usage | CPU utilization | Gauge | > 80% |
| Disk I/O | File operations/sec | Counter | > 1000 ops/sec |
| Network I/O | Network bytes/sec | Counter | > 100MB/sec |

## Data Retention and Lifecycle

### 1. Data Categories

| Data Type | Retention Period | Storage Location | Backup Frequency |
|-----------|------------------|------------------|------------------|
| Audit Logs | 7 years | Encrypted storage | Daily |
| Performance Metrics | 90 days | Time-series DB | Hourly |
| Cache Data | 24 hours | Memory/Redis | None |
| Configuration | Indefinite | Version control | On change |
| Secrets | Indefinite | Secure vault | Daily |

### 2. Data Lifecycle Management

```mermaid
graph TD
    CREATE[Data Creation] --> ACTIVE[Active Use]
    ACTIVE --> ARCHIVE[Archive Storage]
    ARCHIVE --> DISPOSE[Secure Disposal]
    
    ACTIVE -->|Hot Data| MEMORY[Memory Cache]
    ACTIVE -->|Warm Data| DISK[Disk Storage]
    ARCHIVE -->|Cold Data| TAPE[Tape Backup]
```

### 3. Compliance Requirements

- **GDPR**: Right to erasure, data portability
- **HIPAA**: PHI encryption, access controls
- **SOX**: Audit trail integrity, retention periods
- **PCI DSS**: Cardholder data protection

## Troubleshooting Data Flow Issues

### 1. Common Issues

| Issue | Symptoms | Root Cause | Resolution |
|-------|----------|------------|------------|
| Slow Responses | High latency | Cache misses | Warm cache, optimize queries |
| Auth Failures | 401 errors | Token expiry | Refresh tokens, extend TTL |
| Secret Errors | 500 errors | Provider down | Fallback provider, retry logic |
| Memory Leaks | Increasing memory | Unclosed connections | Connection pooling, GC tuning |

### 2. Diagnostic Tools

- **Request Tracing**: End-to-end request tracking
- **Performance Profiling**: CPU and memory analysis
- **Log Correlation**: Cross-component event matching
- **Health Checks**: Component status monitoring

### 3. Emergency Procedures

1. **Circuit Breaker Activation**: Isolate failing components
2. **Traffic Throttling**: Reduce load during incidents
3. **Fallback Modes**: Degrade gracefully
4. **Data Recovery**: Restore from backups if needed