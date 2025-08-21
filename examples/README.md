# Configuration Examples

This directory contains standardized configuration examples for different use cases.

## 🚀 Quick Start

**New to Omni MCP Hub?** Start here:

```bash
# Copy the minimal configuration
cp examples/minimal/omni-config.yaml .

# Create your Claude profile
echo "You are a helpful AI assistant." > CLAUDE.md

# Run the hub
npm start
```

## 📁 Example Types

### 1. **Minimal** (`examples/minimal/`) 
**Perfect for:** First-time users, testing, learning

- ✅ Single profile (`CLAUDE.md`)
- ✅ Basic logging
- ✅ 5 lines of config
- ✅ Zero complexity

### 2. **Standard** (`examples/standard/`) 
**Perfect for:** Most users, development teams, production

- ✅ Multiple profiles organized in folders
- ✅ Essential external servers (filesystem, git)  
- ✅ Production-ready logging
- ✅ Health monitoring
- ✅ ~15 lines of config

### 3. **Enterprise** (`examples/enterprise/`)
**Perfect for:** Large teams, security-conscious deployments

- ✅ Full security features (JWT, RBAC, audit logging)
- ✅ Advanced profile inheritance
- ✅ Multiple external servers
- ✅ Performance optimization
- ✅ Comprehensive monitoring

### 4. **Docker** (`examples/docker/`)  
**Perfect for:** Containerized deployments, cloud environments

- ✅ Container-friendly paths and logging
- ✅ Health endpoints for orchestration
- ✅ Environment variable integration
- ✅ Security handled at ingress level

## 🔧 Configuration Structure

### Minimal Configuration (Recommended Start)
```yaml
profiles:
  - name: "default"
    path: "CLAUDE.md"

logging:
  level: "info"
```

### Adding External Servers
```yaml
externalServers:
  - name: "filesystem"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    description: "File system operations"
```

### Adding Monitoring
```yaml
monitoring:
  enabled: true
  port: 3099
  healthEndpoints: true
```

## 📋 Schema Validation

All configurations are validated against the JSON schema:
- **Schema:** `schemas/omni-config.schema.json`
- **Validation:** Automatic on startup
- **Editor Support:** VSCode, IntelliJ, etc.

## 🔄 Migration Guide

### From Old Configurations

**If you have existing configs with:**

- `fileSettings.configFiles.*` → Use simple `profiles` array
- Complex `directoryScanning` → Use explicit `profiles` paths  
- `autoLoad.profiles` → Move to main `profiles` array
- Mixed structures → Choose one pattern from examples

### Example Migration

**Before (complex):**
```yaml
autoLoad:
  profiles:
    - name: "assistant"
      path: "profiles/assistant.md"

fileSettings:
  configFiles:
    claude: "CLAUDE.md"
    behavior: "*-behavior.md"

externalServers:
  enabled: true
  servers: [...]
```

**After (simple):**
```yaml
profiles:
  - name: "default"
    path: "CLAUDE.md"
  - name: "assistant"  
    path: "profiles/assistant.md"

externalServers:
  - name: "filesystem"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
```

## 🆘 Help

- **Can't decide?** → Start with `minimal/`
- **Need external servers?** → Use `standard/`
- **Enterprise deployment?** → Use `enterprise/`
- **Docker/Kubernetes?** → Use `docker/`
- **Migration issues?** → Check the migration guide above

## ✅ Validation

Test your configuration:
```bash
# Validate configuration
npm run validate-config

# Test configuration 
npm run test -- --grep "config"
```