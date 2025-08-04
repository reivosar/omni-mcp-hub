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
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const local_handler_1 = require("../../../src/handlers/local-handler");
jest.mock('fs-extra');
const mockFs = fs;
jest.mock('path', () => ({
    ...jest.requireActual('path'),
    resolve: jest.fn(),
    join: jest.fn()
}));
const mockPath = path;
describe('LocalHandler', () => {
    let localHandler;
    const mockSourcePath = '/test/path';
    const resolvedPath = '/resolved/test/path';
    beforeEach(() => {
        localHandler = new local_handler_1.LocalHandler();
        mockPath.resolve.mockReturnValue(resolvedPath);
        mockPath.join.mockImplementation((a, b) => `${a}/${b}`);
    });
    describe('initialize', () => {
        it('should initialize with valid directory path', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });
            await localHandler.initialize(mockSourcePath);
            expect(mockPath.resolve).toHaveBeenCalledWith(mockSourcePath);
            expect(mockFs.existsSync).toHaveBeenCalledWith(resolvedPath);
            expect(mockFs.statSync).toHaveBeenCalledWith(resolvedPath);
        });
        it('should throw error if path does not exist', async () => {
            mockFs.existsSync.mockReturnValue(false);
            await expect(localHandler.initialize(mockSourcePath))
                .rejects.toThrow(`Local path does not exist: ${resolvedPath}`);
        });
        it('should throw error if path is not a directory', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => false });
            await expect(localHandler.initialize(mockSourcePath))
                .rejects.toThrow(`Path is not a directory: ${resolvedPath}`);
        });
        it('should resolve relative paths to absolute paths', async () => {
            const relativePath = './relative/path';
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });
            await localHandler.initialize(relativePath);
            expect(mockPath.resolve).toHaveBeenCalledWith(relativePath);
        });
    });
    describe('getFiles', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });
            await localHandler.initialize(mockSourcePath);
            jest.clearAllMocks();
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
            const result = await localHandler.getFiles(patterns);
            expect(result).toEqual(new Map([
                ['CLAUDE.md', content1],
                ['README.md', content2]
            ]));
            expect(mockFs.readFileSync).toHaveBeenCalledWith(`${resolvedPath}/CLAUDE.md`, 'utf-8');
            expect(mockFs.readFileSync).toHaveBeenCalledWith(`${resolvedPath}/README.md`, 'utf-8');
        });
        it('should skip files that are directories', async () => {
            const patterns = ['some-dir'];
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isFile: () => false });
            const result = await localHandler.getFiles(patterns);
            expect(result).toEqual(new Map());
            expect(mockFs.readFileSync).not.toHaveBeenCalled();
        });
        it('should handle empty patterns array', async () => {
            const result = await localHandler.getFiles([]);
            expect(result).toEqual(new Map());
        });
        it('should handle file read errors', async () => {
            const patterns = ['error-file.md'];
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isFile: () => true });
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File read error');
            });
            await expect(localHandler.getFiles(patterns)).rejects.toThrow('File read error');
        });
    });
    describe('getFile', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });
            await localHandler.initialize(mockSourcePath);
            jest.clearAllMocks();
        });
        it('should get file content when file exists and is a file', async () => {
            const fileName = 'test.md';
            const content = 'Test content';
            const expectedPath = `${resolvedPath}/${fileName}`;
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isFile: () => true });
            mockFs.readFileSync.mockReturnValue(content);
            const result = await localHandler.getFile(fileName);
            expect(result).toBe(content);
            expect(mockFs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf-8');
        });
        it('should return null when file does not exist', async () => {
            const fileName = 'nonexistent.md';
            mockFs.existsSync.mockReturnValue(false);
            const result = await localHandler.getFile(fileName);
            expect(result).toBeNull();
            expect(mockFs.readFileSync).not.toHaveBeenCalled();
        });
        it('should return null when path exists but is not a file', async () => {
            const fileName = 'directory';
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isFile: () => false });
            const result = await localHandler.getFile(fileName);
            expect(result).toBeNull();
            expect(mockFs.readFileSync).not.toHaveBeenCalled();
        });
    });
    describe('listFiles', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReset();
            mockFs.statSync.mockReset();
            mockFs.readdirSync.mockReset();
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });
            await localHandler.initialize(mockSourcePath);
        });
        it('should list all markdown and text files recursively', async () => {
            mockFs.readdirSync.mockReset();
            mockFs.existsSync.mockReset();
            mockFs.statSync.mockReset();
            mockPath.join.mockReset();
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue([
                'CLAUDE.md', 'README.txt', 'config.json', 'script.js', 'binary.exe'
            ]);
            mockPath.join.mockImplementation((...args) => {
                const filtered = args.filter(arg => arg && arg !== '');
                if (filtered.length === 0)
                    return '';
                if (filtered.length === 1)
                    return filtered[0];
                return filtered.join('/');
            });
            mockFs.statSync
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => false });
            const result = await localHandler.listFiles();
            expect(result).toEqual([
                'CLAUDE.md',
                'README.txt',
                'config.json'
            ]);
        });
        it('should handle empty directories', async () => {
            mockFs.readdirSync.mockReturnValue([]);
            mockFs.existsSync.mockReturnValue(true);
            const result = await localHandler.listFiles();
            expect(result).toEqual([]);
        });
        it('should handle non-existent subdirectories gracefully', async () => {
            mockFs.readdirSync.mockReset();
            mockFs.existsSync.mockReset();
            mockFs.statSync.mockReset();
            mockPath.join.mockReset();
            mockFs.readdirSync
                .mockReturnValueOnce(['CLAUDE.md', 'nonexistent-dir']);
            mockFs.existsSync
                .mockImplementation((path) => {
                if (String(path).includes('nonexistent-dir'))
                    return false;
                return true;
            });
            mockPath.join.mockImplementation((...args) => {
                const filtered = args.filter(arg => arg && arg !== '');
                if (filtered.length === 0)
                    return '';
                if (filtered.length === 1)
                    return filtered[0];
                if (filtered[1] && filtered[0] === '') {
                    return filtered[1];
                }
                return filtered.join('/');
            });
            mockFs.statSync
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => true });
            const result = await localHandler.listFiles();
            expect(result).toEqual(['CLAUDE.md']);
        });
        it('should filter out hidden directories and node_modules', async () => {
            mockFs.readdirSync.mockReset();
            mockFs.existsSync.mockReset();
            mockFs.statSync.mockReset();
            mockPath.join.mockReset();
            mockFs.readdirSync
                .mockReturnValueOnce([
                'CLAUDE.md', '.git', '.vscode', 'node_modules', 'src'
            ])
                .mockReturnValueOnce([]);
            mockFs.existsSync.mockReturnValue(true);
            mockPath.join.mockImplementation((...args) => {
                const filtered = args.filter(arg => arg && arg !== '');
                if (filtered.length === 0)
                    return '';
                if (filtered.length === 1)
                    return filtered[0];
                if (filtered[1] && !filtered[0].startsWith('/')) {
                    return filtered.slice(1).join('/');
                }
                return filtered.join('/');
            });
            mockFs.statSync
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => true })
                .mockReturnValueOnce({ isDirectory: () => true })
                .mockReturnValueOnce({ isDirectory: () => true })
                .mockReturnValueOnce({ isDirectory: () => true });
            const result = await localHandler.listFiles();
            expect(result).toEqual(['CLAUDE.md']);
        });
    });
    describe('getSourceInfo', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReset();
            mockFs.statSync.mockReset();
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });
            await localHandler.initialize(mockSourcePath);
        });
        it('should return source info with initialized path', async () => {
            const result = localHandler.getSourceInfo();
            expect(result).toBe(`Local: ${resolvedPath}`);
        });
        it('should return source info even before initialization', () => {
            const newHandler = new local_handler_1.LocalHandler();
            const result = newHandler.getSourceInfo();
            expect(result).toBe('Local: ');
        });
    });
    describe('error handling', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });
            await localHandler.initialize(mockSourcePath);
        });
        it('should handle fs.readdirSync errors in listFiles', async () => {
            mockFs.readdirSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });
            await expect(localHandler.listFiles()).rejects.toThrow('Permission denied');
        });
        it('should handle fs.statSync errors in listFiles', async () => {
            mockFs.readdirSync.mockReturnValue(['test.md']);
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockImplementation(() => {
                throw new Error('Stat error');
            });
            await expect(localHandler.listFiles()).rejects.toThrow('Stat error');
        });
    });
});
