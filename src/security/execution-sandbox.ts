/**
 * Profile Execution Sandbox
 * Provides isolated execution environment for profiles with resource limits
 */

import * as vm from "vm";
import * as fs from "fs/promises";
import * as path from "path";
import { Worker } from "worker_threads";
import { EventEmitter } from "events";
import { ILogger, SilentLogger } from "../utils/logger.js";

export interface SandboxOptions {
  timeoutMs?: number;
  memoryLimitMB?: number;
  maxFileSize?: number;
  allowedModules?: string[];
  blockedModules?: string[];
  allowFileSystem?: boolean;
  allowNetwork?: boolean;
  allowChildProcess?: boolean;
  maxConcurrentTasks?: number;
  enableLogging?: boolean;
}

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTimeMs: number;
  memoryUsedMB: number;
  warnings: string[];
  securityViolations: string[];
}

export interface SandboxContext {
  console: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
  };
  setTimeout: typeof setTimeout;
  setInterval: typeof setInterval;
  clearTimeout: typeof clearTimeout;
  clearInterval: typeof clearInterval;
  Buffer: typeof Buffer;
  process: {
    env: Record<string, string | undefined>;
    cwd: () => string;
    platform: string;
    version: string;
  };
  require?: (id: string) => unknown;
  exports: Record<string, unknown>;
  module: { exports: Record<string, unknown> };
  __filename: string;
  __dirname: string;
}

const DEFAULT_OPTIONS: Required<SandboxOptions> = {
  timeoutMs: 30000, // 30 seconds
  memoryLimitMB: 128, // 128MB
  maxFileSize: 1024 * 1024, // 1MB
  allowedModules: ["path", "crypto", "util", "events", "stream"],
  blockedModules: [
    "fs",
    "child_process",
    "cluster",
    "dgram",
    "dns",
    "http",
    "https",
    "net",
    "os",
    "tls",
    "url",
    "v8",
    "vm",
    "worker_threads",
  ],
  allowFileSystem: false,
  allowNetwork: false,
  allowChildProcess: false,
  maxConcurrentTasks: 5,
  enableLogging: true,
};

export class ExecutionSandbox extends EventEmitter {
  private options: Required<SandboxOptions>;
  private logger: ILogger;
  private activeTasks: Set<string> = new Set();
  private moduleCache: Map<string, unknown> = new Map();

