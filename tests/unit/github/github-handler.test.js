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
const github_handler_1 = require("../../../src/handlers/github-handler");
jest.mock('simple-git');
jest.mock('fs-extra');
jest.mock('path', () => ({
    ...jest.requireActual('path'),
    join: jest.fn()
}));
const mockSimpleGit = simple_git_1.default;
const mockFs = fs;
const mockPath = path;
describe('GitHubHandler', () => {
    let githubHandler;
    let mockGit;
    const baseDir = '/tmp/repos';
    const repoPath = 'owner/repo';
    const expectedLocalDir = path.join(baseDir, 'github-owner-repo');
    beforeEach(() => {
        jest.clearAllMocks();
        mockGit = {
            clone: jest.fn(),
        };
        mockSimpleGit.mockReturnValue(mockGit);
        mockPath.join.mockImplementation((...args) => {
            const filtered = args.filter(arg => arg !== '');
            return filtered.join('/');
        });
        githubHandler = new github_handler_1.GitHubHandler(baseDir);
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
            mockFs.existsSync.mockReturnValue(false);
            mockGit.clone.mockResolvedValue(undefined);
            await githubHandler.initialize(repoPath);
            expect(mockGit.clone).toHaveBeenCalledWith('https://github.com/owner/repo.git', '/tmp/repos/github-owner-repo', ['--depth', '1', '--single-branch']);
            expect(mockFs.removeSync).not.toHaveBeenCalled();
        });
        it('should remove existing directory before cloning', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.removeSync.mockImplementation(() => { });
            mockGit.clone.mockResolvedValue(undefined);
            await githubHandler.initialize(repoPath);
            expect(mockFs.removeSync).toHaveBeenCalledWith('/tmp/repos/github-owner-repo');
            expect(mockGit.clone).toHaveBeenCalledWith('https://github.com/owner/repo.git', '/tmp/repos/github-owner-repo', ['--depth', '1', '--single-branch']);
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
            mockGit.clone.mockResolvedValue(undefined);
            await githubHandler.initialize(complexRepoPath);
            expect(mockGit.clone).toHaveBeenCalledWith('https://github.com/complex-org/complex-repo-name.git', expectedComplexLocalDir, ['--depth', '1', '--single-branch']);
        });
    });
    describe('getFiles', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(false);
            mockGit.clone.mockResolvedValue(undefined);
            await githubHandler.initialize(repoPath);
        });
        it('should get files that exist and are files', async () => {
            const patterns = ['CLAUDE.md', 'README.md', 'nonexistent.md'];
            const content1 = 'CLAUDE content';
            const content2 = 'README content';
            mockFs.existsSync
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockFs.statSync
                .mockReturnValueOnce({ isFile: () => true })
                .mockReturnValueOnce({ isFile: () => true });
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
            mockFs.statSync.mockReturnValue({ isFile: () => false });
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
            mockFs.statSync.mockReturnValue({ isFile: () => true });
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File read error');
            });
            await expect(githubHandler.getFiles(patterns)).rejects.toThrow('File read error');
        });
    });
    describe('getFile', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(false);
            mockGit.clone.mockResolvedValue(undefined);
            await githubHandler.initialize(repoPath);
        });
        it('should get file content when file exists', async () => {
            const fileName = 'test.md';
            const content = 'Test content';
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(content);
            const result = await githubHandler.getFile(fileName);
            expect(result).toBe(content);
            expect(mockFs.readFileSync).toHaveBeenCalledWith('/tmp/repos/github-owner-repo/test.md', 'utf-8');
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
            mockGit.clone.mockResolvedValue(undefined);
            await githubHandler.initialize(repoPath);
        });
        it('should return empty array if local directory does not exist', async () => {
            mockFs.existsSync.mockReturnValue(false);
            const result = await githubHandler.listFiles();
            expect(result).toEqual([]);
        });
        it('should list all markdown and text files recursively', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue([
                'CLAUDE.md', 'README.txt', 'config.json'
            ]);
            mockFs.statSync.mockReturnValue({ isDirectory: () => false });
            const result = await githubHandler.listFiles();
            expect(result).toEqual([
                'CLAUDE.md',
                'README.txt',
                'config.json'
            ]);
        });
        it('should handle empty directories', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue([]);
            const result = await githubHandler.listFiles();
            expect(result).toEqual([]);
        });
        it('should filter out hidden directories and node_modules', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync
                .mockReturnValueOnce([
                'CLAUDE.md', '.git', '.github', 'node_modules', 'src'
            ])
                .mockReturnValueOnce([]);
            mockFs.statSync
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => true })
                .mockReturnValueOnce({ isDirectory: () => true })
                .mockReturnValueOnce({ isDirectory: () => true })
                .mockReturnValueOnce({ isDirectory: () => true });
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
            mockGit.clone.mockResolvedValue(undefined);
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
            mockGit.clone.mockResolvedValue(undefined);
            await githubHandler.initialize(invalidRepoPath);
            expect(mockGit.clone).toHaveBeenCalledWith('https://github.com/invalid/repo/with/too/many/parts.git', path.join(baseDir, 'github-invalid-repo'), ['--depth', '1', '--single-branch']);
        });
        it('should handle special characters in repository names', async () => {
            const specialRepoPath = 'owner/repo-with-special_chars.test';
            const expectedSpecialLocalDir = path.join(baseDir, 'github-owner-repo-with-special_chars.test');
            mockFs.existsSync.mockReturnValue(false);
            mockGit.clone.mockResolvedValue(undefined);
            await githubHandler.initialize(specialRepoPath);
            expect(mockGit.clone).toHaveBeenCalledWith('https://github.com/owner/repo-with-special_chars.test.git', expectedSpecialLocalDir, ['--depth', '1', '--single-branch']);
        });
    });
});
