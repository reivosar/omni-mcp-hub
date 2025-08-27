# 🎯 Configuration Examples

This directory contains comprehensive configuration examples for different deployment scenarios and use cases.

## 🚀 Quick Start

**New to Omni MCP Hub?** Start here:

```bash
# Get started in under 30 seconds
cp examples/local-resources/omni-config.yaml .
npm run build && npm start
```

## 📁 Available Examples

### 🏠 **local-resources/** 
**Perfect for:** Getting started, character behaviors, testing

✅ **Features:**
- Anime character personalities (Lum, Zoro, Naruto, Tsundere)
- Local CLAUDE.md behavior files
- Zero external dependencies
- Instant setup

📋 **Contents:** 5 character behaviors + starter script

### 🔄 **mixed/** 
**Perfect for:** Development teams, multiple integrations

✅ **Features:**
- Multiple MCP servers (Serena, Filesystem, Local-files)
- Development and code-review profiles
- Professional development workflows
- Rich tool integration

📋 **Contents:** ~50+ tools from 3 external servers

### 🖥️ **mcp/** 
**Perfect for:** MCP server developers, testing integrations

✅ **Features:**
- External MCP server integration examples
- Test server included (`test-server.js`)
- Proxy functionality demonstration
- Development testing

📋 **Contents:** Test server + integration examples

### 🐳 **docker/** 
**Perfect for:** Containerized deployments, production

✅ **Features:**
- Docker Compose configurations
- Production-ready containers
- Health monitoring
- Scalable deployment

📋 **Contents:** Multiple Docker environments

## ⚙️ Configuration Patterns

### 🎯 Minimal Configuration (Recommended Start)
```yaml
# Just 6 lines - perfect for getting started
autoLoad:
  profiles:
    - name: "default"
      path: "./examples/local-resources/lum-behavior.md"
      autoApply: true
```

### 🔄 Adding External MCP Servers
```yaml
externalServers:
  enabled: true
  autoConnect: true
  servers:
    - name: "filesystem"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
      description: "File system operations"
```

### 📊 Adding Monitoring & Security
```yaml
monitoring:
  enabled: true
  port: 3099
  healthEndpoints: true
  dashboard: true

security:
  rbac:
    enabled: true
  secrets:
    scanOnStartup: true
  audit:
    enabled: true
```

## ✅ Schema Validation & CLI Tools

All configurations are validated with comprehensive tooling:

### 📋 **Schema Validation**
- **Schema:** `schemas/omni-config.schema.json`
- **Validation:** Automatic on startup + CLI tools
- **Editor Support:** VSCode, IntelliJ with autocomplete

### 🛠️ **CLI Tools Available**
```bash
npm run config:doctor    # Interactive configuration troubleshooting
npm run config:check     # Quick validation
npm run config:validate  # Full schema validation
npm run admin           # Interactive admin interface
npm run profile:admin   # Profile management
npm run monitoring      # System monitoring dashboard
```

## 📋 CLI Tools Integration

All examples work seamlessly with the built-in CLI tools:

### 🎛️ **Admin Interface**
```bash
npm run admin                    # Interactive admin UI
npm run admin:status            # System status overview
```

### ⚙️ **Configuration Management**
```bash
npm run config:doctor           # Interactive troubleshooting
npm run config:check            # Quick health check
npm run config:validate         # Full validation
```

### 👤 **Profile Management**
```bash
npm run profile:admin           # Profile management CLI
# Operations: list, create, delete, validate profiles
```

### 🔒 **Security Tools**
```bash
npm run scan:secrets            # Scan for hardcoded secrets
npm run scan:secrets:pre-commit # Pre-commit hook
npm run scan:secrets:ci         # CI/CD integration
```

### 📊 **Monitoring**
```bash
npm run monitoring              # System monitoring CLI
# Access metrics, health status, performance data
```

### 🔧 **Manual Operations**
```bash
npm run manual:apply            # Manual configuration application
npm run disclosure              # Disclosure mode for sensitive operations
```

## 🆘 Quick Help

### 🎯 **Which Example Should I Use?**
- **First time?** → `local-resources/` (instant setup)
- **Development team?** → `mixed/` (rich tool integration)
- **MCP server testing?** → `mcp/` (development focused)
- **Production deployment?** → `docker/` (containerized)

### 🚀 **Getting Started Commands**
```bash
# Quick start (recommended)
cd examples/local-resources && ./start.sh

# Development setup
cd examples/mixed && ./start.sh

# Docker setup
cd examples/docker/local-resources && ./start.sh
```

### ✅ **Testing & Validation**
```bash
# Comprehensive testing
npm test                        # Full test suite (99.94% coverage)
npm run test:coverage          # Coverage report
npm run config:doctor          # Configuration validation
npm run scan:secrets           # Security scanning
```

### 📚 **Documentation**
- **📖 Main README:** [../../README.md](../../README.md)
- **🏗️ Architecture:** [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- **🛡️ Security:** [../../docs/THREAT_MODEL.md](../../docs/THREAT_MODEL.md)
- **📋 Configuration:** [../../docs/CONFIGURATION.md](../../docs/CONFIGURATION.md)