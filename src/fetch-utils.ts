import fetch, { Response } from 'node-fetch';
import { TimeoutFetchOptions } from './types';

export class FetchUtils {
  static async fetchWithTimeout(
    url: string, 
    options: TimeoutFetchOptions = {}
  ): Promise<Response> {
    const {
      timeout = 10000, // 10 seconds default
      retries = 3,
      retryDelay = 1000, // 1 second
      ...fetchOptions
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain errors
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = new Error(`Request timeout after ${timeout}ms`);
          } else if (error.message.includes('404') || error.message.includes('401')) {
            // Don't retry on 404 or 401
            break;
          }
        }

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          console.log(`Fetch attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('All fetch attempts failed');
  }

  static async fetchTextWithRetry(
    url: string,
    options: TimeoutFetchOptions = {}
  ): Promise<string> {
    const response = await this.fetchWithTimeout(url, options);
    return await response.text();
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static normalizeGitHubUrl(url: string, branch: string = 'main'): string {
    // Convert GitHub blob URLs to raw URLs
    const blobMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/);
    if (blobMatch) {
      const [, owner, repo, , path] = blobMatch;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    }
    
    // Convert GitHub tree URLs to raw URLs for files
    const treeMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/);
    if (treeMatch) {
      const [, owner, repo, , path] = treeMatch;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    }
    
    // If already a raw URL, update branch if different
    const rawMatch = url.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)/);
    if (rawMatch) {
      const [, owner, repo, , path] = rawMatch;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    }
    
    return url;
  }
}