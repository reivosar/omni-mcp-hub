# Serena Semantic Code Editing Integration

This folder contains configuration examples for integrating Serena and other semantic code editing MCP servers with the Omni MCP Hub.

## What is Serena?

Serena is a powerful coding agent toolkit that provides semantic code retrieval and editing capabilities. Unlike traditional text-based search tools, Serena understands code structure and semantics, making it ideal for working with large, complex codebases.

## Files

- **`omni-config.yaml`** - Configuration for Serena and related semantic code MCP servers
- **`start.sh`** - Setup script for starting with Serena integration

## Installation

### Installing Serena

```bash
# First install uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install and run Serena via uvx
uvx --from git+https://github.com/oraios/serena serena --help

# Alternative: Local clone
git clone https://github.com/oraios/serena
cd serena
uv run serena start-mcp-server
```

### Configuration

The `omni-config.yaml` includes Serena configuration and optional semantic code tools:

```yaml
servers:
  - name: "serena"
    command: "serena"
    args: ["--sse"]
    description: "Semantic code retrieval and editing"
```

## Serena Tools

Serena provides powerful semantic tools:

### Core Tools
- **`find_symbol`** - Find symbol definitions semantically
- **`find_referencing_symbols`** - Find all references to a symbol
- **`insert_after_symbol`** - Insert code after a specific symbol
- **`replace_symbol`** - Replace symbol semantically
- **`get_symbol_info`** - Get detailed symbol information

### Example Usage in Claude Code

```
/use serena__find_symbol className:"UserController"
/use serena__find_referencing_symbols symbol:"getUserById"
/use serena__insert_after_symbol symbol:"constructor" code:"// New code here"
```

## Related Semantic Code MCP Servers

The configuration includes optional servers that complement Serena:

### Codebase MCP
```yaml
- name: "codebase"
  command: "mcp-server-codebase"
  args: ["."]
  description: "Whole codebase search and analysis"
```

### DesktopCommander
```yaml
- name: "desktop-commander"
  command: "python"
  args: ["-m", "desktop_commander_mcp"]
  description: "Desktop automation for complex tasks"
```

### Sourcegraph
```yaml
- name: "sourcegraph"
  command: "mcp-server-sourcegraph"
  args: []
  env:
    SOURCEGRAPH_TOKEN: "your-token"
  description: "Code intelligence and search"
```

## Features

### Semantic Understanding
- **Symbol-aware** - Understands code structure, not just text
- **Language Server Protocol** - Built on LSP for accurate code analysis
- **Multi-language** - Supports Python, TypeScript, Java, and more

### Integration Benefits
- **Precise Edits** - Edit code based on semantic understanding
- **Efficient Navigation** - Find code by meaning, not text patterns
- **Context Awareness** - Understands relationships between code elements

## Quick Start

```bash
# 1. Install Serena
npm install -g serena

# 2. Start Omni MCP Hub with Serena
cd examples/serena
./start.sh

# 3. In Claude Code, use Serena tools
/use serena__find_symbol className:"MyClass"
```

## Use Cases

### Refactoring
- Find all usages of a function before renaming
- Update all references to a moved class
- Extract methods with semantic understanding

### Code Navigation
- Jump to symbol definitions
- Find all implementations of an interface
- Trace call hierarchies

### Code Generation
- Insert code at semantically correct locations
- Generate implementations based on interfaces
- Add methods to classes intelligently

## Troubleshooting

### Serena Not Found
```bash
# Check if Serena is installed
which serena

# Install if missing
npm install -g serena
```

### Language Server Issues
```bash
# Ensure language servers are installed for your languages
# Python
pip install python-lsp-server

# TypeScript
npm install -g typescript-language-server

# Java
# Install Eclipse JDT Language Server
```

## Resources

- [Serena GitHub](https://github.com/oraios/serena)
- [Serena Documentation](https://serena.oraios.com/docs)
- [MCP Protocol Docs](https://modelcontextprotocol.io)