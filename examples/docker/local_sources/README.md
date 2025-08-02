# Local Sources Example

This example demonstrates how to aggregate documentation from local filesystem directories.

## Features

- **Local File Access**: Read documentation from filesystem paths
- **Multiple Directories**: Configure multiple source directories
- **Pattern Matching**: Filter files by extensions and patterns
- **Environment Variables**: Flexible path configuration

## Environment Variables

Set these environment variables to customize paths:

```bash
export PROJECTS_PATH="/home/user/projects"
export DOCS_PATH="/usr/local/docs"  
export WORKSPACE_PATH="/workspace"
export PORT=3000  # Optional, defaults to 3000
```

## Configuration

The configuration reads documentation from:
- Current directory (`./`)
- User's projects directory
- System documentation directory
- Workspace directory

## File Patterns

Includes these file types:
- `CLAUDE.md` - Claude-specific documentation
- `README.md` - Project documentation
- `*.md` - All Markdown files
- `docs/**/*.md` - Documentation directory
- `**/*.txt` - Text files
- `CHANGELOG.md` - Change logs
- `CONTRIBUTING.md` - Contribution guides

## Usage

### Docker Deployment
```bash
# 1. Start with Docker Compose
docker-compose -f ../docker-compose.yml up -d

# 2. Configure Claude Desktop (see ../README.md for details)
```

### Alternative: Direct Docker Run
```bash
docker build -t omni-mcp-hub -f ../Dockerfile ../../..
docker run -d \
  --name omni-mcp-hub \
  -p 3000:3000 \
  -v $(pwd)/mcp-sources.yaml:/app/mcp-sources.yaml:ro \
  -v ${HOME}/projects:/projects:ro \
  omni-mcp-hub
```

### Testing with Sample Project
The `sample-project` directory contains example documentation files.
Mount this directory to test local source aggregation:
```bash
-v $(pwd)/sample-project:/sample-project:ro
```

## Available Data

After setup, you'll have access to:
- Local project documentation
- Development notes and guides
- Configuration files and examples
- Personal documentation and notes