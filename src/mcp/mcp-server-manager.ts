import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import { MCPServerConfig } from '../config/source-config-manager';
import { SandboxedExecutor } from '../security/sandboxed-executor';
import { CommandValidator } from '../security/command-validator';
import { AuditLogger } from '../security/audit-logger';

const execAsync = promisify(exec);

export interface MCPServerInstance {
  name: string;
  config: MCPServerConfig;
  process: ChildProcess;
  client: MCPServerClient;
  status: 'starting' | 'running' | 'stopped' | 'error';
}

export class MCPServerClient {
  private process: ChildProcess;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private isInitialized = false;
  private protocolVersion = '2025-06-18';

  constructor(process: ChildProcess) {
    this.process = process;
    this.setupMessageHandling();
  }

  private setupMessageHandling() {
    this.process.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter((line: string) => line.trim());
      
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse MCP message:', line);
        }
      }
    });
  }

  private handleMessage(message: any) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message || 'MCP Server Error'));
      } else {
        resolve(message.result);
      }
    }
  }

  async initialize(): Promise<void> {
    const response = await this.request('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'omni-mcp-hub',
        version: '1.0.0'
      }
    });

    // Send initialized notification to complete handshake
    this.sendNotification('initialized', {});
    this.isInitialized = true;
    
    return response;
  }

  private sendNotification(method: string, params?: any): void {
    const message = {
      jsonrpc: '2.0',
      method,
      params: params || {}
    };
    this.process.stdin?.write(JSON.stringify(message) + '\n');
  }

  async ping(): Promise<any> {
    return this.request('ping', {});
  }

  async request(method: string, params?: any): Promise<any> {
    // Allow initialize and ping before initialization is complete
    if (!this.isInitialized && method !== 'initialize' && method !== 'ping') {
      throw new Error('MCP server not initialized. Call initialize() first.');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params: params || {}
      };

      this.process.stdin?.write(JSON.stringify(message) + '\n');
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for method: ${method}`));
        }
      }, 30000);
    });
  }

  async listTools() {
    return this.request('tools/list');
  }

  async callTool(name: string, arguments_: any) {
    return this.request('tools/call', { name, arguments: arguments_ });
  }
}

export class MCPServerManager {
  private servers = new Map<string, MCPServerInstance>();
  private sandboxedExecutor: SandboxedExecutor;
  private commandValidator: CommandValidator;
  private auditLogger: AuditLogger;

  constructor() {
    this.sandboxedExecutor = new SandboxedExecutor();
    this.commandValidator = new CommandValidator();
    this.auditLogger = AuditLogger.getInstance();
  }

  async initializeServers(configs: MCPServerConfig[] = []): Promise<void> {
    console.log(`Initializing ${configs.length} MCP servers...`);
    
    for (const config of configs) {
      try {
        if (config.enabled !== false) {
          await this.startServer(config);
        }
      } catch (error) {
        console.error(`Failed to initialize MCP server ${config.name}:`, error);
      }
    }
    
    console.log(`Initialized ${this.servers.size} MCP servers`);
  }

  async startServer(config: MCPServerConfig): Promise<MCPServerInstance> {
    if (config.enabled === false) {
      throw new Error(`Server ${config.name} is disabled`);
    }

    // Validate configuration security
    const configValidation = this.commandValidator.validateMCPServerConfig(config);
    if (!configValidation.allowed) {
      this.auditLogger.logConfigurationValidation(config, false, configValidation.reason);
      throw new Error(`Security validation failed for ${config.name}: ${configValidation.reason}`);
    }

    this.auditLogger.logConfigurationValidation(config, true);

    // Auto-install if needed (with security checks)
    if (config.install_command) {
      await this.ensureInstalledSecurely(config);
    }

    console.log(`Starting MCP server: ${config.name}`);
    
    // Prepare secure execution context
    const execution = {
      command: config.command,
      args: config.args || [],
      env: config.env,
      cwd: process.cwd(),
      requestId: `mcp-start-${config.name}-${Date.now()}`,
      source: 'mcp-server-manager'
    };

    // Execute with security sandbox
    const executionResult = await this.sandboxedExecutor.executeCommand(execution, {
      timeout: 60000, // 60 second timeout for startup
      maxMemory: 512, // 512MB memory limit
      allowNetworking: true, // MCP servers may need network access
      allowFileWrite: false, // Generally read-only for MCP servers
      restrictToPath: process.cwd()
    });

    if (!executionResult.success || !executionResult.process) {
      throw new Error(`Failed to start MCP server ${config.name}: ${executionResult.error}`);
    }

    const childProcess = executionResult.process;
    const client = new MCPServerClient(childProcess);
    
    const instance: MCPServerInstance = {
      name: config.name,
      config,
      process: childProcess,
      client,
      status: 'starting'
    };

    this.servers.set(config.name, instance);

    // Monitor the process for security compliance
    this.sandboxedExecutor.monitorProcess(childProcess, {
      maxMemory: 512,
      allowNetworking: true
    });

    // Handle process events
    childProcess.on('spawn', () => {
      console.log(`MCP server ${config.name} spawned successfully`);
      instance.status = 'running';
    });

    childProcess.on('error', (error) => {
      console.error(`MCP server ${config.name} error:`, error);
      instance.status = 'error';
      this.auditLogger.logCommandFailure(execution, error.message);
    });

    childProcess.on('exit', (code) => {
      console.log(`MCP server ${config.name} exited with code ${code}`);
      instance.status = 'stopped';
      this.servers.delete(config.name);
    });

    // Wait a bit for the server to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Initialize MCP connection
    try {
      await client.initialize();
      console.log(`MCP server ${config.name} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize MCP server ${config.name}:`, error);
      // Continue anyway - some servers might not support full MCP protocol
    }

    return instance;
  }

  async stopServer(name: string): Promise<void> {
    const instance = this.servers.get(name);
    if (!instance) {
      throw new Error(`Server ${name} not found`);
    }

    instance.process.kill();
    this.servers.delete(name);
  }

  async stopAllServers(): Promise<void> {
    const stopPromises = Array.from(this.servers.keys()).map(name => this.stopServer(name));
    await Promise.all(stopPromises);
  }

  getServer(name: string): MCPServerInstance | undefined {
    return this.servers.get(name);
  }

  getAllServers(): MCPServerInstance[] {
    return Array.from(this.servers.values());
  }

  async getAllTools(): Promise<any[]> {
    const allTools: any[] = [];
    
    for (const instance of this.servers.values()) {
      if (instance.status === 'running') {
        try {
          const result = await instance.client.listTools();
          if (result.tools) {
            // Prefix tool names with server name to avoid conflicts
            const prefixedTools = result.tools.map((tool: any) => ({
              ...tool,
              name: `${instance.name}__${tool.name}`,
              _server: instance.name,
              _originalName: tool.name
            }));
            allTools.push(...prefixedTools);
          }
        } catch (error) {
          console.error(`Failed to get tools from ${instance.name}:`, error);
        }
      }
    }
    
    return allTools;
  }

  async callTool(toolName: string, arguments_: any): Promise<any> {
    // Parse server name from prefixed tool name
    const parts = toolName.split('__');
    if (parts.length !== 2) {
      throw new Error(`Invalid tool name format: ${toolName}`);
    }
    
    const [serverName, originalToolName] = parts;
    const instance = this.servers.get(serverName);
    
    if (!instance) {
      throw new Error(`Server ${serverName} not found`);
    }
    
    if (instance.status !== 'running') {
      throw new Error(`Server ${serverName} is not running`);
    }
    
    return instance.client.callTool(originalToolName, arguments_);
  }

  private async ensureInstalledSecurely(config: MCPServerConfig): Promise<void> {
    if (!config.install_command) {
      return;
    }

    console.log(`Checking if MCP server ${config.name} is installed...`);
    
    // Parse and validate install command
    const installParts = config.install_command.split(' ');
    const installCommand = installParts[0];
    const installArgs = installParts.slice(1);

    // Validate install command security
    const installExecution = {
      command: installCommand,
      args: installArgs,
      cwd: process.cwd(),
      requestId: `mcp-install-${config.name}-${Date.now()}`,
      source: 'mcp-server-manager'
    };

    const installValidation = this.commandValidator.validateCommand(installExecution);
    if (!installValidation.allowed) {
      throw new Error(`Install command validation failed for ${config.name}: ${installValidation.reason}`);
    }

    try {
      // Try to check if the command is available (securely)
      const checkCommand = this.getCheckCommand(config);
      const checkParts = checkCommand.split(' ');
      const checkExecution = {
        command: checkParts[0],
        args: checkParts.slice(1),
        cwd: process.cwd(),
        requestId: `mcp-check-${config.name}-${Date.now()}`,
        source: 'mcp-server-manager'
      };

      // Execute check command securely
      const checkResult = await this.sandboxedExecutor.executeCommand(checkExecution, {
        timeout: 10000, // 10 second timeout for check
        maxMemory: 128, // 128MB memory limit
        allowNetworking: false,
        allowFileWrite: false
      });

      if (checkResult.success) {
        console.log(`MCP server ${config.name} is already installed`);
        return;
      }
    } catch (error) {
      console.log(`MCP server ${config.name} not found, installing...`);
    }

    try {
      console.log(`Running install command: ${config.install_command}`);
      
      // Execute install command securely
      const installResult = await this.sandboxedExecutor.executeCommand(installExecution, {
        timeout: 300000, // 5 minute timeout for installation
        maxMemory: 1024, // 1GB memory limit for installation
        allowNetworking: true, // Installations typically need network access
        allowFileWrite: true // Installations need to write files
      });

      if (!installResult.success) {
        throw new Error(installResult.error || 'Installation failed');
      }

      console.log(`Successfully installed MCP server: ${config.name}`);
    } catch (error) {
      console.error(`Failed to install MCP server ${config.name}:`, error);
      this.auditLogger.logCommandFailure(installExecution, error instanceof Error ? error.toString() : String(error));
      throw new Error(`Installation failed for ${config.name}: ${error}`);
    }
  }

  private getCheckCommand(config: MCPServerConfig): string {
    // For different package managers, use different check commands
    if (config.install_command?.includes('pip install')) {
      const packageName = this.extractPackageName(config.install_command, 'pip install');
      return `python -c "import ${packageName.replace('-', '_')}"`;
    } else if (config.install_command?.includes('uvx install')) {
      const packageName = this.extractPackageName(config.install_command, 'uvx install');
      return `uvx --help ${packageName}`;
    } else if (config.install_command?.includes('npm install')) {
      const packageName = this.extractPackageName(config.install_command, 'npm install');
      return `npm list ${packageName}`;
    } else {
      // Generic check - try running the command with --help
      return `${config.command} --help`;
    }
  }

  private extractPackageName(installCommand: string, prefix: string): string {
    const parts = installCommand.split(' ');
    const prefixParts = prefix.split(' ');
    const startIndex = parts.findIndex((part, index) => 
      prefixParts.every((prefixPart, prefixIndex) => 
        parts[index + prefixIndex] === prefixPart
      )
    );
    
    if (startIndex >= 0 && startIndex + prefixParts.length < parts.length) {
      return parts[startIndex + prefixParts.length];
    }
    
    throw new Error(`Could not extract package name from: ${installCommand}`);
  }
}