# Omni MCP Hub

A universal MCP (Model Context Protocol) server for Claude Code integration with **CLAUDE.md configuration management**. This server allows you to externalize Claude's behavior configuration and dynamically control how Claude Code behaves using external CLAUDE.md files.

## Features

- **Tools**: Built-in example tools (add, echo) demonstrating MCP tool integration
- **Resources**: Example resources showing how to expose data through MCP
- **TypeScript**: Full TypeScript support with proper types
- **Official SDK**: Built using the official `@modelcontextprotocol/sdk`
- **Ready-to-use**: Works out of the box with Claude Code
- **CLAUDE.md Management**: Load, manage, and apply external Claude configurations
- **Dynamic Behavior**: Switch between different Claude personalities/behaviors
- **Profile Management**: Support for multiple configuration profiles
- **Persistent Storage**: Save and update CLAUDE.md files
- **YAML Configuration**: Advanced file scanning and configuration via `omni-config.yaml`
- **Auto-loading**: Automatically load profiles on startup via configuration
- **File Filtering**: Exclude/include files with configurable patterns

## Quick Start

**Start with a single command:**

```bash
./examples/start.sh
```

This automatically runs:
1. Install dependencies (you need to run `npm install` once initially)
2. Build project
3. Configure Claude Code MCP settings
4. Start MCP server

**Using Claude Code:**
1. Run `claude` in a new terminal
2. Execute test commands:
   ```
   /use add a:5 b:3
   /use echo message:"Hello MCP!"
   /use apply_claude_config lum-behavior
   /use list_claude_configs
   /use get_applied_config
   ```

## Available Tools

### Basic Tools
- **add**: Add two numbers together
- **echo**: Echo back a message

### CLAUDE.md Management Tools
- **apply_claude_config**: Load and apply a CLAUDE.md configuration file
- **list_claude_configs**: List all CLAUDE.md configuration files (both loaded and available)
- **get_applied_config**: Get information about the currently applied configuration

## Available Resources

- **info://server**: Server information
- **greeting://world**: A greeting message
- **config://auto-apply**: Auto-apply instructions (when profiles have autoApply: true)
- **config://files/scannable**: Scannable configuration files
- **config://profiles/active**: Active configuration profiles

## CLAUDE.md Configuration

### Character Configuration Examples

```bash
# Apply character configurations
/use apply_claude_config filePath:"./examples/lum-behavior.md" profileName:"lum"
/use apply_claude_config filePath:"./examples/pirate-behavior.md" profileName:"pirate"
/use apply_claude_config filePath:"./examples/special-behavior.md" profileName:"kansai"

# Or use short form (auto-resolves paths)
/use apply_claude_config lum-behavior

# List all configs (loaded and available)
/use list_claude_configs

# Get currently applied configuration
/use get_applied_config
```

### CLAUDE.md Format

```markdown
# Project Name

Project Name: My AI Assistant
Description: Custom Claude configuration
Version: 1.0.0

# Instructions

Your main system instructions here...

# Custom Instructions

- Custom instruction 1
- Custom instruction 2

# Rules

- Rule 1
- Rule 2

# Knowledge

- Knowledge item 1
- Knowledge item 2

# Context

- Context information 1
- Context information 2

# Tools

- Available tool 1
- Available tool 2

# Memory

Memory context and information to remember...
```

## YAML Configuration

The server supports advanced configuration via `omni-config.yaml` in your working directory. This enables:

- **Auto-loading profiles** on startup
- **File filtering** with exclude/include patterns
- **Directory scanning** with depth control  
- **Custom naming patterns** for profiles
- **Logging control** for verbose output

### Example Configuration

```yaml
# Auto-load profiles on startup
autoLoad:
  profiles:
    - name: "lum"
      path: "./examples/lum-behavior.md"
      autoApply: true  # Note: See limitations below

# File scanning settings  
fileSettings:
  excludePatterns:
    - "*.tmp"
    - "node_modules/**"
  allowedExtensions:
    - ".md"
    - ".txt"

# Directory scanning
directoryScanning:
  recursive: true
  maxDepth: 3

# Logging
logging:
  level: "info"
  verboseFileLoading: true
```

