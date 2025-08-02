# GitHub Sources Example

This example demonstrates how to aggregate documentation from multiple GitHub repositories.

## Features

- **Repository Documentation**: Fetch README files and documentation from GitHub repos
- **Branch Specification**: Configure specific branches to track
- **Token Authentication**: Secure access to private repositories
- **Pattern Matching**: Filter files by patterns (*.md, docs/**/*.md)

## Environment Variables

Set these environment variables:

```bash
export GITHUB_TOKEN="your_github_personal_access_token"
export PORT=3000  # Optional, defaults to 3000
```

## Configuration

The configuration fetches documentation from:
- Claude Code Engineering Guide - Best practices and patterns for Claude Code development

## Usage

### Docker Deployment
```bash
# 1. Setup environment
cp .env.example .env
# Edit .env and add your GitHub token

# 2. Start with Docker Compose
docker-compose -f ../docker-compose.yml up -d

# 3. Configure Claude Desktop (see ../README.md for details)
```

### Alternative: Direct Docker Run
```bash
docker build -t omni-mcp-hub -f ../Dockerfile ../../..
docker run -d \
  --name omni-mcp-hub \
  -p 3000:3000 \
  -v $(pwd)/mcp-sources.yaml:/app/mcp-sources.yaml:ro \
  -e GITHUB_TOKEN=${GITHUB_TOKEN} \
  omni-mcp-hub
```

## Available Data

After setup, you'll have access to:
- Claude Code engineering best practices
- Development patterns and guidelines
- Code examples and templates
- Documentation for effective Claude Code usage