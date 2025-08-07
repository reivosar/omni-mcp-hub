# Mixed Resources Docker Configuration

This configuration combines multiple source types in a single Docker setup:

## Sources Included

- **GitHub repositories**: reivosar/claude-code-engineering-guide (public repo)
- **Local directories**: /documents, /projects
- **MCP servers**: 
  - filesystem server for file operations

## Usage

1. Mount your local directories to /projects and /documents
2. Use mcp-sources.yaml for unified access to all resources

## Docker Run

```bash
docker run -v /path/to/projects:/projects:ro -v /path/to/documents:/documents:ro -v /path/to/data:/app/data omni-mcp-hub
```