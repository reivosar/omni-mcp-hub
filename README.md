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

## Quick Start

**たった1コマンドで起動：**

```bash
./examples/start.sh
```

これだけで以下を自動実行：
1. 依存関係インストール（初回のみ `npm install` が必要）
2. プロジェクトビルド
3. Claude Code MCP設定
4. MCPサーバー起動

**Claude Code側での操作：**
1. 新しいターミナルで `claude` を実行
2. テストコマンド実行：
   ```
   /use add a:5 b:3
   /use echo message:"Hello MCP!"
   ```

## Available Tools

### Basic Tools
- **add**: Add two numbers together
- **echo**: Echo back a message

### CLAUDE.md Management Tools
- **load_claude_config**: Load and activate a CLAUDE.md configuration file
- **get_claude_behavior**: Get the current Claude behavior configuration
- **update_claude_config**: Update Claude configuration and save to file
- **list_claude_profiles**: List all loaded Claude configuration profiles  
- **find_claude_files**: Find CLAUDE.md files in a directory
- **apply_claude_behavior**: Apply a loaded configuration to modify Claude's behavior

## Available Resources

- **info://server**: Server information
- **greeting://world**: A greeting message
- **claude://profile/{name}**: Dynamic resources for each loaded CLAUDE.md profile

## CLAUDE.md Configuration

### キャラクター設定の切り替え

```bash
# ラムちゃんモード（だっちゃ〜♪）
/use load_claude_config filePath:"./examples/lum-behavior.md" profileName:"lum"
/use apply_claude_behavior profileName:"lum"

# 海賊モード（Arrr! Ahoy matey!）
/use load_claude_config filePath:"./examples/pirate-behavior.md" profileName:"pirate"
/use apply_claude_behavior profileName:"pirate"

# 関西弁モード（〜やで、〜やんか）
/use load_claude_config filePath:"./examples/special-behavior.md" profileName:"kansai"
/use apply_claude_behavior profileName:"kansai"
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

## Development

### Project Structure

```
src/
├── index.ts                    # Main server class (slim orchestrator)
├── config/
│   └── loader.ts              # Initial configuration loader (.mcp-config.json)
├── tools/
│   └── handlers.ts            # MCP tool handlers (load_claude_config, etc.)
├── resources/
│   └── handlers.ts            # MCP resource handlers (server info, profiles)
└── utils/
    ├── claude-config.ts       # CLAUDE.md file parser and manager
    └── behavior-generator.ts  # Claude behavior instruction generator
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

1. Add tool definition to `src/tools/handlers.ts` in `setupListToolsHandler()`
2. Add tool implementation to `src/tools/handlers.ts` in `setupCallToolHandler()`
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
- `tests/index.test.ts` - Unit tests for OmniMCPServer main class
- `tests/integration.test.ts` - Integration tests for the complete system

All tests are written using **Vitest** with TypeScript support and provide comprehensive coverage of:
- CLAUDE.md file parsing and saving
- Configuration profile management
- MCP server tool handlers
- Integration between all components

## Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Run the built server
- `npm run dev` - Run in development mode with tsx
- `npm test` - Run tests with Vitest
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:coverage` - Run tests with coverage report

## License

ISC