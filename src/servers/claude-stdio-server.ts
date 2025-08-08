#!/usr/bin/env node
/**
 * Claude Code stdio server entry point
 * Command line interface for SimpleStdioServer
 */

// Suppress punycode deprecation warning
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && 
      warning.message.includes('punycode')) {
    return;
  }
  console.warn(warning);
});

import path from "path";
import { SimpleStdioServer } from "./simple-stdio-server";
import { SourceConfigManager } from "../config/source-config-manager";

interface ParsedArgs {
  config: string;
  logLevel: "info" | "debug" | "warn" | "error";
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { 
    config: "", 
    logLevel: "info" 
  };
  
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) { 
      args.config = path.resolve(argv[i + 1]); 
      i++; 
    } else if (argv[i] === "--log-level" && argv[i + 1]) { 
      args.logLevel = argv[i + 1] as any; 
      i++; 
    }
  }
  
  return args;
}

async function main() {
  const { config, logLevel } = parseArgs(process.argv.slice(2));
  
  // Set environment variables for SourceConfigManager
  if (config) {
    process.env.CONFIG_PATH = config;     // Primary - SourceConfigManager priority
    process.env.CONFIG_FILE = config;     // Backward compatibility
    console.log(`Loading configuration from: ${config}`);
  }
  
  process.env.MCP_MODE = "stdio";
  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  process.env.LOG_LEVEL = logLevel;

  try {
    // Load configuration and create server
    const configManager = new SourceConfigManager();
    const cfg = configManager.load(config || undefined);
    
    const server = new SimpleStdioServer();
    await server.start(); // stdin/stdout wait
  } catch (error) {
    console.error('Failed to start stdio server:', error);
    process.exit(1);
  }
}

// Only run main when directly executed
if (require.main === module) {
  main().catch(err => {
    console.error('Startup error:', err);
    process.exit(1);
  });
}