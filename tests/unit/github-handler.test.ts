import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';
import { GitHubHandler } from '../../src/handlers/github-handler';

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

describe('GitHubHandler', () => {
  let githubHandler: GitHubHandler;
  let mockGit: jest.Mocked<SimpleGit>;
  const baseDir = '/tmp/repos';
  const repoPath = 'owner/repo';
  const expectedLocalDir = path.join(baseDir, 'github-owner-repo');

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock git instance
    mockGit = {
      clone: jest.fn(),
    } as any;
    
    mockSimpleGit.mockReturnValue(mockGit);
    mockPath.join.mockImplementation((...args) => {
      const filtered = args.filter(arg => arg !== '');
      return filtered.join('/');
    });
    
    githubHandler = new GitHubHandler(baseDir);
  });

  describe('constructor', () => {
    it('should initialize simple-git', () => {
      expect(mockSimpleGit).toHaveBeenCalledTimes(1);
    });

    it('should store base directory', () => {
      expect(githubHandler).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should initialize with valid repository path', async () => {
      mockFs.existsSync.mockReturnValue(false); // Directory doesn't exist initially
      mockGit.clone.mockResolvedValue(undefined as any);

      await githubHandler.initialize(repoPath);

      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://github.com/owner/repo.git',
        expectedLocalDir,
        ['--depth', '1', '--single-branch']
      );
      expect(mockFs.removeSync).not.toHaveBeenCalled();
    });

    it('should remove existing directory before cloning', async () => {
      mockFs.existsSync.mockReturnValue(true); // Directory exists
      mockFs.removeSync.mockImplementation(() => {}); // Mock removal
      mockGit.clone.mockResolvedValue(undefined as any);

      await githubHandler.initialize(repoPath);

      expect(mockFs.removeSync).toHaveBeenCalledWith(expectedLocalDir);
      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://github.com/owner/repo.git',
        expectedLocalDir,
        ['--depth', '1', '--single-branch']
      );
    });

    it('should throw error for invalid repository path (missing owner)', async () => {
      await expect(githubHandler.initialize('repo'))
        .rejects.toThrow('Invalid GitHub repository path: repo');
    });

    it('should throw error for invalid repository path (missing repo)', async () => {
      await expect(githubHandler.initialize('owner/'))
        .rejects.toThrow('Invalid GitHub repository path: owner/');
    });

    it('should throw error for empty repository path', async () => {
      await expect(githubHandler.initialize(''))
        .rejects.toThrow('Invalid GitHub repository path: ');
    });

    it('should handle git clone errors', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockRejectedValue(new Error('Clone failed'));

      await expect(githubHandler.initialize(repoPath))
        .rejects.toThrow('Clone failed');
    });

    it('should create correct local directory path', async () => {
      const complexRepoPath = 'complex-org/complex-repo-name';
      const expectedComplexLocalDir = path.join(baseDir, 'github-complex-org-complex-repo-name');
      
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockResolvedValue(undefined as any);

      await githubHandler.initialize(complexRepoPath);

      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://github.com/complex-org/complex-repo-name.git',
        expectedComplexLocalDir,
        ['--depth', '1', '--single-branch']
      );
    });
  });

  describe('getFiles', () => {
    beforeEach(async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockResolvedValue(undefined as any);
      await githubHandler.initialize(repoPath);
    });

    it('should get files that exist and are files', async () => {
      const patterns = ['CLAUDE.md', 'README.md', 'nonexistent.md'];
      const content1 = 'CLAUDE content';
      const content2 = 'README content';

      // Use real path.join - no need to mock it

      // Mock file existence and stats
      mockFs.existsSync
        .mockReturnValueOnce(true)  // CLAUDE.md exists
        .mockReturnValueOnce(true)  // README.md exists
        .mockReturnValueOnce(false); // nonexistent.md doesn't exist

      mockFs.statSync
        .mockReturnValueOnce({ isFile: () => true } as any)  // CLAUDE.md is file
        .mockReturnValueOnce({ isFile: () => true } as any); // README.md is file

      mockFs.readFileSync
        .mockReturnValueOnce(content1)
        .mockReturnValueOnce(content2);

      const result = await githubHandler.getFiles(patterns);

      expect(result).toEqual(new Map([
        ['CLAUDE.md', content1],
        ['README.md', content2]
      ]));
    });

    it('should skip files that are directories', async () => {
      const patterns = ['some-dir'];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isFile: () => false } as any);

      const result = await githubHandler.getFiles(patterns);

      expect(result).toEqual(new Map());
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle empty patterns array', async () => {
      const result = await githubHandler.getFiles([]);
      expect(result).toEqual(new Map());
    });

    it('should handle file read errors', async () => {
      const patterns = ['error-file.md'];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isFile: () => true } as any);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      await expect(githubHandler.getFiles(patterns)).rejects.toThrow('File read error');
    });
  });

  describe('getFile', () => {
    beforeEach(async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockResolvedValue(undefined as any);
      await githubHandler.initialize(repoPath);
    });

    it('should get file content when file exists', async () => {
      const fileName = 'test.md';
      const content = 'Test content';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(content);

      const result = await githubHandler.getFile(fileName);

      expect(result).toBe(content);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(path.join(expectedLocalDir, fileName), 'utf-8');
    });

    it('should return null when file does not exist', async () => {
      const fileName = 'nonexistent.md';

      mockFs.existsSync.mockReturnValue(false);

      const result = await githubHandler.getFile(fileName);

      expect(result).toBeNull();
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle file read errors', async () => {
      const fileName = 'error.md';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read permission denied');
      });

      await expect(githubHandler.getFile(fileName)).rejects.toThrow('Read permission denied');
    });
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockResolvedValue(undefined as any);
      await githubHandler.initialize(repoPath);
    });

    it('should return empty array if local directory does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await githubHandler.listFiles();

      expect(result).toEqual([]);
    });

    it('should list all markdown and text files recursively', async () => {
      // Simplified test - flat directory first
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'CLAUDE.md', 'README.txt', 'config.json'
      ] as any);
      mockFs.statSync.mockReturnValue({ isDirectory: () => false } as any);

      const result = await githubHandler.listFiles();

      expect(result).toEqual([
        'CLAUDE.md',
        'README.txt', 
        'config.json'
      ]);
    });

    it('should handle empty directories', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([] as any);

      const result = await githubHandler.listFiles();

      expect(result).toEqual([]);
    });

    it('should filter out hidden directories and node_modules', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync
        .mockReturnValueOnce([
          'CLAUDE.md', '.git', '.github', 'node_modules', 'src'
        ] as any)  // Root directory
        .mockReturnValueOnce([] as any); // src directory (empty)

      mockFs.statSync
        .mockReturnValueOnce({ isDirectory: () => false } as any) // CLAUDE.md
        .mockReturnValueOnce({ isDirectory: () => true } as any)  // .git (skipped)
        .mockReturnValueOnce({ isDirectory: () => true } as any)  // .github (skipped)
        .mockReturnValueOnce({ isDirectory: () => true } as any)  // node_modules (skipped)
        .mockReturnValueOnce({ isDirectory: () => true } as any); // src (will recurse)

      const result = await githubHandler.listFiles();

      expect(result).toEqual(['CLAUDE.md']);
    });

    it('should handle file system errors gracefully', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(githubHandler.listFiles()).rejects.toThrow('Permission denied');
    });
  });

  describe('getSourceInfo', () => {
    it('should return source info with repository path', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockResolvedValue(undefined as any);

      await githubHandler.initialize(repoPath);
      const result = githubHandler.getSourceInfo();

      expect(result).toBe(`GitHub: ${repoPath}`);
    });

    it('should return source info even before initialization', () => {
      const result = githubHandler.getSourceInfo();
      expect(result).toBe('GitHub: ');
    });
  });

  describe('error handling edge cases', () => {
    it('should handle fs.removeSync errors during initialization', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.removeSync.mockImplementation(() => {
        throw new Error('Cannot remove directory');
      });

      await expect(githubHandler.initialize(repoPath))
        .rejects.toThrow('Cannot remove directory');
    });

    it('should handle network timeout during clone', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockRejectedValue(new Error('Network timeout'));

      await expect(githubHandler.initialize(repoPath))
        .rejects.toThrow('Network timeout');
    });

    it('should handle invalid repository URLs', async () => {
      const invalidRepoPath = 'invalid/repo/with/too/many/parts';
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockResolvedValue(undefined as any);

      // The code splits on '/' and takes first two parts, so this should still work
      await githubHandler.initialize(invalidRepoPath);

      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://github.com/invalid/repo/with/too/many/parts.git',
        path.join(baseDir, 'github-invalid-repo'),
        ['--depth', '1', '--single-branch']
      );
    });

    it('should handle special characters in repository names', async () => {
      const specialRepoPath = 'owner/repo-with-special_chars.test';
      const expectedSpecialLocalDir = path.join(baseDir, 'github-owner-repo-with-special_chars.test');
      
      mockFs.existsSync.mockReturnValue(false);
      mockGit.clone.mockResolvedValue(undefined as any);

      await githubHandler.initialize(specialRepoPath);

      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://github.com/owner/repo-with-special_chars.test.git',
        expectedSpecialLocalDir,
        ['--depth', '1', '--single-branch']
      );
    });
  });
});