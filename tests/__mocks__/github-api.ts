export class MockGitHubAPI {
  private mockFiles: Map<string, string[]> = new Map();
  private mockFileContent: Map<string, string> = new Map();

  // Setup methods for testing
  setMockFiles(owner: string, repo: string, branch: string, files: string[]) {
    const key = `${owner}/${repo}@${branch}`;
    this.mockFiles.set(key, files);
  }

  setMockFileContent(owner: string, repo: string, filePath: string, branch: string, content: string) {
    const key = `${owner}/${repo}/${filePath}@${branch}`;
    this.mockFileContent.set(key, content);
  }

  setMockError(owner: string, repo: string, error: Error) {
    const key = `${owner}/${repo}@error`;
    this.mockFiles.set(key, []);
    // Store error in a way that can be thrown later
  }

  // Mock implementation methods
  async listFiles(
    owner: string,
    repo: string,
    branch: string = 'main',
    pattern: string = 'CLAUDE.md'
  ): Promise<string[]> {
    const key = `${owner}/${repo}@${branch}`;
    
    if (owner === 'error' && repo === 'repo') {
      throw new Error('Repository not found');
    }
    
    const files = this.mockFiles.get(key) || [];
    
    // Filter by pattern
    return files.filter(file => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file);
      }
      return file.endsWith(pattern) || file.includes(pattern);
    });
  }

  async getFileContent(
    owner: string,
    repo: string,
    filePath: string,
    branch: string = 'main'
  ): Promise<string> {
    const key = `${owner}/${repo}/${filePath}@${branch}`;
    
    if (owner === 'error' && repo === 'repo') {
      throw new Error('File not found');
    }
    
    const content = this.mockFileContent.get(key);
    if (content === undefined) {
      throw new Error(`File ${filePath} not found in ${owner}/${repo}@${branch}`);
    }
    
    return content;
  }

  async getRateLimit(): Promise<{ remaining: number; reset: number }> {
    return {
      remaining: 5000,
      reset: Date.now() + 3600000
    };
  }

  // Utility methods for testing
  clear() {
    this.mockFiles.clear();
    this.mockFileContent.clear();
  }

  getSetupInfo() {
    return {
      files: Array.from(this.mockFiles.entries()),
      content: Array.from(this.mockFileContent.entries())
    };
  }
}