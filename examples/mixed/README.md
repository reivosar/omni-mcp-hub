# Omni MCP Hub - Mixed MCP Servers Configuration

This example demonstrates how to configure multiple MCP servers through the Omni MCP Hub, providing a flexible setup for various development tools and integrations.

## Overview

The Mixed configuration allows you to enable and configure multiple MCP servers according to your needs:

- **Serena** - Semantic code editing and retrieval
- **Codebase** - Whole codebase search and analysis  
- **Desktop Commander** - Desktop automation tools
- **Sourcegraph** - Code intelligence platform
- **CodeMCP** - Advanced code analysis
- **Tree-sitter** - Syntax tree analysis
- **Custom servers** - Add your own MCP integrations

## Quick Start

```bash
# Run from the examples/mixed directory
./start.sh
```

## Configuration

Edit `omni-config.yaml` to enable/disable servers and customize settings:

```yaml
# Enable/disable external MCP servers
externalServers:
  enabled: true
  autoConnect: true
  servers:
    # Semantic code editing (default enabled)
    - name: "serena"
      command: "uvx"
      args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--enable-web-dashboard", "false"]
      description: "Semantic code retrieval and editing for large codebases"
    
    # Uncomment to enable additional servers:
    
    # - name: "codebase"
    #   command: "npx"
    #   args: ["-y", "@modelcontextprotocol/server-codebase", "/path/to/codebase"]
    #   description: "Whole codebase search and analysis"
    
    # - name: "desktop"
    #   command: "uvx"
    #   args: ["desktop-commander"]
    #   description: "Desktop automation and control"
```

## Available Tool Categories

### Semantic Code Tools (Serena)
- Symbol finding and referencing
- Semantic code insertion and replacement
- Code structure analysis

### Codebase Analysis Tools
- Full repository search
- File content analysis
- Directory structure exploration

### Desktop Automation Tools
- Application control
- File system operations
- System integration

### Code Intelligence Tools (Sourcegraph)
- Cross-repository code search
- Dependency analysis
- Code insights

## Customization Examples

### Development-focused Setup
```yaml
servers:
  - name: "serena"
    # Semantic code editing
  - name: "codebase" 
    # Repository analysis
  - name: "tree-sitter"
    # Syntax analysis
```

### Research-focused Setup
```yaml
servers:
  - name: "sourcegraph"
    # Code intelligence
  - name: "codebase"
    # Deep code search
```

### Automation-focused Setup
```yaml  
servers:
  - name: "desktop"
    # Desktop automation
  - name: "codebase"
    # File operations
```

## Adding Custom Servers

Add your own MCP server to the configuration:

```yaml
servers:
  - name: "my-custom-server"
    command: "python"
    args: ["/path/to/my/server.py"]
    env:
      API_KEY: "your-api-key"
    description: "My custom MCP server"
```

## Dependencies

Dependencies are installed automatically based on enabled servers:
- **uv** - For Python-based servers
- **npm/npx** - For Node.js-based servers
- **Custom dependencies** - As specified by each server

## Usage Examples

```bash
# Semantic code operations
/use serena__find_symbol className:"UserController"

# Codebase search
/use codebase__search pattern:"function.*login"

# Desktop automation
/use desktop__open_application name:"VS Code"

# Mixed workflow example
/use serena__find_symbol symbol:"ApiClient"
/use codebase__find_references file:"api.js"
/use desktop__copy_to_clipboard
```

## Troubleshooting

1. **Server not starting**: Check logs in `logs/omni-mcp-hub.log`
2. **Missing dependencies**: Ensure required tools are installed
3. **Configuration errors**: Validate YAML syntax in `omni-config.yaml`
4. **Tool conflicts**: Disable conflicting servers if needed

## Documentation

- [MCP Specification](https://modelcontextprotocol.io/)
- [Serena Repository](https://github.com/oraios/serena)
- [Omni MCP Hub Documentation](../../README.md)