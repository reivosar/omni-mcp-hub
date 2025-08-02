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

1. Set environment variables
2. Copy configuration: `cp examples/github_sources/mcp-sources.yaml ./`
3. Start server: `npm start`
4. Add to Claude: `claude mcp add omni-mcp-hub`

## Available Data

After setup, you'll have access to:
- Claude Code engineering best practices
- Development patterns and guidelines
- Code examples and templates
- Documentation for effective Claude Code usage