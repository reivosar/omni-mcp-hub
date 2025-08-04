"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const simple_git_1 = __importDefault(require("simple-git"));
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const git_manager_1 = require("../../../src/github/git-manager");
jest.mock('simple-git');
jest.mock('fs-extra');
jest.mock('path', () => ({
    ...jest.requireActual('path'),
    join: jest.fn()
}));
const mockSimpleGit = simple_git_1.default;
const mockFs = fs;
const mockPath = path;
describe('GitManager', () => {
    let gitManager;
    let mockGit;
    const mockReposDir = '/mock/repos';
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.REPOS_DIR = mockReposDir;
        mockGit = {
            clone: jest.fn(),
        };
        mockSimpleGit.mockReturnValue(mockGit);
        mockPath.join.mockImplementation((...args) => {
            const filtered = args.filter(arg => arg !== '');
            return filtered.join('/');
        });
        gitManager = new git_manager_1.GitManager();
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
            new git_manager_1.GitManager();
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
            mockGit.clone.mockResolvedValue(undefined);
            await gitManager.cloneRepository(repoPath);
            expect(mockGit.clone).toHaveBeenCalledWith(expectedGitUrl, expectedLocalDir, ['--depth', '1']);
        });
        it('should remove existing directory before cloning', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.removeSync.mockImplementation(() => { });
            mockGit.clone.mockResolvedValue(undefined);
            await gitManager.cloneRepository(repoPath);
            expect(mockFs.removeSync).toHaveBeenCalledWith(expectedLocalDir);
            expect(mockGit.clone).toHaveBeenCalledWith(expectedGitUrl, expectedLocalDir, ['--depth', '1']);
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
            mockGit.clone.mockResolvedValue(undefined);
            await gitManager.cloneRepository(complexRepoPath);
            expect(mockGit.clone).toHaveBeenCalledWith('https://github.com/complex-org/complex-repo-name.git', expectedComplexLocalDir, ['--depth', '1']);
        });
    });
    describe('getRepositoryFiles', () => {
        const repoPath = 'owner/repo';
        const expectedLocalDir = '/mock/repos/owner-repo';
        beforeEach(() => {
            mockFs.existsSync.mockReturnValue(true);
        });
        it('should get files that exist and are files', () => {
            const patterns = ['CLAUDE.md', 'README.md', 'nonexistent.md'];
            const content1 = 'CLAUDE content';
            const content2 = 'README content';
            mockFs.existsSync
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockFs.statSync
                .mockReturnValueOnce({ isFile: () => true })
                .mockReturnValueOnce({ isFile: () => true });
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
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true);
            mockFs.statSync
                .mockReturnValueOnce({ isFile: () => true })
                .mockReturnValueOnce({ isFile: () => true });
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
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true);
            mockFs.statSync.mockReturnValue({ isFile: () => false });
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
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue([
                'CLAUDE.md', 'README.md', 'other.txt'
            ]);
            mockFs.statSync
                .mockReturnValue({ isDirectory: () => false });
            const result = gitManager.listRepositoryFiles(repoPath);
            expect(result).toEqual([
                'CLAUDE.md',
                'README.md'
            ]);
        });
        it('should handle empty directories', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue([]);
            const result = gitManager.listRepositoryFiles(repoPath);
            expect(result).toEqual([]);
        });
        it('should filter out hidden directories', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync
                .mockReturnValueOnce([
                'CLAUDE.md', '.git', '.github', 'src'
            ])
                .mockReturnValueOnce([]);
            mockFs.statSync
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => true })
                .mockReturnValueOnce({ isDirectory: () => true })
                .mockReturnValueOnce({ isDirectory: () => true });
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
