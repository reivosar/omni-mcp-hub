import { GitHubAPI } from './github-api';
import { FetchUtils } from './fetch-utils';
import { ExternalReferenceResult, FetchOptions } from './types';

export class ReferenceResolver {
  private githubAPI: GitHubAPI;
  private processedUrls: Set<string> = new Set();
  
  constructor(githubAPI: GitHubAPI) {
    this.githubAPI = githubAPI;
  }

  async resolveReferences(
    content: string,
    branch: string,
    options: FetchOptions = {},
    depth: number = 0
  ): Promise<ExternalReferenceResult[]> {
    const {
      timeout = 10000,
      retries = 3,
      retryDelay = 1000,
      maxDepth = 2
    } = options;

    if (depth > maxDepth) {
      console.log(`Max depth ${maxDepth} exceeded, stopping recursion`);
      return [];
    }

    const refs = this.extractExternalReferences(content);
    const results: ExternalReferenceResult[] = [];

    for (const ref of refs) {
      // Skip if already processed (prevent infinite loops)
      if (this.processedUrls.has(ref)) {
        continue;
      }
      
      this.processedUrls.add(ref);

      // At maxDepth, just return URL info without fetching
      if (depth === maxDepth) {
        results.push({
          url: ref,
          content: '', // No content fetched at max depth
          references: [],
          depth
        });
        continue;
      }

      try {
        console.log(`Resolving reference at depth ${depth}: ${ref}`);
        
        const resolvedContent = await this.fetchExternalContent(
          ref, 
          branch, 
          { timeout, retries, retryDelay }
        );

        // Recursively resolve references in the fetched content first
        let nestedRefs: ExternalReferenceResult[] = [];
        if (depth < maxDepth && resolvedContent && !resolvedContent.startsWith('Error:')) {
          try {
            nestedRefs = await this.resolveReferences(
              resolvedContent,
              branch,
              options,
              depth + 1
            );
            results.push(...nestedRefs);
          } catch (error) {
            console.warn(`Failed to resolve nested references in ${ref}:`, error);
          }
        }

        const result: ExternalReferenceResult = {
          url: ref,
          content: resolvedContent,
          references: nestedRefs.map(r => r.url),
          depth
        };

        results.push(result);
      } catch (error) {
        console.error(`Failed to fetch reference ${ref}:`, error);
        results.push({
          url: ref,
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          references: [],
          error: error instanceof Error ? error.message : 'Unknown error',
          depth
        });
      }
    }

    return results;
  }

  private extractExternalReferences(content: string): string[] {
    const refs: string[] = [];
    
    // Extract HTTP(S) URLs from markdown links - more comprehensive regex
    const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      const url = match[2];
      if (url.startsWith('http') && (url.endsWith('.md') || url.includes('.md'))) {
        refs.push(url);
      }
    }

    // Extract bare URLs that end with .md
    const bareUrlRegex = /https?:\/\/[^\s<>"\[\]{}|\\^`]+\.md(?:\s|$)/g;
    const bareUrls = content.match(bareUrlRegex) || [];
    refs.push(...bareUrls.map(url => url.trim()));

    // Extract GitHub file references (github:owner/repo/path)
    const githubRefRegex = /github:([^\/\s]+\/[^\/\s]+\/[^\s)]+)/g;
    const githubRefs = content.match(githubRefRegex) || [];
    refs.push(...githubRefs);

    // Extract relative references that might be GitHub URLs
    const relativeGitHubRegex = /\.\/[^\s)]+\.md|\.\.\/[^\s)]+\.md/g;
    const relativeRefs = content.match(relativeGitHubRegex) || [];
    refs.push(...relativeRefs);

    return Array.from(new Set(refs.filter(ref => ref.trim())));
  }

  private async fetchExternalContent(
    ref: string, 
    branch: string,
    options: { timeout: number; retries: number; retryDelay: number }
  ): Promise<string> {
    if (ref.startsWith('http')) {
      // Normalize GitHub URLs to use the correct branch
      const normalizedUrl = FetchUtils.normalizeGitHubUrl(ref, branch);
      console.log(`Fetching external URL: ${normalizedUrl} (original: ${ref})`);
      
      return await FetchUtils.fetchTextWithRetry(normalizedUrl, {
        timeout: options.timeout,
        retries: options.retries,
        retryDelay: options.retryDelay
      });
    } else if (ref.startsWith('github:')) {
      // Parse GitHub references: github:owner/repo/path
      const match = ref.match(/github:([^\/]+)\/([^\/]+)\/(.+)/);
      if (match) {
        const [, owner, repo, filePath] = match;
        console.log(`Fetching GitHub file: ${owner}/${repo}/${filePath}@${branch}`);
        return await this.githubAPI.getFileContent(owner, repo, filePath, branch);
      }
    }
    
    throw new Error(`Unsupported reference format: ${ref}`);
  }

  // Reset processed URLs for new session
  reset(): void {
    this.processedUrls.clear();
  }

  // Get statistics
  getStats(): { processedUrls: number; urls: string[] } {
    return {
      processedUrls: this.processedUrls.size,
      urls: Array.from(this.processedUrls)
    };
  }
}