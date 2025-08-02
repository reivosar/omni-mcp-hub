import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { GitHubAPI } from '../github/github-api';
import { CacheManager } from '../cache/cache';

interface MCPResponse {
  repo: string;
  branch: string;
  claude_md_files: Record<string, string>;
  external_refs: Record<string, string>;
  fetched_at: string;
}

export class RESTServer {
  private app: express.Application;
  private githubAPI: GitHubAPI;
  private cacheManager: CacheManager;
  private port: number;
  private requestCount = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private startTime = Date.now();

  constructor(port: number = 3000) {
    this.app = express();
    this.githubAPI = new GitHubAPI();
    this.cacheManager = new CacheManager();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.raw({ type: 'application/x-hub-signature-256' }));
    
    // Request counter middleware
    this.app.use((req, res, next) => {
      this.requestCount++;
      next();
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/healthz', (req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain; version=0.0.4');
      const metrics = this.generatePrometheusMetrics();
      res.send(metrics);
    });

    // Main MCP endpoint
    this.app.get('/:owner/:repo/sse', async (req, res) => {
      try {
        const { owner, repo } = req.params;
        const branch = req.query.branch as string || 'main';
        const includeExternals = req.query.include_externals !== 'false';
        const authToken = this.extractAuthToken(req);

        const result = await this.getMCPData(owner, repo, branch, includeExternals, authToken);
        res.json(result);
      } catch (error) {
        console.error('MCP endpoint error:', error);
        if (error instanceof Error) {
          if (error.message.includes('not found') || error.message.includes('does not exist')) {
            res.status(404).json({ error: error.message });
          } else if (error.message.includes('rate limit') || error.message.includes('API rate limit')) {
            res.status(429).json({ error: 'GitHub API rate limit exceeded' });
          } else if (error.message.includes('Unauthorized') || error.message.includes('authentication')) {
            res.status(401).json({ error: 'Authentication failed' });
          } else {
            res.status(500).json({ error: error.message });
          }
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    // Files listing endpoint
    this.app.get('/:owner/:repo/files', async (req, res) => {
      try {
        const { owner, repo } = req.params;
        const pattern = req.query.pattern as string || 'CLAUDE.md';
        const branch = req.query.branch as string || 'main';
        const authToken = this.extractAuthToken(req);

        const files = await this.githubAPI.listFiles(owner, repo, branch, pattern, authToken);
        res.json({
          repo: `${owner}/${repo}`,
          branch,
          files,
          fetched_at: new Date().toISOString()
        });
      } catch (error) {
        console.error('Files endpoint error:', error);
        if (error instanceof Error) {
          if (error.message.includes('not found') || error.message.includes('does not exist')) {
            res.status(404).json({ error: error.message });
          } else if (error.message.includes('rate limit')) {
            res.status(429).json({ error: 'GitHub API rate limit exceeded' });
          } else if (error.message.includes('Unauthorized')) {
            res.status(401).json({ error: 'Authentication failed' });
          } else {
            res.status(500).json({ error: error.message });
          }
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    // Raw file proxy endpoint
    this.app.get('/:owner/:repo/raw/*', async (req, res) => {
      try {
        const { owner, repo } = req.params;
        const filePath = req.path.split(`/${owner}/${repo}/raw/`)[1] || '';
        const branch = req.query.branch as string || 'main';
        const authToken = this.extractAuthToken(req);

        const content = await this.githubAPI.getFileContent(owner, repo, filePath, branch, authToken);
        
        // Determine content type based on file extension
        let contentType = 'text/plain';
        if (filePath.endsWith('.md')) {
          contentType = 'text/markdown';
        } else if (filePath.endsWith('.json')) {
          contentType = 'application/json';
        } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          contentType = 'text/yaml';
        }
        
        res.set('Content-Type', contentType);
        res.send(content);
      } catch (error) {
        console.error('Raw file endpoint error:', error);
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
          } else if (error.message.includes('rate limit')) {
            res.status(429).json({ error: 'GitHub API rate limit exceeded' });
          } else if (error.message.includes('Unauthorized')) {
            res.status(401).json({ error: 'Authentication failed' });
          } else {
            res.status(500).json({ error: error.message });
          }
        } else {
          res.status(404).json({ error: 'File not found' });
        }
      }
    });

    // GitHub webhook endpoint
    this.app.post('/webhook/github', async (req, res) => {
      const signature = req.get('X-Hub-Signature-256');
      const event = req.get('X-GitHub-Event');
      const delivery = req.get('X-GitHub-Delivery');
      
      console.log('Received GitHub webhook:', { event, delivery });
      
      // Verify webhook signature if secret is configured
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      if (webhookSecret && signature) {
        const isValid = this.verifyWebhookSignature(req.body, signature, webhookSecret);
        if (!isValid) {
          console.error('Invalid webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
      
      // Handle cache invalidation based on event
      await this.handleWebhookEvent(event, req.body);
      console.log('Webhook processed successfully');
      
      res.status(200).json({ received: true });
    });

    // Config endpoint
    this.app.get('/config', (req, res) => {
      res.json({
        supported_files: ['CLAUDE.md', 'README.md', 'llms.txt'],
        default_branch: 'main'
      });
    });

    // Version endpoint
    this.app.get('/version', (req, res) => {
      res.json({
        service: 'git-mcp',
        version: '1.0.0',
        build: '20250730-' + Math.random().toString(36).substring(2, 8)
      });
    });
  }

  private extractAuthToken(req: express.Request): string | undefined {
    const authHeader = req.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return undefined;
  }

  private async getMCPData(
    owner: string, 
    repo: string, 
    branch: string, 
    includeExternals: boolean,
    authToken?: string
  ): Promise<MCPResponse> {
    // Check cache first
    const cachedData = await this.cacheManager.getMCPData(owner, repo, branch, includeExternals);
    if (cachedData) {
      this.cacheHits++;
      console.log(`Cache hit for ${owner}/${repo}@${branch}`);
      return cachedData;
    }

    this.cacheMisses++;
    console.log(`Cache miss, fetching fresh data for ${owner}/${repo}@${branch}`);
    
    const claudeMdFiles: Record<string, string> = {};
    const externalRefs: Record<string, string> = {};

    // Get all CLAUDE.md files
    const claudeFiles = await this.githubAPI.listFiles(owner, repo, branch, 'CLAUDE.md', authToken);
    
    // Process files in parallel
    const filePromises = claudeFiles.map(async (filePath) => {
      try {
        const content = await this.githubAPI.getFileContent(owner, repo, filePath, branch, authToken);
        claudeMdFiles[filePath] = content;

        // Extract external references if requested
        if (includeExternals) {
          const refs = this.extractExternalReferences(content);
          const refPromises = refs.map(async (ref) => {
            if (!externalRefs[ref]) {
              try {
                externalRefs[ref] = await this.fetchExternalContent(ref);
              } catch (error) {
                console.error(`Failed to fetch external reference ${ref}:`, error);
                externalRefs[ref] = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
              }
            }
          });
          await Promise.all(refPromises);
        }
      } catch (error) {
        console.error(`Failed to fetch ${filePath}:`, error);
        claudeMdFiles[filePath] = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    });

    await Promise.all(filePromises);

    const result: MCPResponse = {
      repo: `${owner}/${repo}`,
      branch,
      claude_md_files: claudeMdFiles,
      external_refs: externalRefs,
      fetched_at: new Date().toISOString()
    };

    // Cache the result (5 minutes TTL)
    await this.cacheManager.setMCPData(owner, repo, branch, includeExternals, result, 300);
    console.log(`Cached data for ${owner}/${repo}@${branch}`);

    return result;
  }

  private extractExternalReferences(content: string): string[] {
    const refs: string[] = [];
    
    // Extract HTTP(S) URLs
    const urlRegex = /https?:\/\/[^\s\)]+/g;
    const urls = content.match(urlRegex) || [];
    refs.push(...urls);

    // Extract GitHub file references (e.g., github:owner/repo/path/file.md)
    const githubRefRegex = /github:([^\/]+\/[^\/]+\/[^\s\)]+)/g;
    const githubRefs = content.match(githubRefRegex) || [];
    refs.push(...githubRefs);

    return Array.from(new Set(refs)); // Remove duplicates
  }

  private async fetchExternalContent(ref: string): Promise<string> {
    if (ref.startsWith('http')) {
      // Fetch HTTP(S) URLs
      const response = await fetch(ref);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.text();
    } else if (ref.startsWith('github:')) {
      // Parse GitHub references
      const match = ref.match(/github:([^\/]+)\/([^\/]+)\/(.+)/);
      if (match) {
        const [, owner, repo, filePath] = match;
        return await this.githubAPI.getFileContent(owner, repo, filePath, 'main');
      }
    }
    
    throw new Error(`Unsupported reference format: ${ref}`);
  }

  private async handleWebhookEvent(event: string | undefined, payload: any): Promise<void> {
    if (!event || !payload.repository) {
      return;
    }

    const owner = payload.repository.owner?.login;
    const repo = payload.repository.name;

    if (!owner || !repo) {
      console.error('Missing repository information in webhook payload');
      return;
    }

    // Handle events that should trigger cache invalidation
    switch (event) {
      case 'push':
        const branch = payload.ref?.replace('refs/heads/', '');
        if (branch) {
          console.log(`Invalidating cache for ${owner}/${repo}@${branch} due to push`);
          await this.cacheManager.invalidateBranch(owner, repo, branch);
        }
        break;
        
      case 'pull_request':
        // Invalidate default branch cache when PR is opened/updated
        const defaultBranch = payload.repository.default_branch || 'main';
        console.log(`Invalidating cache for ${owner}/${repo}@${defaultBranch} due to PR`);
        await this.cacheManager.invalidateBranch(owner, repo, defaultBranch);
        break;
        
      case 'repository':
        // Full repository events (e.g., renamed, deleted)
        console.log(`Invalidating all cache for ${owner}/${repo} due to repository event`);
        await this.cacheManager.invalidateRepo(owner, repo);
        break;
        
      default:
        console.log(`Ignoring webhook event: ${event}`);
    }
  }

  private verifyWebhookSignature(payload: any, signature: string, secret: string): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
    hmac.update(body);
    const expectedSignature = 'sha256=' + hmac.digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private generatePrometheusMetrics(): string {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const totalCacheRequests = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0 ? (this.cacheHits / totalCacheRequests) : 0;
    const cacheStats = this.cacheManager.getCacheStats();
    
    return `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${this.requestCount}

# HELP http_server_uptime_seconds Server uptime in seconds
# TYPE http_server_uptime_seconds counter
http_server_uptime_seconds ${uptime}

# HELP cache_hits_total Total number of cache hits
# TYPE cache_hits_total counter
cache_hits_total ${this.cacheHits}

# HELP cache_misses_total Total number of cache misses
# TYPE cache_misses_total counter
cache_misses_total ${this.cacheMisses}

# HELP cache_hit_rate Cache hit rate (0.0 to 1.0)
# TYPE cache_hit_rate gauge
cache_hit_rate ${cacheHitRate.toFixed(3)}

# HELP cache_size Current cache size
# TYPE cache_size gauge
cache_size ${cacheStats.size || 0}

# HELP github_api_requests_total Total number of GitHub API requests
# TYPE github_api_requests_total counter
github_api_requests_total 0
`;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`REST API server started on port ${this.port}`);
    });
  }
}