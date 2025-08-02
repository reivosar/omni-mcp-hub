# MCP Servers Example

This example demonstrates pure MCP server aggregation without documentation sources.

## Features

- **Research**: ArXiv papers, academic search
- **File Operations**: Filesystem access, file management  
- **Web**: Browser automation, web scraping
- **Data**: Database operations, SQLite access
- **Development**: Git operations, code analysis
- **Time**: Scheduling and time management

## Tool Naming

Each server's tools are prefixed with the server name to avoid conflicts:

- `arxiv__search_papers` - Search academic papers
- `filesystem__read_file` - Read files from disk
- `browser__navigate` - Navigate web pages
- `sqlite__query` - Execute SQL queries
- `git__commit` - Git operations
- `time__get_current_time` - Time operations

## Auto-Installation

The configuration automatically installs required packages:
- **pip**: `arxiv-mcp-server`, `mcp-server-browser`, `mcp-server-sqlite`, `mcp-server-git`
- **npm**: `@modelcontextprotocol/server-filesystem`
- **uvx**: `mcp-server-time`

## Environment Variables

Set these environment variables for full functionality:

```bash
export ARXIV_API_KEY="your_arxiv_key"
export DATABASE_PATH="/path/to/database.db"
export ALLOWED_PATHS="/tmp,/home/user/data"
export GIT_USER_NAME="Your Name"
export GIT_USER_EMAIL="your.email@example.com"
export PORT=3000  # Optional, defaults to 3000
```

## Security

The configuration includes:
- Content validation for malicious patterns
- File size limits
- Path restrictions for filesystem access
- Environment variable substitution for sensitive data

## Usage

### Docker Deployment
```bash
# 1. Start with Docker Compose (auto-installs MCP servers)
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
  -e ARXIV_API_KEY=${ARXIV_API_KEY} \
  -e DATABASE_PATH=/app/data/database.db \
  omni-mcp-hub
```

### Requirements
The Docker container automatically installs MCP servers via:
- pip packages: `arxiv-mcp-server`, `mcp-server-browser`, etc.
- npm packages: `@modelcontextprotocol/server-filesystem`
- uvx packages: `mcp-server-time`

## Available Capabilities

After setup, you'll have unified access to:
- Academic paper search and retrieval
- File system operations with safety controls
- Web browsing and data extraction  
- Database queries and management
- Git repository operations
- Time and scheduling functions

## Example Commands

Once configured, you can use these tools through Claude:
- Search papers: "Search arxiv for machine learning papers"
- File operations: "Read the contents of /tmp/data.txt"
- Web browsing: "Navigate to example.com and extract the title"
- Database queries: "Query the users table in the database"
- Git operations: "Create a new commit with these changes"