  constructor(options?: SandboxOptions, logger?: ILogger) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = logger || new SilentLogger();
  }

  /**
   * Execute code in sandboxed VM context
   */
  async executeInVM(
    code: string,
    filename: string = "sandbox.js",
    context?: Partial<SandboxContext>,
  ): Promise<ExecutionResult> {
    const taskId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    const warnings: string[] = [];
    const securityViolations: string[] = [];

    if (this.activeTasks.size >= this.options.maxConcurrentTasks) {
      return {
        success: false,
        error: "Maximum concurrent tasks limit exceeded",
        executionTimeMs: 0,
        memoryUsedMB: 0,
        warnings,
        securityViolations: ["Concurrent task limit exceeded"],
      };
    }

    this.activeTasks.add(taskId);

    try {
      const codeAnalysis = this.analyzeCode(code);
      if (codeAnalysis.violations.length > 0) {
        securityViolations.push(...codeAnalysis.violations);

        if (codeAnalysis.critical) {
          return {
            success: false,
            error: "Code contains critical security violations",
            executionTimeMs: Date.now() - startTime,
            memoryUsedMB: 0,
            warnings,
            securityViolations,
          };
        }
      }

      const sandboxContext = this.createSandboxContext(filename, context);

      const vmContext = vm.createContext(sandboxContext);

      const initialMemory = process.memoryUsage().heapUsed;

      let result: unknown;
      let error: string | undefined;
      let success = true;

      try {
        result = await Promise.race([
          this.executeWithMemoryLimit(code, vmContext, filename),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Execution timeout")),
              this.options.timeoutMs,
            ),
          ),
        ]);
      } catch (err: unknown) {
        success = false;
        error = (err as Error).message || "Unknown execution error";

        if ((err as Error).message?.includes("timeout")) {
          securityViolations.push("Execution timeout exceeded");
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryUsedMB = (finalMemory - initialMemory) / (1024 * 1024);

      if (memoryUsedMB > this.options.memoryLimitMB) {
        warnings.push(
          `Memory usage (${memoryUsedMB.toFixed(2)}MB) exceeded limit (${this.options.memoryLimitMB}MB)`,
        );
      }

      const executionResult: ExecutionResult = {
        success,
        result,
        error,
        executionTimeMs: Date.now() - startTime,
        memoryUsedMB,
        warnings,
        securityViolations,
      };

      this.emit("execution-complete", {
        taskId,
        filename,
        result: executionResult,
      });

      return executionResult;
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Execute code in isolated worker thread
   */
  async executeInWorker(
    code: string,
    filename: string = "worker.js",
  ): Promise<ExecutionResult> {
    const taskId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    const warnings: string[] = [];
    const securityViolations: string[] = [];

    if (this.activeTasks.size >= this.options.maxConcurrentTasks) {
      return {
        success: false,
        error: "Maximum concurrent tasks limit exceeded",
        executionTimeMs: 0,
        memoryUsedMB: 0,
        warnings,
        securityViolations: ["Concurrent task limit exceeded"],
      };
    }

    this.activeTasks.add(taskId);

    return new Promise((resolve) => {
      const workerScript = `
        const { parentPort } = require('worker_threads');
        const vm = require('vm');
        
        const sandboxContext = {
          console: {
            log: (...args) => parentPort.postMessage({type: 'log', args}),
            error: (...args) => parentPort.postMessage({type: 'error', args}),
            warn: (...args) => parentPort.postMessage({type: 'warn', args}),
            info: (...args) => parentPort.postMessage({type: 'info', args})
          },
          setTimeout,
          clearTimeout,
          setInterval,
          clearInterval,
          Buffer,
          process: {
            env: ${JSON.stringify(process.env)},
            cwd: () => process.cwd(),
            platform: '${process.platform}',
            version: '${process.version}'
          }
        };
        
        try {
          const result = vm.runInNewContext(\`${code.replace(/`/g, "\\`")}\`, sandboxContext, {
            filename: '${filename}',
            timeout: ${this.options.timeoutMs}
          });
          parentPort.postMessage({type: 'result', data: result});
        } catch (error) {
          parentPort.postMessage({type: 'error', data: error.message});
        }
      `;

      const worker = new Worker(workerScript, { eval: true });
      let result: unknown;
      let error: string | undefined;
      let success = true;
      const logs: string[] = [];

      worker.on("message", (message) => {
        switch (message.type) {
          case "result":
            result = message.data;
            break;
          case "error":
            success = false;
            error = message.data;
            break;
          case "log":
          case "warn":
          case "info":
            logs.push(
              JSON.stringify({ type: message.type, args: message.args }),
            );
            break;
        }
      });

      worker.on("error", (err) => {
        success = false;
        error = err.message;
        securityViolations.push("Worker execution error");
      });

      worker.on("exit", (code) => {
        this.activeTasks.delete(taskId);

        if (code !== 0 && success) {
          success = false;
          error = `Worker exited with code ${code}`;
        }

        const executionResult: ExecutionResult = {
          success,
          result,
          error,
          executionTimeMs: Date.now() - startTime,
          memoryUsedMB: 0, // Worker memory usage is separate
          warnings,
          securityViolations,
        };

        this.emit("execution-complete", {
          taskId,
          filename,
          result: executionResult,
          logs,
        });

        resolve(executionResult);
      });

      setTimeout(() => {
        worker.terminate();
        if (this.activeTasks.has(taskId)) {
          this.activeTasks.delete(taskId);
          resolve({
            success: false,
            error: "Worker execution timeout",
            executionTimeMs: Date.now() - startTime,
            memoryUsedMB: 0,
            warnings,
            securityViolations: ["Worker execution timeout"],
          });
        }
      }, this.options.timeoutMs + 1000);
    });
  }

  /**
   * Execute profile file with sandboxing
   */
  async executeProfile(
    profilePath: string,
    context?: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    try {
      const resolvedPath = path.resolve(profilePath);

      if (
        !resolvedPath.endsWith(".js") &&
        !resolvedPath.endsWith(".mjs") &&
        !resolvedPath.endsWith(".md")
      ) {
        return {
          success: false,
          error: "Invalid profile file type",
          executionTimeMs: 0,
          memoryUsedMB: 0,
          warnings: [],
          securityViolations: ["Invalid file type"],
        };
      }

      const stats = await fs.stat(resolvedPath);
      if (stats.size > this.options.maxFileSize) {
        return {
          success: false,
          error: "Profile file too large",
          executionTimeMs: 0,
          memoryUsedMB: 0,
          warnings: [],
          securityViolations: [
            `File size (${stats.size}) exceeds limit (${this.options.maxFileSize})`,
          ],
        };
      }

      const content = await fs.readFile(resolvedPath, "utf-8");

      if (resolvedPath.endsWith(".md")) {
        const jsCode = this.extractJavaScriptFromMarkdown(content);
        if (!jsCode) {
          return {
            success: true,
            result: content, // Return markdown content as-is
            executionTimeMs: 0,
            memoryUsedMB: 0,
            warnings: [],
            securityViolations: [],
          };
        }
        return this.executeInVM(jsCode, resolvedPath, context);
      } else {
        return this.executeInVM(content, resolvedPath, context);
      }
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message,
        executionTimeMs: 0,
        memoryUsedMB: 0,
        warnings: [],
        securityViolations: ["File system access error"],
      };
    }
  }

  /**
   * Create secure sandbox context
   */
  private createSandboxContext(
    filename: string,
    userContext?: Partial<SandboxContext>,
  ): SandboxContext {
    const logs: string[] = [];

    const sandboxContext: SandboxContext = {
      console: {
        log: (...args: unknown[]) => {
          logs.push(
            JSON.stringify({ type: "log", args: args.map((a) => String(a)) }),
          );
          if (this.options.enableLogging) {
            this.logger.info("[Sandbox]", ...args);
          }
        },
        error: (...args: unknown[]) => {
          logs.push(
            JSON.stringify({ type: "error", args: args.map((a) => String(a)) }),
          );
          if (this.options.enableLogging) {
            this.logger.error("[Sandbox]", ...args);
          }
        },
        warn: (...args: unknown[]) => {
          logs.push(
            JSON.stringify({ type: "warn", args: args.map((a) => String(a)) }),
          );
          if (this.options.enableLogging) {
            this.logger.warn("[Sandbox]", ...args);
          }
        },
        info: (...args: unknown[]) => {
          logs.push(
            JSON.stringify({ type: "info", args: args.map((a) => String(a)) }),
          );
          if (this.options.enableLogging) {
            this.logger.info("[Sandbox]", ...args);
          }
        },
      },
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      Buffer,
      process: {
        env: { ...process.env },
        cwd: () => process.cwd(),
        platform: process.platform,
        version: process.version,
      },
      exports: {},
      module: { exports: {} },
      __filename: filename,
      __dirname: path.dirname(filename),
    };

    if (this.options.allowedModules.length > 0) {
      sandboxContext.require = this.createSafeRequire();
    }

    if (userContext) {
      Object.assign(sandboxContext, userContext);
    }

    return sandboxContext;
  }

  /**
   * Create safe require function with module restrictions
   */
  private createSafeRequire(): (id: string) => unknown {
    return (id: string) => {
      if (this.options.blockedModules.includes(id)) {
        throw new Error(`Module '${id}' is blocked for security reasons`);
      }

      if (!this.options.allowedModules.includes(id)) {
        throw new Error(`Module '${id}' is not in the allowed modules list`);
      }

      if (this.moduleCache.has(id)) {
        return this.moduleCache.get(id);
      }

      try {
        const module = require(id);
        this.moduleCache.set(id, module);
        return module;
      } catch (error: unknown) {
        throw new Error(
          `Failed to load module '${id}': ${(error as Error).message}`,
        );
      }
    };
  }

  /**
   * Execute code with memory monitoring
   */
  private async executeWithMemoryLimit(
    code: string,
    context: vm.Context,
    filename: string,
  ): Promise<unknown> {
    const memoryCheckInterval = 100; // Check every 100ms
    let memoryExceeded = false;

    const memoryMonitor = setInterval(() => {
      const memoryUsage = process.memoryUsage().heapUsed / (1024 * 1024);
      if (memoryUsage > this.options.memoryLimitMB) {
        memoryExceeded = true;
        clearInterval(memoryMonitor);
      }
    }, memoryCheckInterval);

    try {
      const result = vm.runInContext(code, context, {
        filename,
        timeout: this.options.timeoutMs,
        breakOnSigint: true,
      });

      if (memoryExceeded) {
        throw new Error("Memory limit exceeded");
      }

      return result;
    } finally {
      clearInterval(memoryMonitor);
    }
  }

  /**
   * Analyze code for security issues
   */
  private analyzeCode(code: string): {
    violations: string[];
    critical: boolean;
  } {
    const violations: string[] = [];
    let critical = false;

    const dangerousPatterns = [
      {
        pattern: /eval\s*\(/,
        message: "eval() usage detected",
        critical: true,
      },
      {
        pattern: /Function\s*\(/,
        message: "Function constructor usage detected",
        critical: true,
      },
      {
        pattern: /require\s*\(\s*['"`]fs['"`]\s*\)/,
        message: "File system access attempt",
        critical: !this.options.allowFileSystem,
      },
      {
        pattern: /require\s*\(\s*['"`]child_process['"`]\s*\)/,
        message: "Child process spawn attempt",
        critical: !this.options.allowChildProcess,
      },
      {
        pattern: /require\s*\(\s*['"`]http['"`]\s*\)/,
        message: "HTTP module usage detected",
        critical: !this.options.allowNetwork,
      },
      {
        pattern: /require\s*\(\s*['"`]https['"`]\s*\)/,
        message: "HTTPS module usage detected",
        critical: !this.options.allowNetwork,
      },
      {
        pattern: /require\s*\(\s*['"`]net['"`]\s*\)/,
        message: "Network module usage detected",
        critical: !this.options.allowNetwork,
      },
      {
        pattern: /process\.exit\s*\(/,
        message: "Process exit attempt",
        critical: true,
      },
      {
        pattern: /process\.kill\s*\(/,
        message: "Process kill attempt",
        critical: true,
      },
      {
        pattern: /__proto__/,
        message: "Prototype pollution attempt",
        critical: true,
      },
      {
        pattern: /constructor\.prototype/,
        message: "Prototype manipulation attempt",
        critical: true,
      },
      {
        pattern: /while\s*\(\s*true\s*\)/,
        message: "Potential infinite loop detected",
        critical: false,
      },
      {
        pattern: /for\s*\(\s*;;\s*\)/,
        message: "Potential infinite loop detected",
        critical: false,
      },
    ];

    for (const {
      pattern,
      message,
      critical: isCritical,
    } of dangerousPatterns) {
      if (pattern.test(code)) {
        violations.push(message);
        if (isCritical) {
          critical = true;
        }
      }
    }

    return { violations, critical };
  }

  /**
   * Extract JavaScript code from Markdown
   */
  private extractJavaScriptFromMarkdown(content: string): string | null {
    const jsBlockRegex = /```(?:javascript|js)\n([\s\S]*?)\n```/gi;
    const matches = content.match(jsBlockRegex);

    if (!matches || matches.length === 0) {
      return null;
    }

    return matches
      .map((match) =>
        match.replace(/```(?:javascript|js)\n/, "").replace(/\n```$/, ""),
      )
      .join("\n\n");
  }

  /**
   * Get current sandbox statistics
   */
  getStats(): {
    activeTasks: number;
    maxConcurrentTasks: number;
    modulesCached: number;
    options: Required<SandboxOptions>;
  } {
    return {
      activeTasks: this.activeTasks.size,
      maxConcurrentTasks: this.options.maxConcurrentTasks,
      modulesCached: this.moduleCache.size,
      options: this.options,
    };
  }

  /**
   * Clear module cache
   */
  clearCache(): void {
    this.moduleCache.clear();
  }

  /**
   * Terminate all active tasks
   */
  async terminate(): Promise<void> {
    this.activeTasks.clear();
    this.moduleCache.clear();
    this.emit("sandbox-terminated");
  }
}

export const defaultSandbox = new ExecutionSandbox();