See `omni-config.yaml.example` and files in `examples/` for more configuration options.

### Auto-Apply Limitations

**Important**: The `autoApply: true` setting has limitations due to MCP architecture:

- **Profiles are loaded but not automatically applied**: When the MCP server starts, it loads profiles marked with `autoApply: true` into memory, but cannot directly modify Claude's behavior.
- **Manual application required**: You must run `/use apply_claude_config <profile>` in Claude Code to actually apply the behavior.
- **MCP constraint**: MCP tools cannot directly modify Claude's system prompts or behavior - they can only return instructions that Claude chooses to follow.

To apply a profile after starting Claude Code:
```
/use apply_claude_config lum-behavior
```

This is a fundamental limitation of the MCP protocol, not a bug in the implementation.

## Development

### Project Structure

```
src/
├── index.ts                    # Main server class (slim orchestrator)
├── config/
│   ├── loader.ts              # Configuration loader (.mcp-config.json, YAML)
│   └── yaml-config.ts         # YAML configuration manager
├── tools/
│   └── handlers.ts            # MCP tool handlers (apply_claude_config, etc.)
├── resources/
│   └── handlers.ts            # MCP resource handlers (server info, profiles)
└── utils/
    ├── claude-config.ts       # CLAUDE.md file parser and manager
    ├── behavior-generator.ts  # Claude behavior instruction generator
    └── file-scanner.ts        # Directory scanning with pattern matching
```

### Architecture

The codebase follows a **modular architecture** with clear separation of concerns:

- **`index.ts`**: Slim orchestrator that initializes and coordinates all components
- **`config/`**: Configuration loading and management
- **`tools/`**: MCP tool implementations for Claude Code integration  
- **`resources/`**: MCP resource implementations for data exposure
- **`utils/`**: Shared utilities for configuration parsing and behavior generation

Each module is **independently testable** and has a **single responsibility**.

### Adding New Tools

1. Add tool definition to `src/tools/handlers.ts` in the tools array
2. Add case handler in `setupCallToolHandler()` method
3. Add tool implementation method
3. Create tests in `tests/` directory
4. Rebuild: `npm run build`

### Adding New Resources

1. Add resource definition to `src/resources/handlers.ts` in `setupListResourcesHandler()`
2. Add resource implementation to `src/resources/handlers.ts` in `setupReadResourceHandler()`
3. Create tests in `tests/` directory
4. Rebuild: `npm run build`

### Adding New Configuration Sources

1. Extend `src/config/loader.ts` to support new configuration formats
2. Update `src/utils/claude-config.ts` if new parsing logic is needed
3. Add corresponding tests in `tests/config-loader.test.ts`

## Testing

Run tests with Vitest:

```bash
# Install dependencies (if not already installed)
npm install

# Run all tests
npm test

# Run tests once (without watch mode)
npm test -- --run

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Test Structure

- `tests/claude-config.test.ts` - Unit tests for ClaudeConfigManager
- `tests/behavior-generator.test.ts` - Unit tests for BehaviorGenerator  
- `tests/config-loader.test.ts` - Unit tests for ConfigLoader
- `tests/config-loader-extended.test.ts` - Extended tests for YAML integration
- `tests/yaml-config.test.ts` - Unit tests for YamlConfigManager
- `tests/file-scanner.test.ts` - Unit tests for FileScanner
- `tests/tools-handlers.test.ts` - Unit tests for MCP tool handlers
- `tests/resources-handlers.test.ts` - Unit tests for MCP resource handlers
- `tests/index.test.ts` - Unit tests for OmniMCPServer main class
- `tests/integration.test.ts` - Integration tests for the complete system

All tests are written using **Vitest** with TypeScript support and provide comprehensive coverage of:
- CLAUDE.md file parsing and saving
- Configuration profile management
- YAML configuration loading and validation
- File scanning with pattern matching
- MCP tool handlers (`apply_claude_config`, `list_claude_configs`, `get_applied_config`)
- MCP resource handlers
- Integration between all components

**Test Coverage**: 89.66% (195 tests passing)

## Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Run the built server
- `npm run dev` - Run in development mode with tsx
- `npm test` - Run tests with Vitest
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:coverage` - Run tests with coverage report

## License

ISC