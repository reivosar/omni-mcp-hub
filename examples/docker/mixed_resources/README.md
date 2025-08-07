# Mixed Resources Docker Configuration

This configuration combines multiple source types in a single Docker setup:

## Sources Included

- **GitHub repositories**: reivosar/claude-code-engineering-guide (public repo)
- **Local directories**: /app/repos/documents, /app/repos/projects, /app/workspace  
- **MCP servers**: 
  - filesystem server for file operations
  - sqlite server for database queries
  - puppeteer server for web automation

## Usage

1. Mount your local directories to /app/repos and /app/workspace
2. Use mcp-sources.yaml for unified access to all resources

## Docker Run

```bash
docker run -v /path/to/local:/app/repos -v /path/to/workspace:/app/workspace -v /path/to/data:/app/data omni-mcp-hub
```