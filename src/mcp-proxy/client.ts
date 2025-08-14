import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ChildProcess } from "child_process";
import * as path from 'path';
import {
  Tool,
  Resource,
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";

export interface ExternalServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
}

export class MCPProxyClient {
  private client: Client;
  private transport: StdioClientTransport;
  private process: ChildProcess | null = null;
  private config: ExternalServerConfig;
  private connected: boolean = false;
  private tools: Tool[] = [];
  private resources: Resource[] = [];

  constructor(config: ExternalServerConfig) {
    this.config = config;
    this.client = new Client(
      {
        name: `omni-proxy-${config.name}`,
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
    // Filter out undefined values from environment
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...process.env, ...(config.env || {}) })) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }
    
    // Convert relative paths in args to absolute paths
    const resolvedArgs = (config.args || []).map(arg => {
      if (arg.endsWith('.js') && !arg.startsWith('/')) {
        const resolved = path.resolve(process.cwd(), arg);
        console.error(`Resolved external server arg: ${arg} -> ${resolved}`);
        return resolved;
      }
      return arg;
    });
    
    this.transport = new StdioClientTransport({
      command: config.command,
      args: resolvedArgs,
      env: cleanEnv,
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.client.connect(this.transport);
      this.connected = true;
      console.error(`Connected to external MCP server: ${this.config.name}`);
      
      // Fetch available tools and resources
      await this.fetchCapabilities();
    } catch (error) {
      console.error(`Failed to connect to ${this.config.name}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
      console.error(`Disconnected from external MCP server: ${this.config.name}`);
    } catch (error) {
      console.error(`Error disconnecting from ${this.config.name}:`, error);
    } finally {
      this.connected = false;
    }
  }

  private async fetchCapabilities(): Promise<void> {
    try {
      // Fetch tools
      const toolsResponse = await this.client.listTools();
      this.tools = toolsResponse.tools.map(tool => ({
        ...tool,
        name: `${this.config.name}__${tool.name}`, // Prefix with server name to avoid conflicts
      }));

      // Fetch resources
      const resourcesResponse = await this.client.listResources();
      this.resources = resourcesResponse.resources.map(resource => ({
        ...resource,
        uri: `${this.config.name}://${resource.uri}`, // Prefix URI with server name
      }));

      console.error(`Loaded ${this.tools.length} tools and ${this.resources.length} resources from ${this.config.name}`);
    } catch (error) {
      console.error(`Error fetching capabilities from ${this.config.name}:`, error);
    }
  }

  getTools(): Tool[] {
    return this.tools;
  }

  getResources(): Resource[] {
    return this.resources;
  }

  async callTool(name: string, args: unknown): Promise<CallToolResult> {
    if (!this.connected) {
      throw new Error(`Not connected to ${this.config.name}`);
    }

    // Remove server prefix from tool name
    const originalName = name.replace(`${this.config.name}__`, "");
    
    try {
      const result = await this.client.callTool({ name: originalName, arguments: args as Record<string, unknown> });
      return result as CallToolResult;
    } catch (error) {
      console.error(`Error calling tool ${originalName} on ${this.config.name}:`, error);
      throw error;
    }
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    if (!this.connected) {
      throw new Error(`Not connected to ${this.config.name}`);
    }

    // Remove server prefix from URI
    const originalUri = uri.replace(`${this.config.name}://`, "");
    
    try {
      const result = await this.client.readResource({ uri: originalUri });
      return result;
    } catch (error) {
      console.error(`Error reading resource ${originalUri} from ${this.config.name}:`, error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getServerName(): string {
    return this.config.name;
  }
}