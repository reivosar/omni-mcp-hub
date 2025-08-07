import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { GitHubAPI } from '../github/github-api';
import { CacheManager } from '../cache/cache';
import { ReferenceResolver } from '../utils/reference-resolver';
import { FetchUtils } from '../utils/fetch-utils';
import { SourceConfigManager } from '../config/source-config-manager';
import { MCPServerManager } from '../mcp/mcp-server-manager';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  FetchDocumentationParams,
  StreamProgress,
  FetchOptions,
  CachedData
} from '../types/types';


export class MCPSSEServer {
  private app: express.Application;
  private githubAPI: GitHubAPI;
  private cacheManager: CacheManager;
  private referenceResolver: ReferenceResolver;
  private port: number;
  private fetchOptions: FetchOptions;
  private configLoader: SourceConfigManager;
  private mcpServerManager: MCPServerManager;

  constructor(port: number = 3000) {
    this.app = express();
    this.configLoader = new SourceConfigManager();
    const config = this.configLoader.getConfig();
    
    this.githubAPI = new GitHubAPI();
    this.cacheManager = new CacheManager();
    this.referenceResolver = new ReferenceResolver(this.githubAPI);
    this.mcpServerManager = new MCPServerManager();
    this.port = port;
    
    // Configure fetch options from config with defaults
    this.fetchOptions = {
      timeout: config.fetch?.timeout || 30000,
      retries: config.fetch?.retries || 3,
      retryDelay: config.fetch?.retry_delay || 1000,
      maxDepth: config.fetch?.max_depth || 3
    };
    
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeMCPServers();
  }

