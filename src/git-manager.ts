import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';

export class GitManager {
  private reposDir: string;
  private git: SimpleGit;

  constructor() {
    this.reposDir = process.env.REPOS_DIR || '/app/repos';
    this.git = simpleGit();
    
    // Ensure repos directory exists
    fs.ensureDirSync(this.reposDir);
  }

  async cloneRepository(repoPath: string): Promise<void> {
    const [owner, repo] = repoPath.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository path: ${repoPath}`);
    }

    const localDir = path.join(this.reposDir, `${owner}-${repo}`);
    const gitUrl = `https://github.com/${repoPath}.git`;

    // Remove existing directory if exists
    if (fs.existsSync(localDir)) {
      fs.removeSync(localDir);
    }

    await this.git.clone(gitUrl, localDir, ['--depth', '1']);
  }

  getRepositoryFiles(repoPath: string, patterns: string[] = ['CLAUDE.md', 'README.md']): Map<string, string> {
    const [owner, repo] = repoPath.split('/');
    const localDir = path.join(this.reposDir, `${owner}-${repo}`);
    const files = new Map<string, string>();

    if (!fs.existsSync(localDir)) {
      throw new Error(`Repository not found: ${repoPath}`);
    }

    for (const pattern of patterns) {
      const filePath = path.join(localDir, pattern);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const content = fs.readFileSync(filePath, 'utf-8');
        files.set(pattern, content);
      }
    }

    return files;
  }

  getRepositoryFile(repoPath: string, fileName: string): string | null {
    const [owner, repo] = repoPath.split('/');
    const localDir = path.join(this.reposDir, `${owner}-${repo}`);
    const filePath = path.join(localDir, fileName);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath, 'utf-8');
  }

  listRepositoryFiles(repoPath: string): string[] {
    const [owner, repo] = repoPath.split('/');
    const localDir = path.join(this.reposDir, `${owner}-${repo}`);

    if (!fs.existsSync(localDir)) {
      return [];
    }

    const findMarkdownFiles = (dir: string, relativePath = ''): string[] => {
      const files: string[] = [];
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativeItemPath = path.join(relativePath, item);

        if (fs.statSync(fullPath).isDirectory() && !item.startsWith('.')) {
          files.push(...findMarkdownFiles(fullPath, relativeItemPath));
        } else if (item.endsWith('.md')) {
          files.push(relativeItemPath);
        }
      }

      return files;
    };

    return findMarkdownFiles(localDir);
  }
}