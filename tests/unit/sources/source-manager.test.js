"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const source_manager_1 = require("../../../src/sources/source-manager");
const source_config_manager_1 = require("../../../src/config/source-config-manager");
const source_handler_1 = require("../../../src/sources/source-handler");
const github_handler_1 = require("../../../src/handlers/github-handler");
const local_handler_1 = require("../../../src/handlers/local-handler");
jest.mock('../../../src/config/source-config-manager');
jest.mock('../../../src/sources/source-handler');
jest.mock('../../../src/handlers/github-handler');
jest.mock('../../../src/handlers/local-handler');
const MockSourceConfigManager = source_config_manager_1.SourceConfigManager;
const MockSourceManager = source_handler_1.SourceManager;
const MockGitHubHandler = github_handler_1.GitHubHandler;
const MockLocalHandler = local_handler_1.LocalHandler;
describe('OmniSourceManager', () => {
    let omniSourceManager;
    let mockConfigLoader;
    let mockSourceManager;
    let mockGithubHandler;
    let mockLocalHandler;
    let mockSourceHandler;
    const originalEnv = process.env;
    const originalConsole = console;
    beforeEach(() => {
        jest.clearAllMocks();
        console.log = jest.fn();
        console.error = jest.fn();
        process.env = { ...originalEnv };
        delete process.env.BUNDLE_MODE;
        mockConfigLoader = new MockSourceConfigManager();
        mockSourceManager = new MockSourceManager();
        mockGithubHandler = new MockGitHubHandler('/tmp/repos');
        mockLocalHandler = new MockLocalHandler();
        mockSourceHandler = {
            initialize: jest.fn(),
            getSourceInfo: jest.fn(),
            listFiles: jest.fn(),
            getFile: jest.fn(),
            getFiles: jest.fn()
        };
        MockSourceConfigManager.mockImplementation(() => mockConfigLoader);
        MockSourceManager.mockImplementation(() => mockSourceManager);
        MockGitHubHandler.mockImplementation(() => mockGithubHandler);
        MockLocalHandler.mockImplementation(() => mockLocalHandler);
        omniSourceManager = new source_manager_1.OmniSourceManager();
    });
    afterEach(() => {
        process.env = originalEnv;
        console.log = originalConsole.log;
        console.error = originalConsole.error;
    });
    describe('constructor', () => {
        it('should initialize SourceManager and SourceConfigManager', () => {
            expect(MockSourceManager).toHaveBeenCalledTimes(2);
            expect(MockSourceConfigManager).toHaveBeenCalledTimes(2);
        });
        it('should register GitHub and Local handlers', () => {
            expect(MockGitHubHandler).toHaveBeenCalledWith('/tmp/repos');
            expect(MockLocalHandler).toHaveBeenCalledTimes(2);
            expect(mockSourceManager.registerHandler).toHaveBeenCalledWith('github', mockGithubHandler);
            expect(mockSourceManager.registerHandler).toHaveBeenCalledWith('local', mockLocalHandler);
        });
    });
    describe('initializeSources', () => {
        it('should initialize GitHub sources from config', async () => {
            const mockConfig = {
                sources: [
                    { type: 'github', owner: 'test', repo: 'repo1', branch: 'main', token: 'token1' },
                    { type: 'github', owner: 'test', repo: 'repo2', branch: 'develop', token: 'token2' }
                ],
                files: { patterns: ['CLAUDE.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockSourceManager.initializeSource
                .mockResolvedValueOnce(mockSourceHandler)
                .mockResolvedValueOnce(mockSourceHandler);
            mockSourceHandler.getSourceInfo
                .mockReturnValueOnce('GitHub: test/repo1@main')
                .mockReturnValueOnce('GitHub: test/repo2@develop');
            await omniSourceManager.initializeSources();
            expect(mockSourceManager.initializeSource).toHaveBeenCalledWith('github:test/repo1');
            expect(mockSourceManager.initializeSource).toHaveBeenCalledWith('github:test/repo2');
            expect(console.log).toHaveBeenCalledWith('Initialized source: GitHub: test/repo1@main');
            expect(console.log).toHaveBeenCalledWith('Initialized source: GitHub: test/repo2@develop');
        });
        it('should initialize local sources from config', async () => {
            const mockConfig = {
                sources: [
                    { type: 'local', path: '/path/to/local1' },
                    { type: 'local', path: '/path/to/local2' }
                ],
                files: { patterns: ['CLAUDE.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockSourceManager.initializeSource
                .mockResolvedValueOnce(mockSourceHandler)
                .mockResolvedValueOnce(mockSourceHandler);
            mockSourceHandler.getSourceInfo
                .mockReturnValueOnce('Local: /path/to/local1')
                .mockReturnValueOnce('Local: /path/to/local2');
            await omniSourceManager.initializeSources();
            expect(mockSourceManager.initializeSource).toHaveBeenCalledWith('local:/path/to/local1');
            expect(mockSourceManager.initializeSource).toHaveBeenCalledWith('local:/path/to/local2');
            expect(console.log).toHaveBeenCalledWith('Initialized source: Local: /path/to/local1');
            expect(console.log).toHaveBeenCalledWith('Initialized source: Local: /path/to/local2');
        });
        it('should handle mixed source types', async () => {
            const mockConfig = {
                sources: [
                    { type: 'github', owner: 'test', repo: 'repo', branch: 'main', token: 'token' },
                    { type: 'local', path: '/path/to/local' }
                ],
                files: { patterns: ['CLAUDE.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockSourceManager.initializeSource
                .mockResolvedValueOnce(mockSourceHandler)
                .mockResolvedValueOnce(mockSourceHandler);
            mockSourceHandler.getSourceInfo
                .mockReturnValueOnce('GitHub: test/repo@main')
                .mockReturnValueOnce('Local: /path/to/local');
            await omniSourceManager.initializeSources();
            expect(mockSourceManager.initializeSource).toHaveBeenCalledWith('github:test/repo');
            expect(mockSourceManager.initializeSource).toHaveBeenCalledWith('local:/path/to/local');
        });
        it('should skip invalid source types', async () => {
            const mockConfig = {
                sources: [
                    { type: 'github', owner: 'test', repo: 'repo', branch: 'main' },
                    { type: 'invalid', some: 'property' },
                    { type: 'local', path: '/path/to/local' }
                ],
                files: { patterns: ['CLAUDE.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockSourceManager.initializeSource
                .mockResolvedValueOnce(mockSourceHandler)
                .mockResolvedValueOnce(mockSourceHandler);
            mockSourceHandler.getSourceInfo
                .mockReturnValueOnce('GitHub: test/repo@main')
                .mockReturnValueOnce('Local: /path/to/local');
            await omniSourceManager.initializeSources();
            expect(mockSourceManager.initializeSource).toHaveBeenCalledTimes(2);
            expect(mockSourceManager.initializeSource).toHaveBeenCalledWith('github:test/repo');
            expect(mockSourceManager.initializeSource).toHaveBeenCalledWith('local:/path/to/local');
        });
        it('should handle initialization errors gracefully', async () => {
            const mockConfig = {
                sources: [
                    { type: 'github', owner: 'test', repo: 'repo1', branch: 'main' },
                    { type: 'github', owner: 'test', repo: 'repo2', branch: 'main' }
                ],
                files: { patterns: ['CLAUDE.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockSourceManager.initializeSource
                .mockRejectedValueOnce(new Error('Initialization failed'))
                .mockResolvedValueOnce(mockSourceHandler);
            mockSourceHandler.getSourceInfo.mockReturnValue('GitHub: test/repo2@main');
            await omniSourceManager.initializeSources();
            expect(console.error).toHaveBeenCalledWith('Failed to initialize source:', expect.any(Error));
            expect(console.log).toHaveBeenCalledWith('Initialized source: GitHub: test/repo2@main');
        });
        it('should handle empty sources configuration', async () => {
            const mockConfig = {
                sources: [],
                files: { patterns: ['CLAUDE.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue([]);
            await omniSourceManager.initializeSources();
            expect(console.log).toHaveBeenCalledWith('No sources configured');
            expect(mockSourceManager.initializeSource).not.toHaveBeenCalled();
        });
        it('should handle undefined sources configuration', async () => {
            const mockConfig = {
                files: { patterns: ['CLAUDE.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue([]);
            await omniSourceManager.initializeSources();
            expect(console.log).toHaveBeenCalledWith('No sources configured');
            expect(mockSourceManager.initializeSource).not.toHaveBeenCalled();
        });
    });
    describe('getSourceNames', () => {
        it('should return list of initialized source names', async () => {
            const mockConfig = {
                sources: [
                    { type: 'github', owner: 'test', repo: 'repo1', branch: 'main' },
                    { type: 'local', path: '/path/to/local' }
                ],
                files: { patterns: ['CLAUDE.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockSourceManager.initializeSource.mockResolvedValue(mockSourceHandler);
            mockSourceHandler.getSourceInfo.mockReturnValue('Source info');
            await omniSourceManager.initializeSources();
            const result = omniSourceManager.getSourceNames();
            expect(result).toEqual(['github:test/repo1', 'local:/path/to/local']);
        });
        it('should return empty array when no sources initialized', () => {
            const result = omniSourceManager.getSourceNames();
            expect(result).toEqual([]);
        });
    });
    describe('getSourceFiles', () => {
        beforeEach(async () => {
            const mockConfig = {
                sources: [{ type: 'github', owner: 'test', repo: 'repo', branch: 'main' }],
                files: { patterns: ['CLAUDE.md', '*.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockSourceManager.initializeSource.mockResolvedValue(mockSourceHandler);
            mockSourceHandler.getSourceInfo.mockReturnValue('GitHub: test/repo@main');
            await omniSourceManager.initializeSources();
        });
        it('should get files using default patterns from config', async () => {
            const mockFiles = new Map([['CLAUDE.md', 'content1'], ['README.md', 'content2']]);
            mockSourceHandler.getFiles.mockResolvedValue(mockFiles);
            const result = await omniSourceManager.getSourceFiles('github:test/repo');
            expect(mockSourceHandler.getFiles).toHaveBeenCalledWith(['CLAUDE.md', '*.md']);
            expect(result).toEqual(mockFiles);
        });
        it('should get files using custom patterns', async () => {
            const mockFiles = new Map([['custom.md', 'content']]);
            const customPatterns = ['custom.md', 'docs/*.md'];
            mockSourceHandler.getFiles.mockResolvedValue(mockFiles);
            const result = await omniSourceManager.getSourceFiles('github:test/repo', customPatterns);
            expect(mockSourceHandler.getFiles).toHaveBeenCalledWith(customPatterns);
            expect(result).toEqual(mockFiles);
        });
        it('should throw error for non-existent source', async () => {
            await expect(omniSourceManager.getSourceFiles('non-existent'))
                .rejects.toThrow('Source not found: non-existent');
        });
    });
    describe('getSourceFile', () => {
        beforeEach(async () => {
            const mockConfig = {
                sources: [{ type: 'github', owner: 'test', repo: 'repo', branch: 'main' }],
                files: { patterns: ['CLAUDE.md'], max_size: 1000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockSourceManager.initializeSource.mockResolvedValue(mockSourceHandler);
            mockSourceHandler.getSourceInfo.mockReturnValue('GitHub: test/repo@main');
            await omniSourceManager.initializeSources();
        });
        it('should get file content within size limit', async () => {
            const content = 'Small file content';
            mockSourceHandler.getFile.mockResolvedValue(content);
            const result = await omniSourceManager.getSourceFile('github:test/repo', 'small.md');
            expect(mockSourceHandler.getFile).toHaveBeenCalledWith('small.md');
            expect(result).toBe(content);
        });
        it('should throw error for file exceeding size limit', async () => {
            const largeContent = 'x'.repeat(2000);
            mockSourceHandler.getFile.mockResolvedValue(largeContent);
            await expect(omniSourceManager.getSourceFile('github:test/repo', 'large.md'))
                .rejects.toThrow('File too large: large.md (2000 bytes, max: 1000)');
        });
        it('should handle null file content', async () => {
            mockSourceHandler.getFile.mockResolvedValue(null);
            const result = await omniSourceManager.getSourceFile('github:test/repo', 'nonexistent.md');
            expect(result).toBeNull();
        });
        it('should throw error for non-existent source', async () => {
            await expect(omniSourceManager.getSourceFile('non-existent', 'file.md'))
                .rejects.toThrow('Source not found: non-existent');
        });
    });
    describe('listSourceFiles', () => {
        beforeEach(async () => {
            const mockConfig = {
                sources: [{ type: 'github', owner: 'test', repo: 'repo', branch: 'main' }],
                files: { patterns: ['CLAUDE.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            mockSourceManager.initializeSource.mockResolvedValue(mockSourceHandler);
            mockSourceHandler.getSourceInfo.mockReturnValue('GitHub: test/repo@main');
            await omniSourceManager.initializeSources();
        });
        it('should list files from source', async () => {
            const fileList = ['CLAUDE.md', 'README.md', 'docs/guide.md'];
            mockSourceHandler.listFiles.mockResolvedValue(fileList);
            const result = await omniSourceManager.listSourceFiles('github:test/repo');
            expect(mockSourceHandler.listFiles).toHaveBeenCalledTimes(1);
            expect(result).toEqual(fileList);
        });
        it('should throw error for non-existent source', async () => {
            await expect(omniSourceManager.listSourceFiles('non-existent'))
                .rejects.toThrow('Source not found: non-existent');
        });
    });
    describe('getBundleMode', () => {
        it('should return false when BUNDLE_MODE is not set', () => {
            const result = omniSourceManager.getBundleMode();
            expect(result).toBe(false);
        });
        it('should return true when BUNDLE_MODE is "true"', () => {
            process.env.BUNDLE_MODE = 'true';
            const result = omniSourceManager.getBundleMode();
            expect(result).toBe(true);
        });
        it('should return false when BUNDLE_MODE is "false"', () => {
            process.env.BUNDLE_MODE = 'false';
            const result = omniSourceManager.getBundleMode();
            expect(result).toBe(false);
        });
        it('should return false when BUNDLE_MODE is set to other values', () => {
            process.env.BUNDLE_MODE = 'maybe';
            const result = omniSourceManager.getBundleMode();
            expect(result).toBe(false);
        });
    });
    describe('getFilePatterns', () => {
        it('should return file patterns from config', () => {
            const mockConfig = {
                sources: [],
                files: { patterns: ['CLAUDE.md', '*.md', 'docs/**/*.md'], max_size: 100000 }
            };
            mockConfigLoader.getConfig.mockReturnValue(mockConfig);
            mockConfigLoader.getSources.mockReturnValue(mockConfig.sources);
            const result = omniSourceManager.getFilePatterns();
            expect(result).toEqual(['CLAUDE.md', '*.md', 'docs/**/*.md']);
        });
    });
});
