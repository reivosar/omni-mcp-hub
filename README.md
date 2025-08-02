# Omni MCP Hub

A Model Context Protocol (MCP) server that aggregates documentation from multiple GitHub repositories and local directories, providing a unified interface for AI assistants like Claude.

## Features

- **Multi-source aggregation**: Combine documentation from multiple GitHub repos and local directories
- **Per-source authentication**: Each source can have its own GitHub token
- **Smart caching**: Automatic cache invalidation via GitHub webhooks
- **External reference resolution**: Automatically fetches linked documentation
- **Security-first design**: CORS protection, webhook signature verification, secure token handling
- **SSE streaming**: Real-time document streaming for better performance
- **MCP compatible**: Works with Claude and other MCP-compatible AI assistants

## Quick Start

### 1. Installation

```bash
git clone https://github.com/your-org/omni-mcp-hub.git
cd omni-mcp-hub
npm install
```

### 2. Configuration

The server can run with either a configuration file or environment variables:

**Option 1: Configuration file (recommended for complex setups)**
```bash
# Create your configuration from the example
cp mcp-sources.yaml.example mcp-sources.yaml

# Edit mcp-sources.yaml with your sources
# See mcp-sources.yaml.example for detailed options
```

**Option 2: Environment variables only (simple setups)**
```bash
# Define sources directly via environment variable
export SOURCES="github:microsoft/vscode,local:/path/to/project"
```

The server will automatically use environment variables if no configuration file is found.

### 3. Environment Setup

```bash
# Server configuration
export PORT=3000                      # Server port (default: 3000)
export MCP_PORT=3000                  # Alternative port variable

# Required: Webhook secret for GitHub
export GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# Required: CORS allowed origins (comma-separated)
export ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# GitHub tokens (one per source as needed)
export GITHUB_TOKEN_PUBLIC=ghp_xxxxxxxxxxxxxxxxxxxx
export GITHUB_TOKEN_PRIVATE=ghp_yyyyyyyyyyyyyyyyyyyy

# Optional: Sources directly via environment (for simple setups)
export SOURCES="github:microsoft/vscode,local:/path/to/project"

# Optional: File configuration
export FILE_PATTERNS="CLAUDE.md,*.claude.md,docs/CLAUDE.md"
export MAX_FILE_SIZE=1048576          # 1MB file size limit

# Optional: Fetch settings
export FETCH_TIMEOUT=30000            # 30 seconds
export FETCH_RETRIES=3                # Number of retries
export FETCH_RETRY_DELAY=1000         # 1 second between retries
export FETCH_MAX_DEPTH=3              # Max external reference depth

# Optional: Cache settings
export CACHE_TTL=300000               # 5 minutes cache TTL

# Optional: Content security
export CONTENT_VALIDATION_ENABLED=true
export CONTENT_REJECT_PATTERNS="custom\\s+pattern,another\\s+pattern"
export CONTENT_REJECT_KEYWORDS="forbidden1,forbidden2"
```

### 4. Run the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Run tests
npm test
```

## API Endpoints

### GET /healthz
Health check endpoint
```bash
curl http://localhost:${PORT:-3000}/healthz
# Response: {"status":"ok"}
```

### POST /sse
MCP-compatible SSE endpoint for fetching documentation
```bash
curl -X POST http://localhost:${PORT:-3000}/sse \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "fetch_owner_repo_documentation",
    "params": {
      "owner": "microsoft",
      "repo": "vscode",
      "branch": "main",
      "include_externals": true
    }
  }'
```

### POST /webhook
GitHub webhook endpoint for cache invalidation
```bash
# Configure in GitHub repository settings
# Webhook URL: https://your-domain.com:${PORT:-3000}/webhook
# Content type: application/json
# Secret: $GITHUB_WEBHOOK_SECRET
# Events: Push, Pull Request, Repository
```

## Configuration Options

### Sources
```yaml
sources:
  # GitHub URL formats
  - url: https://github.com/owner/repo
  - url: github:owner/repo@branch
  - url: owner/repo@branch
  
  # Local paths
  - url: /absolute/path
  - url: ./relative/path
  - url: file:///path
```

### File Patterns
```yaml
files:
  patterns:
    - "CLAUDE.md"      # Main documentation
    - "*.claude.md"    # Alternative pattern
    - "docs/CLAUDE.md" # Nested docs
  max_size: 1048576    # 1MB limit
```

### Performance Tuning
```yaml
fetch:
  timeout: 30000       # 30 seconds
  retries: 3           # Retry failed requests
  retry_delay: 1000    # 1 second initial delay
  max_depth: 3         # Reference resolution depth

cache:
  ttl: 300000          # 5 minutes
