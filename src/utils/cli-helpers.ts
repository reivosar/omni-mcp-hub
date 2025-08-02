#!/usr/bin/env node

import { SourceConfigManager } from '../config/source-config-manager';

/**
 * CLI help utility for showing configuration examples
 */
export class CLIHelpers {
  static showConfigExamples(): void {
    console.log(SourceConfigManager.getConfigExamples());
  }
  
  static showAutoDetectionHelp(): void {
    console.log(`
🚀 Auto-detection feature for path specification

# Traditional method (detailed specification)
sources:
  - type: github
    owner: microsoft
    repo: vscode
    branch: main
    token: \${GITHUB_TOKEN}
    
  - type: local
    path: /Users/mac/my-project

# New feature: Auto-detection with URL specification
sources:
  - url: https://github.com/microsoft/vscode
    token: \${GITHUB_TOKEN}
    
  - url: microsoft/vscode@main
    token: \${GITHUB_TOKEN}
    
  - url: github:microsoft/vscode@develop
    token: \${GITHUB_TOKEN}
    
  - url: /Users/mac/my-project
  
  - url: ./relative/path
  
  - url: file:///absolute/path

# Supported formats:
GitHub:
  ✓ https://github.com/owner/repo
  ✓ https://github.com/owner/repo/tree/branch
  ✓ https://github.com/owner/repo/blob/branch
  ✓ github:owner/repo@branch
  ✓ owner/repo@branch
  ✓ owner/repo (default branch: main)

Local:
  ✓ /absolute/path
  ✓ ./relative/path
  ✓ ../parent/path
  ✓ file:///file/protocol/path
  ✓ C:\\Windows\\Path (Windows)

# Benefits:
- More concise configuration
- Easy to copy and paste
- Direct use of GitHub URLs
- Backward compatibility with traditional format
`);
  }
  
  static validateConfigUrl(url: string): void {
    try {
      const configLoader = new SourceConfigManager();
      // Any cast to access private method
      const result = (configLoader as any).parseSourceUrl(url);
      
      console.log(`✅ URL parsing successful: ${url}`);
      console.log(`   Type: ${result.type}`);
      
      if (result.type === 'github') {
        console.log(`   Owner: ${result.owner}`);
        console.log(`   Repo: ${result.repo}`);
        console.log(`   Branch: ${result.branch}`);
      } else if (result.type === 'local') {
        console.log(`   Path: ${result.path}`);
      }
    } catch (error) {
      console.error(`❌ URL parsing error: ${url}`);
      console.error(`   ${error instanceof Error ? error.message : error}`);
    }
  }
}

// CLI execution handler
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'examples':
    case 'help':
      CLIHelpers.showConfigExamples();
      break;
      
    case 'autodetect':
    case 'auto':
      CLIHelpers.showAutoDetectionHelp();
      break;
      
    case 'validate':
      if (args[1]) {
        CLIHelpers.validateConfigUrl(args[1]);
      } else {
        console.error('Usage: npm run cli validate <url>');
        process.exit(1);
      }
      break;
      
    default:
      console.log(`
Omni MCP Hub CLI Helper

Usage:
  npm run cli examples    - Show configuration examples
  npm run cli auto       - Show auto-detection help
  npm run cli validate <url> - Validate URL format

Examples:
  npm run cli validate "https://github.com/microsoft/vscode"
  npm run cli validate "microsoft/typescript@main"
  npm run cli validate "/Users/mac/my-project"
`);
      break;
  }
}