# Omni MCP Hub

MCP server for Claude Code that manages CLAUDE.md profiles and proxies external MCP servers.

## Features

- **CLAUDE.md Management**: Load and apply external Claude configurations
- **MCP Proxy**: Connect to external MCP servers and proxy their tools
- **Profile Management**: Support for multiple configuration profiles
- **YAML Configuration**: Configuration via `omni-config.yaml`
- **Auto-loading**: Automatically load profiles on startup
- **TypeScript**: Built with TypeScript using the official MCP SDK


## Quick Start

### One-Line Setup

```bash
# Clone and start with minimal configuration  
git clone https://github.com/reivosar/omni-mcp-hub.git
cd omni-mcp-hub && npm install && npm run build
echo 'profiles: [{name: "default", path: "./examples/local-resources/naruto-behavior.md"}]' > omni-config.yaml
npm start
```

### Docker Setup

```bash
docker-compose -f docker/docker-compose.yml up -d
```


## Available Tools

### Core MCP Tools
- **add**: Add two numbers together (demo tool)
- **echo**: Echo back a message (demo tool)

### CLAUDE.md Management Tools (when fileSettings configured)
- **apply_claude_config**: Load and apply CLAUDE.md configuration files
- **list_claude_configs**: List all available configuration files (loaded + scannable)
- **get_applied_config**: Get detailed information about currently applied configuration

### External MCP Server Tools (when configured)
Proxy any tools from external MCP servers configured in omni-config.yaml

### CLI Tools
```bash
# Available commands (check package.json scripts for full list)
npm run build           # Build the project
npm run start           # Start the server
npm run dev             # Development mode
npm run test            # Run tests
npm run lint            # Lint code
```

## Available Resources

- **config://auto-apply**: Auto-apply instructions for profiles with `autoApply: true`
- **config://files/scannable**: All scannable configuration files
- **config://profiles/active**: Currently loaded/active profile information
- **engineering-guide://files**: Engineering guide file list
- **engineering-guide://combined**: Combined engineering guide content
- External resources from configured MCP servers (when available)

## Configuration

### Important Limitations

**Claude Code Exclusive Features:**
- External CLAUDE.md profile functionality is **Claude Code exclusive**
- Does not work with other AI models/platforms (ChatGPT, Gemini, etc.)

**Profile Priority (Important):**
- If a `CLAUDE.md` exists directly in the project root, MCP profiles are **completely disabled**
- To use external MCP profiles, you must delete or rename the local `CLAUDE.md`
  ```bash
  # How to disable local CLAUDE.md
  mv CLAUDE.md CLAUDE.md.unused    # Rename
  rm CLAUDE.md                     # Or delete
  ```
- **Priority Order**: Local CLAUDE.md > MCP Profiles > Default Settings

### Configuration

Create `omni-config.yaml`:

```yaml
# omni-config.yaml
autoLoad:
  profiles:
    - name: "default"
      path: "./your-profile.md"
      autoApply: true

externalServers:
  enabled: true
  servers:
    - name: "filesystem"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
```

See `examples/` directory for example configurations.

### Documentation

- **Architecture Guide**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)  
- **Admin UI Guide**: [docs/ADMIN_UI.md](./docs/ADMIN_UI.md)
- **Schema**: [schemas/omni-config.schema.json](./schemas/omni-config.schema.json)
- **Examples**: [examples/](./examples/) directory with working configurations

## Development

### Project Structure

**Core Modules:**
- **`src/index.ts`**: Main server orchestrator
- **`src/config/`**: YAML configuration and profile loading
- **`src/tools/`**: MCP tool handlers for CLAUDE.md management
- **`src/resources/`**: MCP resource handlers for data exposure
- **`src/mcp-proxy/`**: External MCP server proxy management
- **`src/cli/`**: 6 standalone CLI utilities
- **`src/utils/`**: Shared utilities (config parsing, logging, etc.)

**Additional Features:**
- Security modules (available but not integrated)
- Monitoring modules (available but not integrated)
- Validation and error handling utilities


## Testing

```bash
npm test            # Run tests
npm run test:watch  # Watch mode
npm run test:ui     # Interactive UI
```


## Architecture Overview

### Actual System Architecture

The Omni MCP Hub is a **focused MCP server** that provides:

**Core Components (Actually Integrated):**
- **Main Server**: `OmniMCPServer` orchestrates all components
- **Configuration Management**: YAML config loading and CLAUDE.md profile management
- **MCP Proxy**: Connects to external MCP servers with basic health checks
- **Tool Handlers**: Handle CLAUDE.md management tools + proxy external tools
- **Resource Handlers**: Expose server info, profiles, and config resources
- **CLI Tools**: 6 standalone command-line utilities

**External Integration:**
- Connects to external MCP servers (Serena, Filesystem, Local-files, etc.)
- Proxies their tools transparently to Claude Code
- Basic health monitoring of external connections

### Simple Request Flow

```
Claude Code → Omni MCP Hub → Decision:
├── CLAUDE.md Tool → File System → Response
├── External Tool → Proxy → External MCP Server → Response  
└── Resource Request → Static Data → Response
```

### CLAUDE.md Format

CLAUDE.md files can contain sections like Instructions, Rules, Knowledge, Context, etc. See examples in `examples/` directory for sample formats.

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md).


## Support

- **Documentation**: Check the [docs/](./docs/) directory
- **Issues**: Report bugs via [GitHub Issues](https://github.com/reivosar/omni-mcp-hub/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/reivosar/omni-mcp-hub/discussions)

