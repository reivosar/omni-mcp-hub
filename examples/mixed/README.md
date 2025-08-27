# 🔄 Mixed MCP Servers Configuration

**Professional Development Environment with Multiple MCP Integrations**

This example demonstrates how to configure multiple external MCP servers through the Omni MCP Hub, providing a complete development environment with ~50+ tools from multiple integrations.

## 🏗️ Architecture Overview

The Mixed configuration provides a comprehensive development environment:

### 🛠️ **Active MCP Servers** (Enabled by Default)
- **🧠 Serena** - ~25 tools for semantic code editing and retrieval
- **💾 Filesystem** - ~14 tools for file system operations
- **📄 Local-files** - ~14 tools for local markdown and text reading

### 🔧 **Available Servers** (Easily Configurable)
- **📊 Codebase** - Whole repository search and analysis
- **🖥️ Desktop Commander** - Desktop automation tools
- **🌐 Sourcegraph** - Code intelligence platform
- **🔍 CodeMCP** - Advanced static code analysis
- **🌳 Tree-sitter** - Syntax tree parsing and analysis
- **⚙️ Custom servers** - Add your own MCP integrations

## 🚀 Quick Start

```bash
# Start complete development environment (30 seconds)
./start.sh

# Or run manually with full build
npm run build && node dist/index.js
```

**What You Get Instantly:**
- 🧠 **~25 Serena tools** for semantic code operations
- 💾 **~14 Filesystem tools** for file operations
- 📄 **~14 Local-files tools** for document reading
- 👤 **2 behavior profiles** (dev-assistant, code-reviewer)
- 📊 **Full monitoring** and admin tools

## Usage Examples

### 👨‍💻 Professional Development Profiles
```bash
# Switch between professional modes
/use apply_claude_config profileName:"dev-assistant"   # 🛠️ Full-stack development focus
/use apply_claude_config profileName:"code-reviewer"   # 🔍 Code quality and review focus

# Profile management
/use list_claude_configs                              # List all available profiles  
/use get_applied_config                               # Check current active profile
```

**Profile Features:**
- **🛠️ dev-assistant:** TypeScript focus, testing emphasis, security-first development
- **🔍 code-reviewer:** Code quality focus, performance analysis, architectural guidance

### 🛠️ Integrated Tool Examples

#### 🧠 **Semantic Code Operations** (Serena - 25 tools)
```bash
# Symbol search and manipulation
/use serena__find_symbol className:"UserController"
/use serena__find_referencing_symbols symbol:"getUserById"
/use serena__replace_symbol_body name:"updateUser" body:"new implementation"
/use serena__get_symbols_overview relative_path:"src/controllers/"
```

#### 💾 **File System Operations** (Filesystem - 14 tools)
```bash
# File and directory operations
/use filesystem__read_file path:"README.md"
/use filesystem__list_directory path:"src/"
/use filesystem__create_directory path:"tests/integration/"
/use filesystem__search_files pattern:"*.test.ts"
```

#### 📄 **Documentation Access** (Local-files - 14 tools)
```bash
# Local markdown and documentation
/use local-files__read_file path:"docs/api.md"
/use local-files__list_files directory:"docs/"
/use local-files__search_content query:"authentication" directory:"docs/"
```

## ⚙️ Configuration Management

### 🛠️ **CLI Tools Integration**
```bash
# Interactive configuration management
npm run admin                   # Full admin interface
npm run config:doctor          # Configuration troubleshooting
npm run profile:admin          # Profile management
npm run monitoring             # System monitoring
npm run scan:secrets           # Security scanning
```

### ⚙️ **Server Configuration**

Edit `omni-config.yaml` to customize your environment:

```yaml
# Current active configuration (enabled by default)
externalServers:
  enabled: true
  autoConnect: true
  servers:
    # Semantic code editing - 25 tools
    - name: "serena"
      command: "uvx"
      args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--enable-web-dashboard", "false"]
      description: "Semantic code retrieval and editing for large codebases"
    
    # File system operations - 14 tools  
    - name: "filesystem"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
      description: "File system operations with security"
      
    # Local file access - 14 tools
    - name: "local-files"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-local-files", "docs/"]
      description: "Local markdown and text file reading"

# Add more servers by uncommenting:
    # - name: "codebase"
    #   command: "npx"
    #   args: ["-y", "@modelcontextprotocol/server-codebase", "."]  
    #   description: "Whole repository analysis"
```

