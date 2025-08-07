import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';
import { SourceHandler } from '../sources/source-handler';
import { ReferenceResolver } from '../utils/reference-resolver';
import { GitHubAPI } from './github-api';

export class GitHubRepositoryHandler implements SourceHandler {
  private repoPath: string = '';
  private localDir: string = '';
  private git: SimpleGit;
  private referenceResolver!: ReferenceResolver;

  constructor(private baseDir: string) {
    this.git = simpleGit();
  }

  async initialize(repoPath: string): Promise<void> {
    this.repoPath = repoPath;
    const [owner, repo] = repoPath.split('/');
    
    if (!owner || !repo) {
      throw new Error(`Invalid GitHub repository path: ${repoPath}`);
    }

    this.localDir = path.join(this.baseDir, `github-${owner}-${repo}`);
    const gitUrl = `https://github.com/${repoPath}.git`;

    // Remove existing directory if exists
    if (fs.existsSync(this.localDir)) {
      fs.removeSync(this.localDir);
    }

    await this.git.clone(gitUrl, this.localDir, ['--depth', '1', '--single-branch']);
    
    // Initialize reference resolver with GitHub API
    const githubAPI = new GitHubAPI();
    this.referenceResolver = new ReferenceResolver(githubAPI);
  }

  async getFiles(patterns: string[]): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    for (const pattern of patterns) {
      const filePath = path.join(this.localDir, pattern);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const content = fs.readFileSync(filePath, 'utf-8');
        files.set(pattern, content);
      }
    }

    return files;
  }

  async getFile(fileName: string): Promise<string | null> {
    const filePath = path.join(this.localDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Resolve external references if content is markdown
    if (fileName.endsWith('.md')) {
      try {
        const externalRefs = await this.referenceResolver.resolveReferences(
          content, 
          'main',
          { maxDepth: 2, timeout: 10000, retries: 3, retryDelay: 1000 }
        );
        
        if (externalRefs.length > 0) {
          console.log(`Resolved ${externalRefs.length} external references for ${fileName}`);
          
          // Append external references to the original content
          let enhancedContent = content + '\n\n<!-- External References -->\n';
          for (const ref of externalRefs) {
            enhancedContent += `\n## External Reference: ${ref.url}\n`;
            if (ref.error) {
              enhancedContent += `Error: ${ref.error}\n`;
            } else {
              enhancedContent += ref.content + '\n';
            }
          }
          return enhancedContent;
        }
      } catch (error) {
        console.warn(`Failed to resolve external references for ${fileName}:`, error);
      }
    }

    return content;
  }

  async listFiles(): Promise<string[]> {
    if (!fs.existsSync(this.localDir)) {
      return [];
    }

    const findAllFiles = (dir: string, relativePath = ''): string[] => {
      const files: string[] = [];
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativeItemPath = path.join(relativePath, item);

        if (fs.statSync(fullPath).isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          files.push(...findAllFiles(fullPath, relativeItemPath));
        } else if (item.endsWith('.md') || item.endsWith('.txt') || item.endsWith('.json') || item.endsWith('.yaml') || item.endsWith('.yml')) {
          files.push(relativeItemPath);
        }
      }

      return files;
    };

    return findAllFiles(this.localDir);
  }

  getSourceInfo(): string {
    return `GitHub: ${this.repoPath}`;
  }
}