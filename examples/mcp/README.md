# 🔄 MCP Integration Examples

**External MCP Server Integration & Testing Environment**

This folder contains comprehensive examples for integrating external MCP (Model Context Protocol) servers with the Omni MCP Hub, including a test server for development and validation.

## 🚀 Quick Start

```bash
# Start MCP integration test environment (30 seconds)
./start.sh

# Or run manually
npm run build && node dist/index.js
```

**What You Get:**
- 🧪 **Test MCP server** (`test-server.js`) for development
- 🔧 **Proxy functionality** demonstration
- ⚙️ **Integration examples** for external servers
- 📊 **CLI tools** for management and monitoring

## 📝 Usage Examples

### 🛠️ **External MCP Server Tools**
```bash
# Test the included test server
/use test_server__echo message:"Hello from external server"
/use test_server__add_numbers a:5 b:3
/use test_server__get_status

# List all available tools (core + external)
/use list_tools

# Test resource access
/use read_resource uri:"test_server://info"
/use read_resource uri:"test_server://status"
```

### ⚙️ **Configuration & Profile Management**
```bash
# CLAUDE.md profile management
/use apply_claude_config profileName:"mcp-developer"
/use list_claude_configs
/use get_applied_config

# CLI tools for advanced management
npm run admin                   # Interactive admin interface
npm run config:doctor          # Configuration troubleshooting
npm run profile:admin          # Profile management CLI
npm run monitoring             # System monitoring dashboard
```

## 📁 Project Structure

### 📋 **Configuration Files**
- **⚙️ `omni-config.yaml`** - Complete MCP server integration configuration
- **🧪 `test-server.js`** - Test MCP server with echo, add, and status tools
- **🚀 `start.sh`** - Automated setup and startup script

### 🔧 **CLI Tools Integration**
```bash
# All CLI tools work with this configuration
npm run admin                   # Full admin interface
npm run config:doctor          # Interactive configuration validation
npm run profile:admin          # Profile management
npm run monitoring             # System monitoring (port 3099)
npm run scan:secrets           # Security scanning
```

### 🚀 **Getting Started**

#### 🔍 **1. Test Server Development**
```bash
# Quick test with included test server
./start.sh
# Tests: echo tool, add tool, status resource
```

#### 🔧 **2. External Server Integration**
```bash
# Configure your own external MCP servers in omni-config.yaml
# Then run:
npm run build && node dist/index.js
```

#### 📊 **3. Production Monitoring**
```bash
# Monitor your MCP integrations
npm run monitoring              # Web dashboard
npm run admin:status           # CLI status check
```

## 🔌 Supported External MCP Servers

### 🏢 **Official MCP Servers** (Fully Tested)

**💾 Filesystem Server**
```yaml
- name: "filesystem"
  command: "npx"
  args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
  description: "File system operations with security"
```

**📊 PostgreSQL Server**
```yaml
- name: "postgres"
  command: "npx"
  args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/db"]
  description: "Database operations"
  env:
    DATABASE_URL: "postgresql://localhost/mydb"
```

**🗺️ SQLite Server**
```yaml
- name: "sqlite"
  command: "npx"
  args: ["-y", "@modelcontextprotocol/server-sqlite", "./data.db"]
  description: "SQLite database operations"
```

### 🌐 **Community MCP Servers** (Popular Integrations)

**💙 GitHub Integration**
```yaml
- name: "github"
  command: "python"
  args: ["-m", "mcp_server_github"]
  description: "GitHub repository operations"
  env:
    GITHUB_TOKEN: "your-github-token-here"
```

**🧠 Semantic Code (Serena)**
```yaml
- name: "serena"
  command: "uvx"
  args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--enable-web-dashboard", "false"]
  description: "Semantic code editing and retrieval"
```

## ✨ Key Features

### 🔄 **Seamless Integration**
- **🛠️ Tool Aggregation:** External tools appear as `servername__toolname`
- **📁 Resource Aggregation:** Access resources via `servername://resource-uri`
- **🔍 Transparent Proxying:** Automatic routing to correct servers
- **⚡ Hot Configuration:** Add/remove servers without restart

### 🛡️ **Enterprise Features** 
- **🔒 Security:** RBAC, audit logging, secrets scanning
- **📊 Monitoring:** Real-time metrics, health checks, web dashboard
- **🚑 Error Handling:** Resilience, retry logic, graceful degradation
- **🛠️ CLI Tools:** Admin interface, configuration doctor, profile management

### 📊 **Observability**
```bash
# Monitor MCP server health and performance
npm run monitoring              # Web dashboard (localhost:3099)
npm run admin:status           # CLI health check
tail -f logs/omni-mcp-hub.log  # Detailed logs
```

## 👨‍💻 Development

### 🛠️ **Creating Custom MCP Servers**

The included `test-server.js` provides a complete template:

```javascript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server({
  name: "test-server",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
    resources: {},
  },
});

// Tools implementation
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "Echo back a message",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Your tool logic here
});
```

### 🔧 **Development Workflow**
```bash
# Test your custom server
node your-server.js &          # Start your server
npm run config:doctor         # Validate configuration
npm run admin                 # Monitor integration
npm run test                  # Run integration tests
```

### ⚙️ **Configuration Structure**

```yaml
# Complete configuration example
externalServers:
  enabled: true                    # Enable external server integration
  autoConnect: true               # Connect automatically on startup
  servers:
    - name: "test-server"            # Unique server identifier
      command: "node"                # Command to execute
      args: ["test-server.js"]       # Command arguments
      description: "Test MCP server"  # Human-readable description
      env:                          # Environment variables (optional)
        NODE_ENV: "development"
    - name: "filesystem"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
      description: "File system operations"
  
  # Connection resilience
  retry:
    maxAttempts: 3                 # Retry failed connections
    delayMs: 1000                  # Delay between retry attempts
  
  # Monitoring and health checks
  healthCheck:
    enabled: true                  # Enable health monitoring
    intervalMs: 30000             # Health check interval

# Profile management
autoLoad:
  profiles:
    - name: "mcp-developer"
      path: "./examples/profiles/mcp-developer.md"
      autoApply: true

# Security and monitoring
security:
  rbac:
    enabled: true
  secrets:
    scanOnStartup: true

monitoring:
  enabled: true
  port: 3099
  dashboard: true
```

### 📊 **Testing & Validation**
```bash
# Comprehensive testing suite (99.94% coverage)
npm test                       # Full test suite
npm run test:coverage         # Coverage report
npm run config:validate       # Schema validation
npm run scan:secrets         # Security scan
```