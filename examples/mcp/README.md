# MCP Integration Examples

This folder contains examples for integrating external MCP (Model Context Protocol) servers with the Omni MCP Hub.

## Quick Start

```bash
# Start with external MCP servers
./start.sh
```

## Usage Examples

### External MCP Tools
```bash
# Use external MCP server tools (example)
/use external_server__some_tool parameter:"value"

# List all available tools (including external)
/use list_tools

# Test proxy functionality
/use test_server__echo message:"Hello from external server"
```

### Configuration Management
```bash
# Apply configurations
/use apply_claude_config profileName:"external-config"

# List available configurations
/use list_claude_configs

# Check current setup
/use get_applied_config
```

## Files

### Configuration Files

- **`omni-config.yaml`** - Complete configuration example showing how to connect multiple external MCP servers
- **`test-proxy.yaml`** - Simple test configuration for development
- **`test-server.js`** - Simple test MCP server for testing proxy functionality

### Usage

1. **Basic External Server Integration**
   ```bash
   # Use the external servers configuration
   node dist/index.js
   ```

2. **Test Proxy Functionality**
   ```bash
   # Run with test configuration
   node dist/index.js
   ```

## Supported External MCP Servers

The configuration supports any MCP server that implements the standard MCP protocol. Common examples:

### Official MCP Servers

- **Filesystem Server**
  ```yaml
  - name: "filesystem"
    command: "npx"
    args: ["@modelcontextprotocol/server-filesystem", "/allowed/path"]
  ```

- **PostgreSQL Server** 
  ```yaml
  - name: "postgres"
    command: "npx" 
    args: ["@modelcontextprotocol/server-postgres", "postgresql://localhost/db"]
  ```

- **SQLite Server**
  ```yaml
  - name: "sqlite"
    command: "npx"
    args: ["@modelcontextprotocol/server-sqlite", "/path/to/database.db"]
  ```

### Community MCP Servers

- **GitHub Integration**
  ```yaml
  - name: "github"
    command: "python"
    args: ["-m", "mcp_server_github"]
    env:
      GITHUB_TOKEN: "your-token"
  ```

## Features

- **Tool Aggregation** - All external tools appear as native tools with prefixed names (`servername__toolname`)
- **Resource Aggregation** - External resources are accessible with prefixed URIs (`servername://resource-uri`)
- **Transparent Proxying** - Tool calls and resource reads are automatically routed to the correct server
- **Error Handling** - Robust connection management with retry logic
- **Hot Configuration** - Servers can be added/removed without restarting

## Development

### Creating a Test MCP Server

The included `test-server.js` provides a simple template for creating MCP servers:

```javascript
// Implement required handlers
server.setRequestHandler(ListToolsRequestSchema, async () => { /* ... */ });
server.setRequestHandler(CallToolRequestSchema, async (request) => { /* ... */ });
server.setRequestHandler(ListResourcesRequestSchema, async () => { /* ... */ });
server.setRequestHandler(ReadResourceRequestSchema, async (request) => { /* ... */ });
```

### Configuration Structure

```yaml
externalServers:
  enabled: true          # Enable/disable external server integration
  autoConnect: true      # Automatically connect on startup
  servers:               # List of external servers
    - name: "unique-name"    # Unique identifier
      command: "executable" # Command to run
      args: ["arg1", "arg2"] # Command arguments
      description: "..."     # Optional description
      env:                   # Optional environment variables
        KEY: "value"
  retry:
    maxAttempts: 3      # Retry failed connections
    delayMs: 1000       # Delay between retries
```