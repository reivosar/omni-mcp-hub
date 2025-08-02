interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

interface GitHubFileResponse {
  content: string;
  encoding: string;
}

export class GitHubAPI {
  private readonly baseURL = 'https://api.github.com';

  async listFiles(
    owner: string, 
    repo: string, 
    branch: string = 'main', 
    pattern: string = 'CLAUDE.md',
    authToken?: string
  ): Promise<string[]> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'omni-mcp-hub/1.0.0'
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Get repository tree recursively
    const treeUrl = `${this.baseURL}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const response = await fetch(treeUrl, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found or branch ${branch} does not exist`);
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GitHubTreeResponse;
    
    // Ensure data.tree exists and is an array
    if (!data || !Array.isArray(data.tree)) {
      return [];
    }
    
    // Filter files matching the pattern
    const matchingFiles = data.tree
      .filter(item => item && item.type === 'blob' && item.path)
      .map(item => item.path)
      .filter(path => path && this.matchesPattern(path, pattern));

    return matchingFiles;
  }

  async getFileContent(
    owner: string,
    repo: string,
    filePath: string,
    branch: string = 'main',
    authToken?: string
  ): Promise<string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'omni-mcp-hub/1.0.0'
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const fileUrl = `${this.baseURL}/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    const response = await fetch(fileUrl, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File ${filePath} not found in ${owner}/${repo}@${branch}`);
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GitHubFileResponse;
    
    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    
    return data.content;
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    // Support simple patterns
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filePath);
    }
    
    // Exact filename match anywhere in the path
    const fileName = filePath.split('/').pop() || '';
    return fileName === pattern || filePath.endsWith(`/${pattern}`);
  }

  async getRateLimit(authToken?: string): Promise<{ remaining: number; reset: number }> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'omni-mcp-hub/1.0.0'
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${this.baseURL}/rate_limit`, { headers });
    const data = await response.json() as any;
    
    return {
      remaining: data.resources.core.remaining,
      reset: data.resources.core.reset
    };
  }
}