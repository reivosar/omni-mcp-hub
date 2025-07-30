import express from 'express';
import cors from 'cors';
import { GitHubAPI } from './github-api';
import { CacheManager } from './cache';
import { ReferenceResolver } from './reference-resolver';
import { FetchUtils } from './fetch-utils';
import { ConfigLoader } from './config-loader';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  FetchDocumentationParams,
  StreamProgress,
  FetchOptions,
  CachedData
} from './types';


export class MCPSSEServer {
  private app: express.Application;
  private githubAPI: GitHubAPI;
  private cacheManager: CacheManager;
  private referenceResolver: ReferenceResolver;
  private port: number;
  private fetchOptions: FetchOptions;
  private configLoader: ConfigLoader;

  constructor(port: number = 3000) {
    this.app = express();
    this.configLoader = new ConfigLoader();
    const config = this.configLoader.getConfig();
    
    this.githubAPI = new GitHubAPI();
    this.cacheManager = new CacheManager();
    this.referenceResolver = new ReferenceResolver(this.githubAPI);
    this.port = port;
    
    // Configure fetch options from config
    this.fetchOptions = {
      timeout: config.fetch.timeout,
      retries: config.fetch.retries,
      retryDelay: config.fetch.retry_delay,
      maxDepth: config.fetch.max_depth
    };
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'MCP-Protocol-Version']
    }));
    
    this.app.use(express.json());
  }

  private setupRoutes() {
    // Single MCP endpoint for both GET and POST
    this.app.all('/mcp', async (req, res) => {
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
      let cachedData = await this.cacheManager.getMCPData(owner, repo, branch, include_externals);
      
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

    const claudeFiles = await this.githubAPI.listFiles(owner, repo, branch, 'CLAUDE.md');
    
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

  // Legacy methods kept for backward compatibility (not used in new implementation)
  private extractExternalReferences(content: string): string[] {
    console.warn('Using legacy extractExternalReferences - consider migrating to ReferenceResolver');
    return [];
  }

  private async fetchExternalContent(ref: string): Promise<string> {
    console.warn('Using legacy fetchExternalContent - consider migrating to ReferenceResolver');
    throw new Error('Legacy method - use ReferenceResolver instead');
  }

  private sendSSEMessage(res: express.Response, message: JSONRPCNotification | JSONRPCResponse) {
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify(message)}\n\n`);
  }

  private sendSSEError(res: express.Response, id: string | number | undefined, code: number, message: string) {
    this.sendSSEMessage(res, {
      jsonrpc: '2.0',
      id: id || null,
      error: { code, message }
    } as JSONRPCResponse);
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`MCP SSE Server started on port ${this.port}`);
      console.log(`Compatible with idosal/git-mcp clients`);
      console.log(`Endpoint: http://localhost:${this.port}/mcp`);
    });
  }
}