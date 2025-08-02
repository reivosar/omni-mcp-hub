import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';
import { GitManager } from '../../src/github/git-manager';

// Mock dependencies
jest.mock('simple-git');
jest.mock('fs-extra');
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn()
}));

const mockSimpleGit = simpleGit as jest.MockedFunction<typeof simpleGit>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('GitManager', () => {
  let gitManager: GitManager;
  let mockGit: jest.Mocked<SimpleGit>;
  const mockReposDir = '/mock/repos';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variable
    process.env.REPOS_DIR = mockReposDir;
    
    // Create mock git instance
    mockGit = {
      clone: jest.fn(),
    } as any;
    
    mockSimpleGit.mockReturnValue(mockGit);
    mockPath.join.mockImplementation((...args) => {
      const filtered = args.filter(arg => arg !== '');
      return filtered.join('/');
    });
    
    gitManager = new GitManager();
  });

  afterEach(() => {
    delete process.env.REPOS_DIR;
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with REPOS_DIR environment variable', () => {
      expect(mockFs.ensureDirSync).toHaveBeenCalledWith(mockReposDir);
      expect(mockSimpleGit).toHaveBeenCalledTimes(1);
    });

    it('should use default directory when REPOS_DIR not set', () => {
      delete process.env.REPOS_DIR;
      jest.clearAllMocks();
      
      new GitManager();
      
      expect(mockFs.ensureDirSync).toHaveBeenCalledWith('/tmp/repos');
    });

    it('should initialize simple-git', () => {
      expect(mockSimpleGit).toHaveBeenCalledTimes(1);
    });
  });

  describe('cloneRepository', () => {
    const repoPath = 'owner/repo';
    const expectedLocalDir = '/mock/repos/owner-repo';
    const expectedGitUrl = 'https://github.com/owner/repo.git';

    it('should clone repository successfully', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockResolvedValue(undefined as any);

      await gitManager.cloneRepository(repoPath);

      expect(mockGit.clone).toHaveBeenCalledWith(
        expectedGitUrl,
        expectedLocalDir,
        ['--depth', '1']
      );
    });

    it('should remove existing directory before cloning', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.removeSync.mockImplementation(() => {});
      mockGit.clone.mockResolvedValue(undefined as any);

      await gitManager.cloneRepository(repoPath);

      expect(mockFs.removeSync).toHaveBeenCalledWith(expectedLocalDir);
      expect(mockGit.clone).toHaveBeenCalledWith(
        expectedGitUrl,
        expectedLocalDir,
        ['--depth', '1']
      );
    });

    it('should throw error for invalid repository path (missing owner)', async () => {
      await expect(gitManager.cloneRepository('repo'))
        .rejects.toThrow('Invalid repository path: repo');
    });

    it('should throw error for invalid repository path (missing repo)', async () => {
      await expect(gitManager.cloneRepository('owner/'))
        .rejects.toThrow('Invalid repository path: owner/');
    });

    it('should throw error for empty repository path', async () => {
      await expect(gitManager.cloneRepository(''))
        .rejects.toThrow('Invalid repository path: ');
    });

    it('should handle git clone errors', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockRejectedValue(new Error('Clone failed'));

      await expect(gitManager.cloneRepository(repoPath))
        .rejects.toThrow('Clone failed');
    });

    it('should construct correct local directory path', async () => {
      const complexRepoPath = 'complex-org/complex-repo-name';
      const expectedComplexLocalDir = '/mock/repos/complex-org-complex-repo-name';
      
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockResolvedValue(undefined as any);

      await gitManager.cloneRepository(complexRepoPath);

      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://github.com/complex-org/complex-repo-name.git',
        expectedComplexLocalDir,
        ['--depth', '1']
      );
    });
  });

  describe('getRepositoryFiles', () => {
    const repoPath = 'owner/repo';
    const expectedLocalDir = '/mock/repos/owner-repo';

    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true); // Directory exists by default
    });

    it('should get files that exist and are files', () => {
      const patterns = ['CLAUDE.md', 'README.md', 'nonexistent.md'];
      const content1 = 'CLAUDE content';
      const content2 = 'README content';

      // Mock file existence and stats
      mockFs.existsSync
        .mockReturnValueOnce(true)  // Directory exists (initial check)
        .mockReturnValueOnce(true)  // CLAUDE.md exists
        .mockReturnValueOnce(true)  // README.md exists
        .mockReturnValueOnce(false); // nonexistent.md doesn't exist

      mockFs.statSync
        .mockReturnValueOnce({ isFile: () => true } as any)  // CLAUDE.md is file
        .mockReturnValueOnce({ isFile: () => true } as any); // README.md is file

      mockFs.readFileSync
        .mockReturnValueOnce(content1)
        .mockReturnValueOnce(content2);

      const result = gitManager.getRepositoryFiles(repoPath, patterns);

      expect(result).toEqual(new Map([
        ['CLAUDE.md', content1],
        ['README.md', content2]
      ]));
    });

    it('should use default patterns when none provided', () => {
      const content1 = 'CLAUDE content';
      const content2 = 'README content';

      mockFs.existsSync
        .mockReturnValueOnce(true)  // Directory exists
        .mockReturnValueOnce(true)  // CLAUDE.md exists
        .mockReturnValueOnce(true); // README.md exists

      mockFs.statSync
        .mockReturnValueOnce({ isFile: () => true } as any)
        .mockReturnValueOnce({ isFile: () => true } as any);

      mockFs.readFileSync
        .mockReturnValueOnce(content1)
        .mockReturnValueOnce(content2);

      const result = gitManager.getRepositoryFiles(repoPath);

      expect(result).toEqual(new Map([
        ['CLAUDE.md', content1],
        ['README.md', content2]
      ]));
    });

    it('should skip files that are directories', () => {
      const patterns = ['some-dir'];

      mockFs.existsSync
        .mockReturnValueOnce(true)  // Directory exists
        .mockReturnValueOnce(true); // some-dir exists

      mockFs.statSync.mockReturnValue({ isFile: () => false } as any);

      const result = gitManager.getRepositoryFiles(repoPath, patterns);

      expect(result).toEqual(new Map());
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should throw error when repository directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => gitManager.getRepositoryFiles(repoPath))
        .toThrow('Repository not found: owner/repo');
    });

    it('should handle empty patterns array', () => {
      const result = gitManager.getRepositoryFiles(repoPath, []);
      expect(result).toEqual(new Map());
    });
  });

  describe('getRepositoryFile', () => {
    const repoPath = 'owner/repo';
    const fileName = 'test.md';
    const expectedFilePath = '/mock/repos/owner-repo/test.md';

    it('should get file content when file exists', () => {
      const content = 'Test content';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(content);

      const result = gitManager.getRepositoryFile(repoPath, fileName);

      expect(result).toBe(content);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(expectedFilePath, 'utf-8');
    });

    it('should return null when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = gitManager.getRepositoryFile(repoPath, fileName);

      expect(result).toBeNull();
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle file read errors', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      expect(() => gitManager.getRepositoryFile(repoPath, fileName))
        .toThrow('File read error');
    });
  });

  describe('listRepositoryFiles', () => {
    const repoPath = 'owner/repo';
    const expectedLocalDir = '/mock/repos/owner-repo';

    it('should return empty array if directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = gitManager.listRepositoryFiles(repoPath);

      expect(result).toEqual([]);
    });

    it('should list all markdown files recursively', () => {
      // Simplified test - just flat directory structure first
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'CLAUDE.md', 'README.md', 'other.txt'
      ] as any);
      mockFs.statSync
        .mockReturnValue({ isDirectory: () => false } as any); // All are files

      const result = gitManager.listRepositoryFiles(repoPath);

      expect(result).toEqual([
        'CLAUDE.md',
        'README.md'
      ]);
    });

    it('should handle empty directories', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([] as any);

      const result = gitManager.listRepositoryFiles(repoPath);

      expect(result).toEqual([]);
    });

    it('should filter out hidden directories', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync
        .mockReturnValueOnce([
          'CLAUDE.md', '.git', '.github', 'src'
        ] as any)  // Root directory
        .mockReturnValueOnce([] as any); // src directory (empty)

      mockFs.statSync
        .mockReturnValueOnce({ isDirectory: () => false } as any) // CLAUDE.md
        .mockReturnValueOnce({ isDirectory: () => true } as any)  // .git (skipped)
        .mockReturnValueOnce({ isDirectory: () => true } as any)  // .github (skipped)
        .mockReturnValueOnce({ isDirectory: () => true } as any); // src (will recurse)

      const result = gitManager.listRepositoryFiles(repoPath);

      expect(result).toEqual(['CLAUDE.md']);
    });

    it('should handle file system errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => gitManager.listRepositoryFiles(repoPath))
        .toThrow('Permission denied');
    });
  });
});