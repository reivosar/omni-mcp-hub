import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ChildProcess } from "child_process";
import * as path from "path";
import {
  Tool,
  Resource,
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { ILogger, SilentLogger } from "../utils/logger.js";

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
  private logger: ILogger;

  constructor(config: ExternalServerConfig, logger?: ILogger) {
    this.config = config;
    this.logger = logger || new SilentLogger();
    this.client = new Client(
      {
        name: `omni-proxy-${config.name}`,
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries({
      ...process.env,
      ...(config.env || {}),
    })) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }

    const resolvedArgs = (config.args || []).map((arg) => {
      if (arg.endsWith(".js") && !arg.startsWith("/")) {
        const resolved = path.resolve(process.cwd(), arg);
        this.logger.debug(
          `Resolved external server arg: ${arg} -> ${resolved}`,
        );
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
      this.logger.debug(
        `Connected to external MCP server: ${this.config.name}`,
      );

      await this.fetchCapabilities();
    } catch (error) {
      this.logger.debug(`Failed to connect to ${this.config.name}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
      this.logger.debug(
        `Disconnected from external MCP server: ${this.config.name}`,
      );
    } catch (error) {
      this.logger.debug(`Error disconnecting from ${this.config.name}:`, error);
    } finally {
      this.connected = false;
    }
  }

  private async fetchCapabilities(): Promise<void> {
    try {
      const toolsResponse = await this.client.listTools();
      this.tools = toolsResponse.tools.map((tool) => ({
        ...tool,
        name: `${this.config.name}__${tool.name}`, // Prefix with server name to avoid conflicts
      }));

      const resourcesResponse = await this.client.listResources();
      this.resources = resourcesResponse.resources.map((resource) => ({
        ...resource,
        uri: `${this.config.name}://${resource.uri}`, // Prefix URI with server name
      }));

      this.logger.debug(
        `Loaded ${this.tools.length} tools and ${this.resources.length} resources from ${this.config.name}`,
      );
    } catch (error) {
      this.logger.debug(
        `Error fetching capabilities from ${this.config.name}:`,
        error,
      );
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

    const originalName = name.replace(`${this.config.name}__`, "");

    try {
      const result = await this.client.callTool({
        name: originalName,
        arguments: args as { [x: string]: unknown },
      });
      return result as CallToolResult;
    } catch (error) {
      this.logger.debug(
        `Error calling tool ${originalName} on ${this.config.name}:`,
        error,
      );
      throw error;
    }
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    if (!this.connected) {
      throw new Error(`Not connected to ${this.config.name}`);
    }

    const originalUri = uri.replace(`${this.config.name}://`, "");

    try {
      const result = await this.client.readResource({ uri: originalUri });
      return result;
    } catch (error) {
      this.logger.debug(
        `Error reading resource ${originalUri} from ${this.config.name}:`,
        error,
      );
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