## 📋 Tool Categories Available

### 🧠 **Semantic Code Tools** (Serena - 25 tools)
- 🔍 Symbol finding and referencing (`find_symbol`, `find_referencing_symbols`)
- ⚙️ Code insertion and replacement (`replace_symbol_body`, `insert_after_symbol`)
- 🏗️ Code structure analysis (`get_symbols_overview`, `search_for_pattern`)
- 📝 Memory management (`write_memory`, `read_memory`, `list_memories`)
- 📊 Project management (`activate_project`, `switch_modes`, `execute_shell_command`)

### 💾 **File System Tools** (Filesystem - 14 tools) 
- 📄 File operations (`read_file`, `write_file`, `create_directory`)
- 🔍 Search capabilities (`search_files`, `list_directory`)
- ⚙️ Path operations with security validation
- 🔒 Permission-aware file management

### 📄 **Documentation Tools** (Local-files - 14 tools)
- 📜 Markdown file reading (`read_file`, `list_files`)
- 🔍 Content search (`search_content`)
- 📁 Directory browsing with filtering
- 📊 Documentation analysis

### 🔧 **Available Extensions** (Configure as needed)
- **📊 Codebase:** Repository-wide analysis and search
- **🖥️ Desktop:** Application and system automation
- **🌐 Sourcegraph:** Code intelligence and insights
- **🌳 Tree-sitter:** Advanced syntax analysis

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

## 🛠️ Troubleshooting

### 🚑 **Quick Diagnostics**
```bash
# Automated troubleshooting
npm run config:doctor          # Interactive diagnosis
npm run admin:status           # System health check
npm run monitoring             # Real-time monitoring
```

### ⚠️ **Common Issues**

**🔴 Server not starting**
```bash
# Check system status and logs
npm run admin:status
tail -f logs/omni-mcp-hub.log
```

**📦 Missing dependencies**
```bash
# Ensure required tools are installed
npm install                    # Node.js dependencies
pip install uv                 # For Python-based servers (Serena)
```

**⚙️ Configuration errors**
```bash
# Validate configuration
npm run config:validate        # Schema validation
npm run config:check          # Quick syntax check
```

**⚡ Tool conflicts**
```bash
# Check tool availability and conflicts
npm run admin                  # Interactive admin interface
# Use interface to enable/disable servers as needed
```

### 📊 **Performance Monitoring**
```bash
# Monitor system performance
npm run monitoring             # Web dashboard access
# Visit http://localhost:3099 for real-time metrics
```

## 📚 Documentation & Support

### 📝 **Core Documentation**
- **📖 Main README:** [../../README.md](../../README.md)
- **🏗️ Architecture:** [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- **⚙️ Configuration:** [../../docs/CONFIGURATION.md](../../docs/CONFIGURATION.md)
- **🛡️ Security:** [../../docs/THREAT_MODEL.md](../../docs/THREAT_MODEL.md)

### 🔗 **External References** 
- **📜 MCP Specification:** [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **🧠 Serena Repository:** [github.com/oraios/serena](https://github.com/oraios/serena)
- **📋 Official MCP Servers:** [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)

### 🔍 **Testing & Monitoring**
```bash
# Comprehensive testing (99.94% coverage)
npm test                       # Full test suite
npm run test:coverage         # Coverage report
npm run monitoring           # System monitoring dashboard

# Configuration validation
npm run config:doctor        # Interactive troubleshooting
npm run config:check         # Quick validation
npm run scan:secrets         # Security scanning
```

### 🆘 **Getting Help**
- **🚀 Quick Issues:** Use `npm run config:doctor` for troubleshooting
- **📊 System Status:** Use `npm run admin:status` for overview
- **📝 Logs:** Check `logs/omni-mcp-hub.log` for detailed information