  private setupMiddleware() {
    // Security: Configure CORS with specific allowed origins instead of wildcard
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3010',
      'http://localhost:8080',
      'http://localhost:5173'
    ];
    
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'test' ? '*' : allowedOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'MCP-Protocol-Version'],
      credentials: process.env.NODE_ENV === 'test' ? false : true
    }));
    
    // For webhook signature verification, we need raw body
    this.app.use('/webhook', express.raw({ type: 'application/json' }));
    this.app.use(express.json());
    
    // Error handling middleware for JSON parsing errors
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        // For MCP endpoint, return SSE error format
        if (req.path === '/sse') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          });
          
          this.sendSSEMessage(res, {
            jsonrpc: '2.0',
            id: undefined,
            error: {
              code: -32700,
              message: 'Parse error',
              data: 'Invalid JSON format'
            }
          } as any);
          res.end();
          return;
        }
      }
      next(error);
    });
  }

  private setupRoutes() {
    // Single MCP endpoint for both GET and POST
    this.app.all('/sse', async (req, res) => {
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, MCP-Protocol-Version'
      });

      try {
        if (req.method === 'POST') {
          await this.handleJSONRPCRequest(req, res);
        } else {
          // GET request - send basic server info or handle simple queries
          this.sendSSEMessage(res, {
            jsonrpc: '2.0',
            method: 'server_info',
            params: {
              name: 'git-mcp-compatible-server',
              version: '1.0.0',
              capabilities: ['fetch_owner_repo_documentation']
            }
          });
          res.end();
        }
      } catch (error) {
        console.error('MCP endpoint error:', error);
        this.sendSSEMessage(res, {
          jsonrpc: '2.0',
          method: 'error',
          params: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : 'Unknown error'
          }
        });
        res.end();
      }
    });

    // Health check endpoint
    this.app.get('/healthz', (req, res) => {
      res.json({ status: 'ok' });
    });

    // GitHub webhook endpoint
    this.app.post('/webhook', async (req, res) => {
      try {
        await this.handleWebhook(req, res);
      } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  private async handleJSONRPCRequest(req: express.Request, res: express.Response) {
    const request = req.body as JSONRPCRequest;
    
    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      this.sendSSEError(res, request.id, -32600, 'Invalid Request');
      res.end();
      return;
    }

    // Check for git-mcp compatible method name pattern
    const methodMatch = request.method.match(/^fetch_([^_]+)_([^_]+)_documentation$/);
    
    if (methodMatch) {
      const [, owner, repo] = methodMatch;
      const params = (request.params || {}) as unknown as FetchDocumentationParams;
      
      // Override owner/repo from method name if not in params
      const finalParams = {
        owner: params?.owner || owner,
        repo: params?.repo || repo,
        branch: params?.branch || 'main',
        include_externals: params?.include_externals !== false
      };

      await this.handleFetchDocumentation(request.id, finalParams, res);
    } else {
      this.sendSSEError(res, request.id, -32601, `Method not found: ${request.method}`);
    }
    
    res.end();
  }

  private async handleFetchDocumentation(
    requestId: string | number,
    params: FetchDocumentationParams,
    res: express.Response
  ) {
    const { owner, repo } = params;
    const branch = params.branch || 'main';
    const include_externals = params.include_externals !== false;

    try {
      // Send starting notification
      this.sendSSEMessage(res, {
        jsonrpc: '2.0',
        method: 'fetch_owner_repo_documentation',
        params: {
          status: 'starting',
          owner,
          repo,
          branch
        }
      });

      // Check cache first
      const cacheKey = `${owner}:${repo}:${branch}:${include_externals}`;
      let cachedData = null;
      
      try {
        cachedData = await this.cacheManager.getMCPData(owner, repo, branch, include_externals);
      } catch (error) {
        console.warn('Cache error, falling back to fresh data:', error);
      }
      
      if (cachedData) {
        // Stream cached data
        await this.streamCachedData(cachedData, res);
      } else {
        // Fetch fresh data and stream progressively
        await this.streamFreshData(owner, repo, branch, include_externals, res);
      }

      // Send final completion response
      this.sendSSEMessage(res, {
        jsonrpc: '2.0',
        id: requestId,
        result: {
          status: 'complete',
          timestamp: new Date().toISOString()
        }
      });



    } catch (error) {
      console.error('Documentation fetch error:', error);
      this.sendSSEError(res, requestId, -32603, 
        error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async streamCachedData(cachedData: any, res: express.Response) {
    this.sendSSEMessage(res, {
      jsonrpc: '2.0',
      method: 'fetch_owner_repo_documentation',
      params: {
        status: 'cache_hit'
      }
    });

    // Stream CLAUDE.md files
    for (const [path, content] of Object.entries(cachedData.claude_md_files)) {
      this.sendSSEMessage(res, {
        jsonrpc: '2.0',
        method: 'fetch_owner_repo_documentation',
        params: {
          path,
          content: content as string
        }
      });
    }

    // Stream external references
    for (const [url, content] of Object.entries(cachedData.external_refs)) {
      this.sendSSEMessage(res, {
        jsonrpc: '2.0',
        method: 'fetch_owner_repo_documentation',
        params: {
          url,
          content: content as string
        }
      });
    }
  }

  private async streamFreshData(
    owner: string,
    repo: string, 
    branch: string,
    includeExternals: boolean,
    res: express.Response
  ) {
    const claudeMdFiles: Record<string, string> = {};
    const externalRefs: Record<string, string> = {};

    // Reset reference resolver for new session
    this.referenceResolver.reset();

    // Get all CLAUDE.md files
    this.sendSSEMessage(res, {
      jsonrpc: '2.0',
      method: 'fetch_owner_repo_documentation',
      params: {
        status: 'fetching_files',
        progress: { current: 0, total: 0 }
      }
    });

    let claudeFiles: string[];
    try {
      claudeFiles = await this.githubAPI.listFiles(owner, repo, branch, 'CLAUDE.md');
      // Ensure claudeFiles is always an array
      if (!Array.isArray(claudeFiles)) {
        claudeFiles = [];
      }
    } catch (error) {
      // If listFiles fails, throw the error to be caught by the parent
      throw error;
    }
    
    // Stream each file as it's fetched with progress
    for (let i = 0; i < claudeFiles.length; i++) {
      const filePath = claudeFiles[i];
      
      try {
        const content = await this.githubAPI.getFileContent(owner, repo, filePath, branch);
        claudeMdFiles[filePath] = content;

        // Stream this file immediately
        this.sendSSEMessage(res, {
          jsonrpc: '2.0',
          method: 'fetch_owner_repo_documentation',
          params: {
            path: filePath,
            content,
            progress: { current: i + 1, total: claudeFiles.length }
          }
        });

        // Process external references with recursive resolution
        if (includeExternals && content) {
          this.sendSSEMessage(res, {
            jsonrpc: '2.0',
            method: 'fetch_owner_repo_documentation',
            params: {
              status: 'fetching_external',
              url: `Processing references in ${filePath}`
            }
          });

          try {
            const resolvedRefs = await this.referenceResolver.resolveReferences(
              content,
              branch,
              this.fetchOptions
            );

            // Stream each resolved reference
            for (const refResult of resolvedRefs) {
              externalRefs[refResult.url] = refResult.content;
              
              this.sendSSEMessage(res, {
                jsonrpc: '2.0',
                method: 'fetch_owner_repo_documentation',
                params: {
                  url: refResult.url,
                  content: refResult.content,
                  error: !!refResult.error,
                  depth: refResult.depth
                }
              });
            }
          } catch (error) {
            console.error(`Failed to resolve references in ${filePath}:`, error);
          }
        }
      } catch (error) {
        const errorMsg = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        claudeMdFiles[filePath] = errorMsg;
        
        this.sendSSEMessage(res, {
          jsonrpc: '2.0',
          method: 'fetch_owner_repo_documentation',
          params: {
            path: filePath,
            content: errorMsg,
            error: true
          }
        });
      }
    }

    // Log resolver statistics
    const stats = this.referenceResolver.getStats();
    console.log(`Processed ${stats.processedUrls} external references:`, stats.urls);

    // Cache the complete result
    const result: CachedData = {
      repo: `${owner}/${repo}`,
      branch,
      claude_md_files: claudeMdFiles,
      external_refs: externalRefs,
      fetched_at: new Date().toISOString()
    };

    await this.cacheManager.setMCPData(owner, repo, branch, includeExternals, result, 300);
  }


  private sendSSEMessage(res: express.Response, message: JSONRPCNotification | JSONRPCResponse) {
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify(message)}\n\n`);
  }

  private sendSSEError(res: express.Response, id: string | number | undefined, code: number, message: string) {
    this.sendSSEMessage(res, {
      jsonrpc: '2.0',
      id: id !== undefined ? id : null,
      error: { code, message }
    } as JSONRPCResponse);
  }

  private async handleWebhook(req: express.Request, res: express.Response) {
    const event = req.headers['x-github-event'] as string;
    const signature = req.headers['x-hub-signature-256'] as string;
    const delivery = req.headers['x-github-delivery'] as string;
    
    // Verify signature if webhook secret is configured
    const config = this.configLoader.getConfig();
    // For webhook verification, prioritize environment variable over config
    // Webhook secret comes from environment variable only
    let webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    // If the secret is an empty string, treat it as no secret
    if (webhookSecret === '') {
      webhookSecret = undefined;
    }
    let payload: any;
    
    // Handle raw body for signature verification
    if (Buffer.isBuffer(req.body)) {
      const rawBody = req.body.toString();
      
      try {
        payload = JSON.parse(rawBody);
      } catch (error) {
        console.error('Invalid JSON in webhook payload:', error);
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }
      
      if (webhookSecret && signature) {
        const expectedSignature = 'sha256=' + crypto
          .createHmac('sha256', webhookSecret)
          .update(rawBody)
          .digest('hex');
        
        // Use timing-safe comparison to prevent timing attacks
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);
        
        if (signatureBuffer.length !== expectedBuffer.length || 
            !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      } else if (webhookSecret && !signature) {
        return res.status(401).json({ error: 'Missing signature' });
      }
    } else {
      // Fallback for regular JSON body
      payload = req.body;
      if (webhookSecret && signature) {
        let bodyString: string;
        try {
          bodyString = JSON.stringify(req.body);
        } catch (error) {
          console.error('Failed to stringify request body:', error);
          return res.status(400).json({ error: 'Invalid request body' });
        }
        
        const expectedSignature = 'sha256=' + crypto
          .createHmac('sha256', webhookSecret)
          .update(bodyString)
          .digest('hex');
        
        // Use timing-safe comparison to prevent timing attacks
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);
        
        if (signatureBuffer.length !== expectedBuffer.length || 
            !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      } else if (webhookSecret && !signature) {
        return res.status(401).json({ error: 'Missing signature' });
      }
    }
    
    // Handle different webhook events
    switch (event) {
      case 'push':
        await this.handlePushWebhook(payload);
        break;
      case 'pull_request':
        await this.handlePullRequestWebhook(payload);
        break;
      case 'repository':
        await this.handleRepositoryWebhook(payload);
        break;
      default:
        // Ignore unknown events
        console.log(`Ignoring webhook event: ${event}`);
        break;
    }

    res.json({ status: 'ok', event });
  }

  private async handlePushWebhook(payload: any) {
    if (payload.repository) {
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const branch = payload.ref?.replace('refs/heads/', '') || 'main';
      
      // Invalidate cache for this specific branch
      await this.cacheManager.invalidateBranch(owner, repo, branch);
      console.log(`Cache invalidated for ${owner}/${repo}@${branch} via push webhook`);
    }
  }

  private async handlePullRequestWebhook(payload: any) {
    if (payload.repository) {
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      
      // Invalidate cache for default branch
      await this.cacheManager.invalidateRepo(owner, repo);
      console.log(`Cache invalidated for ${owner}/${repo} via pull request webhook`);
    }
  }

  private async handleRepositoryWebhook(payload: any) {
    if (payload.repository) {
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      
      // Invalidate all cache for this repository
      await this.cacheManager.invalidateRepo(owner, repo);
      console.log(`All cache invalidated for ${owner}/${repo} via repository webhook`);
    }
  }

  private async initializeMCPServers() {
    const config = this.configLoader.getConfig();
    
    if (!config.mcp_servers || config.mcp_servers.length === 0) {
      console.log('No MCP servers configured');
      return;
    }

    console.log(`Initializing ${config.mcp_servers.length} MCP servers...`);

    for (const serverConfig of config.mcp_servers) {
      try {
        if (serverConfig.enabled === false) {
          console.log(`Skipping disabled MCP server: ${serverConfig.name}`);
          continue;
        }

        console.log(`Starting MCP server: ${serverConfig.name}`);
        await this.mcpServerManager.startServer(serverConfig);
        console.log(`Successfully started MCP server: ${serverConfig.name}`);
      } catch (error) {
        console.error(`Failed to start MCP server ${serverConfig.name}:`, error);
        // Continue with other servers even if one fails
      }
    }

    console.log('MCP server initialization complete');
  }

  async shutdown() {
    console.log('Shutting down MCP servers...');
    await this.mcpServerManager.stopAllServers();
    console.log('All MCP servers stopped');
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`MCP SSE Server started on port ${this.port}`);
      console.log(`Compatible with idosal/git-mcp clients`);
      console.log(`Endpoint: http://localhost:${this.port}/sse`);
    });
  }
}