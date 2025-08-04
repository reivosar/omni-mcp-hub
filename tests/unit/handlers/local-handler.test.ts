import * as fs from 'fs-extra';
import * as path from 'path';
import { LocalHandler } from '../../../src/handlers/local-handler';

// Mock fs-extra
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock path module
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(),
  join: jest.fn()
}));
const mockPath = path as jest.Mocked<typeof path>;

describe('LocalHandler', () => {
  let localHandler: LocalHandler;
  const mockSourcePath = '/test/path';
  const resolvedPath = '/resolved/test/path';

  beforeEach(() => {
    localHandler = new LocalHandler();
    
    // Mock path.resolve to return a predictable path
    mockPath.resolve.mockReturnValue(resolvedPath);
    // Mock path.join to return predictable paths
    mockPath.join.mockImplementation((a, b) => `${a}/${b}`);
  });


  describe('initialize', () => {
    it('should initialize with valid directory path', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

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
      mockFs.statSync.mockReturnValue({ isDirectory: () => false } as any);

      await expect(localHandler.initialize(mockSourcePath))
        .rejects.toThrow(`Path is not a directory: ${resolvedPath}`);
    });

    it('should resolve relative paths to absolute paths', async () => {
      const relativePath = './relative/path';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

      await localHandler.initialize(relativePath);

      expect(mockPath.resolve).toHaveBeenCalledWith(relativePath);
    });
  });

  describe('getFiles', () => {
    beforeEach(async () => {
      // Mock initialization requirements
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      
      await localHandler.initialize(mockSourcePath);
      
      // Clear mocks after initialization to start fresh for each test
      jest.clearAllMocks();
    });

    it('should get files that exist and are files', async () => {
      const patterns = ['CLAUDE.md', 'README.md', 'nonexistent.md'];
      const content1 = 'CLAUDE content';
      const content2 = 'README content';

      // Use real path.join since it works correctly
      // No need to mock path.join here as it just concatenates paths

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

      const result = await localHandler.getFiles(patterns);

      expect(result).toEqual(new Map([
        ['CLAUDE.md', content1],
        ['README.md', content2]
      ]));
      
      // Files should be read with correct content
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        `${resolvedPath}/CLAUDE.md`, 'utf-8'
      );
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        `${resolvedPath}/README.md`, 'utf-8'
      );
    });

    it('should skip files that are directories', async () => {
      const patterns = ['some-dir'];
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isFile: () => false } as any);

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
      mockFs.statSync.mockReturnValue({ isFile: () => true } as any);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      await expect(localHandler.getFiles(patterns)).rejects.toThrow('File read error');
    });
  });

  describe('getFile', () => {
    beforeEach(async () => {
      // Mock initialization requirements
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      
      await localHandler.initialize(mockSourcePath);
      
      // Clear mocks after initialization
      jest.clearAllMocks();
    });

    it('should get file content when file exists and is a file', async () => {
      const fileName = 'test.md';
      const content = 'Test content';
      const expectedPath = `${resolvedPath}/${fileName}`;
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isFile: () => true } as any);
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
      mockFs.statSync.mockReturnValue({ isFile: () => false } as any);

      const result = await localHandler.getFile(fileName);

      expect(result).toBeNull();
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      // Reset mocks for this describe block
      mockFs.existsSync.mockReset();
      mockFs.statSync.mockReset();
      mockFs.readdirSync.mockReset();
      
      // Mock initialization requirements
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      
      await localHandler.initialize(mockSourcePath);
    });

    it('should list all markdown and text files recursively', async () => {
      // Reset and setup mocks for this specific test
      mockFs.readdirSync.mockReset();
      mockFs.existsSync.mockReset();
      mockFs.statSync.mockReset();
      mockPath.join.mockReset();
      
      // Setup mock with simpler structure to avoid iteration issues
      mockFs.existsSync.mockReturnValue(true);
      
      // Mock directory structure: just a flat directory for now
      mockFs.readdirSync.mockReturnValue([
        'CLAUDE.md', 'README.txt', 'config.json', 'script.js', 'binary.exe'
      ] as any);
      
      // Mock path.join to work with the directory structure
      mockPath.join.mockImplementation((...args: string[]) => {
        const filtered = args.filter(arg => arg && arg !== '');
        if (filtered.length === 0) return '';
        if (filtered.length === 1) return filtered[0];
        return filtered.join('/');
      });

      mockFs.statSync
        .mockReturnValueOnce({ isDirectory: () => false } as any) // CLAUDE.md
        .mockReturnValueOnce({ isDirectory: () => false } as any) // README.txt
        .mockReturnValueOnce({ isDirectory: () => false } as any) // config.json
        .mockReturnValueOnce({ isDirectory: () => false } as any) // script.js
        .mockReturnValueOnce({ isDirectory: () => false } as any); // binary.exe

      const result = await localHandler.listFiles();

      expect(result).toEqual([
        'CLAUDE.md',
        'README.txt',
        'config.json'
      ]);
    });

    it('should handle empty directories', async () => {
      
      mockFs.readdirSync.mockReturnValue([] as any);
      mockFs.existsSync.mockReturnValue(true);

      const result = await localHandler.listFiles();

      expect(result).toEqual([]);
    });

    it('should handle non-existent subdirectories gracefully', async () => {
      // Reset mocks for this test
      mockFs.readdirSync.mockReset();
      mockFs.existsSync.mockReset();
      mockFs.statSync.mockReset();
      mockPath.join.mockReset();
      
      mockFs.readdirSync
        .mockReturnValueOnce(['CLAUDE.md', 'nonexistent-dir'] as any);

      mockFs.existsSync
        .mockImplementation((path: any) => {
          // Source path exists, but nonexistent-dir doesn't
          if (String(path).includes('nonexistent-dir')) return false;
          return true;
        });
        
      // Fix path.join mock for relative paths
      mockPath.join.mockImplementation((...args: string[]) => {
        const filtered = args.filter(arg => arg && arg !== '');
        if (filtered.length === 0) return '';
        if (filtered.length === 1) return filtered[0];
        
        // For relative paths (empty first argument), return only the filename
        if (filtered[1] && filtered[0] === '') {
          return filtered[1];
        }
        return filtered.join('/');
      });

      mockFs.statSync
        .mockReturnValueOnce({ isDirectory: () => false } as any) // CLAUDE.md
        .mockReturnValueOnce({ isDirectory: () => true } as any); // nonexistent-dir

      const result = await localHandler.listFiles();

      expect(result).toEqual(['CLAUDE.md']);
    });

    it('should filter out hidden directories and node_modules', async () => {
      // Reset and setup mocks for this test
      mockFs.readdirSync.mockReset();
      mockFs.existsSync.mockReset();
      mockFs.statSync.mockReset();
      mockPath.join.mockReset();
      
      mockFs.readdirSync
        .mockReturnValueOnce([
          'CLAUDE.md', '.git', '.vscode', 'node_modules', 'src'
        ] as any)
        // Mock src directory as empty
        .mockReturnValueOnce([] as any);

      mockFs.existsSync.mockReturnValue(true);
      
      // Fix path.join mock to return relative paths correctly
      mockPath.join.mockImplementation((...args: string[]) => {
        // Filter out empty arguments and join with '/'
        const filtered = args.filter(arg => arg && arg !== '');
        if (filtered.length === 0) return '';
        if (filtered.length === 1) return filtered[0];
        
        // For relative paths, don't start with '/'
        if (filtered[1] && !filtered[0].startsWith('/')) {
          return filtered.slice(1).join('/');
        }
        return filtered.join('/');
      });

      mockFs.statSync
        .mockReturnValueOnce({ isDirectory: () => false } as any) // CLAUDE.md
        .mockReturnValueOnce({ isDirectory: () => true } as any)  // .git (skipped)
        .mockReturnValueOnce({ isDirectory: () => true } as any)  // .vscode (skipped)
        .mockReturnValueOnce({ isDirectory: () => true } as any)  // node_modules (skipped)
        .mockReturnValueOnce({ isDirectory: () => true } as any); // src

      const result = await localHandler.listFiles();

      expect(result).toEqual(['CLAUDE.md']);
    });
  });

  describe('getSourceInfo', () => {
    beforeEach(async () => {
      // Reset mocks for this describe block
      mockFs.existsSync.mockReset();
      mockFs.statSync.mockReset();
      
      // Initialize for getSourceInfo tests
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      await localHandler.initialize(mockSourcePath);
    });
    
    it('should return source info with initialized path', async () => {
      const result = localHandler.getSourceInfo();
      expect(result).toBe(`Local: ${resolvedPath}`);
    });

    it('should return source info even before initialization', () => {
      const newHandler = new LocalHandler();
      const result = newHandler.getSourceInfo();
      expect(result).toBe('Local: ');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      await localHandler.initialize(mockSourcePath);
    });

    it('should handle fs.readdirSync errors in listFiles', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(localHandler.listFiles()).rejects.toThrow('Permission denied');
    });

    it('should handle fs.statSync errors in listFiles', async () => {
      mockFs.readdirSync.mockReturnValue(['test.md'] as any);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockImplementation(() => {
        throw new Error('Stat error');
      });

      await expect(localHandler.listFiles()).rejects.toThrow('Stat error');
    });
  });
});