```

## Processing Flow

```mermaid
graph TD
    A[Client Request] --> B{Request Type?}
    
    B -->|MCP Tool Call| C[MCP Handler]
    B -->|SSE Request| D[SSE Server]
    B -->|Webhook| E[Webhook Handler]
    
    C --> F[Content Security Check]
    D --> F
    
    F --> G{Content Safe?}
    G -->|No| H[Block & Return Safety Notice]
    G -->|Yes| I[Source Manager]
    
    I --> J{Cache Hit?}
    J -->|Yes| K[Return Cached Data]
    J -->|No| L[Fetch from Sources]
    
    L --> M{Source Type?}
    M -->|GitHub| N[GitHub API Handler]
    M -->|Local| O[Local File Handler]
    
    N --> P[Apply File Patterns]
    O --> P
    
    P --> Q[Content Validation]
    Q --> R{Validation Pass?}
    R -->|No| S[Log & Exclude File]
    R -->|Yes| T[Process External References]
    
    T --> U[Reference Resolver]
    U --> V{Max Depth?}
    V -->|No| W[Fetch External Content]
    V -->|Yes| X[Skip Resolution]
    
    W --> Y[Validate External Content]
    Y --> Z{External Safe?}
    Z -->|No| AA[Mark as Error]
    Z -->|Yes| BB[Include in Response]
    
    X --> BB
    AA --> BB
    BB --> CC[Cache Result]
    CC --> DD[Stream to Client]
    
    E --> EE[Verify Webhook Signature]
    EE --> FF{Signature Valid?}
    FF -->|No| GG[Reject Request]
    FF -->|Yes| HH[Invalidate Cache]
    HH --> II[Log Cache Invalidation]
    
    S --> T
    K --> DD
    H --> DD
    
    style F fill:#ffeb3b
    style G fill:#f44336
    style Q fill:#ffeb3b
    style R fill:#f44336
    style Y fill:#ffeb3b
    style Z fill:#f44336
```

## Security

### Content Security Validation
- **Multi-layer protection**: Pattern-based detection for prompt injection, system manipulation, and code injection
- **Language-neutral approach**: Technical patterns only, no linguistic bias
- **Conservative thresholds**: Minimizes false positives while maintaining security
- **Configurable rules**: Custom patterns and keywords via YAML configuration
- **Real-time filtering**: Content blocked at multiple processing stages

### Security Configuration
```yaml
security:
  content_validation:
    enabled: true  # Enable/disable content validation
    reject_patterns:
      - "custom\\s+dangerous\\s+pattern"
    additional_keywords:
      - "forbidden_word"
```

### CORS Protection
- Configurable allowed origins via `ALLOWED_ORIGINS` environment variable
- No wildcard origins allowed for security
- Credentials supported for authenticated requests

### Webhook Verification
- HMAC-SHA256 signature verification for all GitHub webhooks
- Timing-safe comparison to prevent timing attacks
- Proper error handling for malformed payloads

### Token Management
- Per-source GitHub tokens for fine-grained access control
- All tokens stored in environment variables, never in config files
- Support for both public and private repositories

## MCP Tools

When integrated with Claude or other MCP clients, the following tools are available:

1. **list_sources**: List all configured sources
2. **get_file**: Fetch a specific file from a source
3. **get_file_variants**: Find all versions of a file across sources
4. **fetch_documentation**: Batch fetch all documentation

## Development

### Project Structure
```
omni-mcp-hub/
├── src/                      # Source code
│   ├── types/                # Type definitions
│   ├── config/               # Configuration management
│   ├── cache/                # Caching layer
│   ├── github/               # GitHub API client
│   ├── handlers/             # Request handlers
│   ├── sources/              # Source management
│   ├── utils/                # Utility functions
│   └── servers/              # Server implementations
├── tests/                    # Test suites
├── mcp-sources.yaml          # Your configuration
└── package.json
```

### Running Tests
```bash
# All tests
npm test

# Specific test suite
npm test tests/unit/cache.test.ts

# With coverage
npm run test:coverage
```

### Building
```bash
# TypeScript compilation
npm run build

# Watch mode
npm run build:watch
```

## Troubleshooting

### Common Issues

1. **CORS errors**: Check `ALLOWED_ORIGINS` includes your client URL
2. **401 Unauthorized**: Verify GitHub tokens are set correctly
3. **Webhook failures**: Ensure `GITHUB_WEBHOOK_SECRET` matches GitHub config
4. **Cache issues**: Check webhook delivery in GitHub settings

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm start

# Check recent webhook deliveries
gh api /repos/:owner/:repo/hooks

# Test health endpoint
curl http://localhost:${PORT:-3000}/healthz

# Check environment variables
env | grep -E "(PORT|MCP_|GITHUB_|ALLOWED_|SOURCES|FILE_|FETCH_|CACHE_|CONTENT_)"
```

## Performance

### Benchmarks
- **Cache Hit Response**: < 1ms
- **GitHub API Call**: ~200ms (network dependent)
- **Recursive Resolution**: ~500ms for 5 external refs
- **Memory Usage**: ~50MB for 1000 cached files
- **Concurrent Requests**: 50+ concurrent users supported

### Optimization Features
- **Parallel Processing**: Concurrent file and reference fetching
- **Intelligent Caching**: 5-minute TTL with webhook invalidation
- **Rate Limit Handling**: Automatic backoff and retry
- **Memory Management**: Automatic cleanup of expired cache entries

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Submit a pull request

## Support

- Issues: GitHub Issues
- Documentation: See `docs/` directory
- Examples: See `examples/` directory