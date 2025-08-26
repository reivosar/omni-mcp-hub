/**
 * GitHub Client for fetching repository content
 * Provides access to GitHub repositories via REST API
 */

import { ILogger, SilentLogger } from "./logger.js";

export interface GitHubFile {
  name: string;
  path: string;
  content: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  download_url?: string;
}

interface GitHubApiFile {
  name: string;
  path: string;
  content: string;
  sha: string;
  size: number;
  type: string;
  download_url: string;
}

interface GitHubApiDirectoryItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: string;
  download_url?: string;
}

interface GitHubApiRepository {
  name: string;
  full_name: string;
  description: string;
  default_branch: string;
}

export interface GitHubDirectory {
  name: string;
  path: string;
  files: GitHubFile[];
  directories: GitHubDirectory[];
}

export interface GitHubRepoConfig {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  token?: string;
}

export class GitHubClient {
  private logger: ILogger;
  private baseUrl = "https://api.github.com";

  constructor(logger?: ILogger) {
    this.logger = logger || new SilentLogger();
  }

  /**
   * Fetch file content from GitHub repository
   */
  async fetchFile(
    config: GitHubRepoConfig,
    filePath: string,
  ): Promise<GitHubFile | null> {
    try {
      const url = `${this.baseUrl}/repos/${config.owner}/${config.repo}/contents/${filePath}`;
      const params = new URLSearchParams();
      if (config.branch) {
        params.set("ref", config.branch);
      }

      const response = await fetch(`${url}?${params}`, {
        headers: this.getHeaders(config.token),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as GitHubApiFile;

      if (data.type !== "file") {
        throw new Error(`Path ${filePath} is not a file`);
      }

      // Decode base64 content
      const content = Buffer.from(data.content, "base64").toString("utf8");

      return {
        name: data.name,
        path: data.path,
        content,
        sha: data.sha,
        size: data.size,
        type: "file",
        download_url: data.download_url,
      };
    } catch (error) {
      this.logger.error(`Error fetching file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Fetch directory contents from GitHub repository
   */
  async fetchDirectory(
    config: GitHubRepoConfig,
    dirPath: string = "",
  ): Promise<GitHubDirectory> {
    try {
      const url = `${this.baseUrl}/repos/${config.owner}/${config.repo}/contents/${dirPath}`;
      const params = new URLSearchParams();
      if (config.branch) {
        params.set("ref", config.branch);
      }

      const response = await fetch(`${url}?${params}`, {
        headers: this.getHeaders(config.token),
      });

      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as GitHubApiDirectoryItem[];

      if (!Array.isArray(data)) {
        throw new Error(`Path ${dirPath} is not a directory`);
      }

      const files: GitHubFile[] = [];
      const directories: GitHubDirectory[] = [];

      for (const item of data) {
        if (item.type === "file") {
          files.push({
            name: item.name,
            path: item.path,
            content: "", // Content not fetched for directory listings
            sha: item.sha,
            size: item.size,
            type: "file",
            download_url: item.download_url,
          });
        } else if (item.type === "dir") {
          // For directories, we'll just create a basic entry without recursing
          directories.push({
            name: item.name,
            path: item.path,
            files: [],
            directories: [],
          });
        }
      }

      return {
        name: dirPath.split("/").pop() || "root",
        path: dirPath,
        files,
        directories,
      };
    } catch (error) {
      this.logger.error(`Error fetching directory ${dirPath}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all markdown files from a directory recursively
   */
  async fetchMarkdownFiles(
    config: GitHubRepoConfig,
    dirPath: string = "",
  ): Promise<GitHubFile[]> {
    try {
      const directory = await this.fetchDirectory(config, dirPath);
      const markdownFiles: GitHubFile[] = [];

      // Get markdown files from current directory
      const mdFiles = directory.files.filter(
        (file) =>
          file.name.toLowerCase().endsWith(".md") ||
          file.name.toLowerCase().endsWith(".markdown"),
      );

      // Fetch content for each markdown file
      for (const mdFile of mdFiles) {
        try {
          const fileWithContent = await this.fetchFile(config, mdFile.path);
          if (fileWithContent) {
            markdownFiles.push(fileWithContent);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch content for ${mdFile.path}:`,
            error,
          );
        }
      }

      // Recursively process subdirectories
      for (const subdir of directory.directories) {
        try {
          const subdirMarkdownFiles = await this.fetchMarkdownFiles(
            config,
            subdir.path,
          );
          markdownFiles.push(...subdirMarkdownFiles);
        } catch (error) {
          this.logger.warn(
            `Failed to process subdirectory ${subdir.path}:`,
            error,
          );
        }
      }

      return markdownFiles;
    } catch (error) {
      this.logger.error(
        `Error fetching markdown files from ${dirPath}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch specific markdown files by pattern
   */
  async fetchMarkdownFilesByPattern(
    config: GitHubRepoConfig,
    dirPath: string,
    pattern: RegExp,
  ): Promise<GitHubFile[]> {
    try {
      const allMarkdownFiles = await this.fetchMarkdownFiles(config, dirPath);
      return allMarkdownFiles.filter(
        (file) => pattern.test(file.path) || pattern.test(file.name),
      );
    } catch (error) {
      this.logger.error(`Error fetching markdown files by pattern:`, error);
      throw error;
    }
  }

  /**
   * Get repository information
   */
  async getRepoInfo(config: GitHubRepoConfig): Promise<GitHubApiRepository> {
    try {
      const url = `${this.baseUrl}/repos/${config.owner}/${config.repo}`;
      const response = await fetch(url, {
        headers: this.getHeaders(config.token),
      });

      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`,
        );
      }

      return (await response.json()) as GitHubApiRepository;
    } catch (error) {
      this.logger.error("Error fetching repository info:", error);
      throw error;
    }
  }

  /**
   * Get headers for GitHub API requests
   */
  private getHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "omni-mcp-hub/1.0.0",
    };

    if (token) {
      headers["Authorization"] = `token ${token}`;
    }

    return headers;
  }

  /**
   * Parse GitHub URL to extract owner, repo, and branch
   */
  static parseGitHubUrl(url: string): Partial<GitHubRepoConfig> {
    try {
      const parsed = new URL(url);

      if (parsed.hostname !== "github.com") {
        throw new Error("Not a GitHub URL");
      }

      const pathParts = parsed.pathname
        .split("/")
        .filter((part) => part.length > 0);

      if (pathParts.length < 2) {
        throw new Error("Invalid GitHub URL format");
      }

      const owner = pathParts[0];
      const repo = pathParts[1];

      let branch = "main";
      let path = "";

      // Handle URLs like: https://github.com/owner/repo/tree/branch/path
      if (pathParts.length >= 4 && pathParts[2] === "tree") {
        branch = pathParts[3];
        if (pathParts.length > 4) {
          path = pathParts.slice(4).join("/");
        }
      }
      // Handle URLs like: https://github.com/owner/repo/blob/branch/path
      else if (pathParts.length >= 4 && pathParts[2] === "blob") {
        branch = pathParts[3];
        if (pathParts.length > 4) {
          path = pathParts.slice(4).join("/");
        }
      }

      return { owner, repo, branch, path };
    } catch (_error) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }
  }
}

/**
 * GitHub resource manager for MCP integration
 */
export class GitHubResourceManager {
  private client: GitHubClient;
  private cache: Map<string, unknown> = new Map();

  constructor(logger?: ILogger) {
    this.client = new GitHubClient(logger);
  }

  /**
   * Get cached data or fetch from GitHub (permanent cache)
   */
  private async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = this.cache.get(key);

    if (cached) {
      return cached as T;
    }

    const data = await fetcher();
    this.cache.set(key, data);

    return data;
  }

  /**
   * Get Claude Code Engineering Guide content
   */
  async getEngineeringGuide(token?: string): Promise<GitHubFile[]> {
    const config: GitHubRepoConfig = {
      owner: "reivosar",
      repo: "claude-code-engineering-guide",
      branch: "master",
      path: "markdown",
      token,
    };

    const cacheKey = `engineering-guide:${config.owner}/${config.repo}/${config.branch}/${config.path}`;

    return this.getOrFetch(cacheKey, async () => {
      return await this.client.fetchMarkdownFiles(config, config.path);
    });
  }

  /**
   * Get specific engineering guide file
   */
  async getEngineeringGuideFile(
    fileName: string,
    token?: string,
  ): Promise<GitHubFile | null> {
    const config: GitHubRepoConfig = {
      owner: "reivosar",
      repo: "claude-code-engineering-guide",
      branch: "master",
      path: "markdown",
      token,
    };

    const filePath = config.path ? `${config.path}/${fileName}` : fileName;
    const cacheKey = `engineering-guide-file:${config.owner}/${config.repo}/${config.branch}/${filePath}`;

    return this.getOrFetch(cacheKey, async () => {
      return await this.client.fetchFile(config, filePath);
    });
  }

  /**
   * Clear cache (manual override only)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
