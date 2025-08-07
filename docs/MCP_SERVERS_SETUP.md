# MCP Servers Setup Guide

This guide explains how to manually configure MCP servers for use with Claude Desktop and Omni MCP Hub.

## Manual Installation Method

Since `mcp-installer` may fail in some environments, here's the manual installation process:

### 1. Install Required Tools

First, install the MCP server globally using npm:

```bash
npm install -g @modelcontextprotocol/server-filesystem
```

> **Note**: Ensure Node.js is installed on your system. Download from [nodejs.org](https://nodejs.org) if needed.

### 2. Configuration Format

The configuration follows the pattern used by Claude Desktop:

```yaml
mcp_servers:
  - name: filesystem
    type: stdio
    command: npx
    args: 
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/path/to/directory1"
      - "/path/to/directory2"
    enabled: true
```

### 3. Platform-Specific Paths

#### macOS
```yaml
args: 
  - "-y"
  - "@modelcontextprotocol/server-filesystem"
  - "/Users/yourname/Documents"
  - "/Users/yourname/Projects"
```

#### Windows
```yaml
args: 
  - "-y"
  - "@modelcontextprotocol/server-filesystem"
  - "C:\\Users\\yourname\\Documents"
  - "C:\\Users\\yourname\\Projects"
```

#### Linux/Docker
```yaml
args: 
  - "-y"
  - "@modelcontextprotocol/server-filesystem"
  - "/home/yourname/documents"
  - "/app/repos"
```

### 4. Docker Environment

For Docker deployments, the filesystem server is pre-installed in the image:

```yaml
# examples/docker/mcp_servers/mcp-sources.yaml
mcp_servers:
  - name: filesystem
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    enabled: true
```

### 5. Multiple Filesystem Servers

You can configure multiple filesystem servers for different directory access:

```yaml
mcp_servers:
  - name: filesystem-docs
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/mac/Documents"]
    enabled: true
    
  - name: filesystem-projects
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/mac/Projects"]
    enabled: true
```

### 6. Security Considerations

- Only grant access to directories you trust
- Avoid granting access to system directories
- Use specific paths rather than broad access (e.g., `/Users/mac/Projects` instead of `/`)
- Review the security policy in `security-rules.yaml` for additional controls

### 7. Testing Your Configuration

After setting up, test the filesystem server:

```bash
# Start Omni MCP Hub with your configuration
npm start

# In another terminal, verify the server is running
curl http://localhost:3000/healthz
```

### 8. Troubleshooting

If the filesystem server fails to start:

1. Check that `npx` is available in your PATH
2. Verify the directories exist and have proper permissions
3. Check logs for specific error messages
4. Ensure the MCP server package is installed globally

For Docker environments:
- Verify the directories are mounted in the container
- Check that the paths match the container's filesystem structure