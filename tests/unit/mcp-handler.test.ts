import { MCPHandler } from '../../src/handlers/mcp-handler';
import { OmniSourceManager } from '../../src/sources/source-manager';

// Mock the source manager
jest.mock('../../src/sources/source-manager');

const MockSourceManager = OmniSourceManager as jest.MockedClass<typeof OmniSourceManager>;

describe('MCPHandler', () => {
  let mcpHandler: MCPHandler;
  let mockSourceManager: jest.Mocked<OmniSourceManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock source manager instance
    mockSourceManager = {
      getSourceNames: jest.fn(),
      listSourceFiles: jest.fn(),
      getSourceFile: jest.fn(),
      getSourceFiles: jest.fn(),
      getBundleMode: jest.fn(),
      getFilePatterns: jest.fn(),
    } as any;

    mcpHandler = new MCPHandler(mockSourceManager);
  });

  describe('handleMessage', () => {
    it('should handle initialize message', async () => {
      const message = {
        jsonrpc: '2.0',
        id: '1',
        method: 'initialize',
        params: {}
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'omni-mcp-hub',
            version: '1.0.0'
          }
        }
      });
    });

    it('should handle tools/list message without bundle mode', async () => {
      mockSourceManager.getBundleMode.mockReturnValue(false);

      const message = {
        jsonrpc: '2.0',
        id: '2',
        method: 'tools/list'
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.result.tools).toHaveLength(4);
      expect(response.result.tools.map((t: any) => t.name)).toEqual([
        'list_sources',
        'list_source_files',
        'get_source_file',
        'get_file_variants'
      ]);
    });

    it('should handle tools/list message with bundle mode enabled', async () => {
      mockSourceManager.getBundleMode.mockReturnValue(true);

      const message = {
        jsonrpc: '2.0',
        id: '2',
        method: 'tools/list'
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.result.tools).toHaveLength(5);
      expect(response.result.tools.map((t: any) => t.name)).toEqual([
        'list_sources',
        'list_source_files',
        'get_source_file',
        'get_file_variants',
        'get_source_bundle'
      ]);
    });

    it('should handle unsupported method', async () => {
      const message = {
        jsonrpc: '2.0',
        id: '3',
        method: 'unsupported_method'
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: '3',
        error: {
          code: -32601,
          message: 'Method not found: unsupported_method'
        }
      });
    });

    it('should handle message without id', async () => {
      const message = {
        jsonrpc: '2.0',
        method: 'initialize'
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.id).toBeUndefined();
    });
  });

  describe('tools/call handling', () => {
    it('should handle list_sources tool call', async () => {
      mockSourceManager.getSourceNames.mockReturnValue(['github:user/repo', 'local:/path']);

      const message = {
        jsonrpc: '2.0',
        id: '4',
        method: 'tools/call',
        params: {
          name: 'list_sources',
          arguments: {}
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Available sources:\n- github:user/repo\n- local:/path'
          }
        ]
      });
    });

    it('should handle list_source_files tool call', async () => {
      mockSourceManager.listSourceFiles.mockResolvedValue(['README.md', 'CLAUDE.md']);

      const message = {
        jsonrpc: '2.0',
        id: '5',
        method: 'tools/call',
        params: {
          name: 'list_source_files',
          arguments: {
            source: 'github:user/repo'
          }
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Files in github:user/repo:\n- README.md\n- CLAUDE.md'
          }
        ]
      });
      expect(mockSourceManager.listSourceFiles).toHaveBeenCalledWith('github:user/repo');
    });

    it('should handle get_source_file tool call successfully', async () => {
      const fileContent = '# Test File\\n\\nThis is test content.';
      mockSourceManager.getSourceFile.mockResolvedValue(fileContent);

      const message = {
        jsonrpc: '2.0',
        id: '6',
        method: 'tools/call',
        params: {
          name: 'get_source_file',
          arguments: {
            source: 'github:user/repo',
            file: 'README.md'
          }
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.result).toEqual({
        content: [
          {
            type: 'text',
            text: 'README.md from github:user/repo:\n\n# Test File\\n\\nThis is test content.'
          }
        ]
      });
      expect(mockSourceManager.getSourceFile).toHaveBeenCalledWith('github:user/repo', 'README.md');
    });

    it('should handle get_source_file tool call when file not found', async () => {
      mockSourceManager.getSourceFile.mockResolvedValue(null);

      const message = {
        jsonrpc: '2.0',
        id: '7',
        method: 'tools/call',
        params: {
          name: 'get_source_file',
          arguments: {
            source: 'github:user/repo',
            file: 'nonexistent.md'
          }
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.error).toEqual({
        code: -32603,
        message: 'File not found: nonexistent.md in github:user/repo'
      });
    });

    it('should handle get_source_bundle tool call successfully', async () => {
      const files = new Map([
        ['README.md', '# README\\n\\nProject description'],
        ['CLAUDE.md', '# CLAUDE\\n\\nAI assistant instructions']
      ]);
      mockSourceManager.getSourceFiles.mockResolvedValue(files);

      const message = {
        jsonrpc: '2.0',
        id: '8',
        method: 'tools/call',
        params: {
          name: 'get_source_bundle',
          arguments: {
            source: 'github:user/repo'
          }
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.result.content[0].text).toContain('Source Bundle: github:user/repo');
      expect(response.result.content[0].text).toContain('README.md:');
      expect(response.result.content[0].text).toContain('CLAUDE.md:');
      expect(response.result.content[0].text).toContain('# README');
      expect(response.result.content[0].text).toContain('# CLAUDE');
      expect(mockSourceManager.getSourceFiles).toHaveBeenCalledWith('github:user/repo');
    });

    it('should handle get_source_bundle tool call when no files found', async () => {
      mockSourceManager.getSourceFiles.mockResolvedValue(new Map());
      mockSourceManager.getFilePatterns.mockReturnValue(['CLAUDE.md', 'README.md']);

      const message = {
        jsonrpc: '2.0',
        id: '9',
        method: 'tools/call',
        params: {
          name: 'get_source_bundle',
          arguments: {
            source: 'github:user/repo'
          }
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.error).toEqual({
        code: -32603,
        message: 'No files found matching patterns: CLAUDE.md, README.md in github:user/repo'
      });
    });

    it('should handle get_file_variants tool call successfully', async () => {
      mockSourceManager.getSourceNames.mockReturnValue(['github:user/repo1', 'github:user/repo2', 'local:/path']);
      mockSourceManager.getSourceFile
        .mockResolvedValueOnce('# CLAUDE from repo1\\n\\nInstructions for repo1')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('# CLAUDE from local\\n\\nLocal instructions');

      const message = {
        jsonrpc: '2.0',
        id: '10',
        method: 'tools/call',
        params: {
          name: 'get_file_variants',
          arguments: {
            fileName: 'CLAUDE.md'
          }
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.result.content[0].text).toContain('File variants for CLAUDE.md:');
      expect(response.result.content[0].text).toContain('## Variant 1: github:user/repo1');
      expect(response.result.content[0].text).toContain('# CLAUDE from repo1');
      expect(response.result.content[0].text).toContain('## Variant 2: local:/path');
      expect(response.result.content[0].text).toContain('# CLAUDE from local');
      expect(response.result.content[0].text).toContain('Found 2 variants from sources: github:user/repo1, local:/path');
    });

    it('should handle get_file_variants tool call when no variants found', async () => {
      mockSourceManager.getSourceNames.mockReturnValue(['github:user/repo1', 'github:user/repo2']);
      mockSourceManager.getSourceFile
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const message = {
        jsonrpc: '2.0',
        id: '11',
        method: 'tools/call',
        params: {
          name: 'get_file_variants',
          arguments: {
            fileName: 'nonexistent.md'
          }
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.error).toEqual({
        code: -32603,
        message: 'File nonexistent.md not found in any source'
      });
    });

    it('should handle get_file_variants tool call with errors from some sources', async () => {
      mockSourceManager.getSourceNames.mockReturnValue(['github:user/repo1', 'github:user/repo2']);
      mockSourceManager.getSourceFile
        .mockResolvedValueOnce('# CLAUDE content')
        .mockRejectedValueOnce(new Error('Access denied'));

      const message = {
        jsonrpc: '2.0',
        id: '12',
        method: 'tools/call',
        params: {
          name: 'get_file_variants',
          arguments: {
            fileName: 'CLAUDE.md'
          }
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.result.content[0].text).toContain('File variants for CLAUDE.md:');
      expect(response.result.content[0].text).toContain('## Variant 1: github:user/repo1');
      expect(response.result.content[0].text).toContain('# CLAUDE content');
      expect(response.result.content[0].text).toContain('Found 1 variants from sources: github:user/repo1');
    });

    it('should handle unknown tool call', async () => {
      const message = {
        jsonrpc: '2.0',
        id: '13',
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.error).toEqual({
        code: -32603,
        message: 'Unknown tool: unknown_tool'
      });
    });

    it('should handle tool call with exception', async () => {
      mockSourceManager.getSourceNames.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const message = {
        jsonrpc: '2.0',
        id: '14',
        method: 'tools/call',
        params: {
          name: 'list_sources',
          arguments: {}
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.error).toEqual({
        code: -32603,
        message: 'Database connection failed'
      });
    });

    it('should handle tool call with non-Error exception', async () => {
      mockSourceManager.getSourceNames.mockImplementation(() => {
        throw 'String error';
      });

      const message = {
        jsonrpc: '2.0',
        id: '15',
        method: 'tools/call',
        params: {
          name: 'list_sources',
          arguments: {}
        }
      };

      const response = await mcpHandler.handleMessage(message);

      expect(response.error).toEqual({
        code: -32603,
        message: 'Unknown error'
      });
    });
  });

  describe('tool schemas', () => {
    it('should return correct tool schemas', async () => {
      mockSourceManager.getBundleMode.mockReturnValue(true);

      const message = {
        jsonrpc: '2.0',
        id: '16',
        method: 'tools/list'
      };

      const response = await mcpHandler.handleMessage(message);
      const tools = response.result.tools;

      // Check list_sources tool
      const listSourcesTool = tools.find((t: any) => t.name === 'list_sources');
      expect(listSourcesTool).toEqual({
        name: 'list_sources',
        description: 'List all configured sources',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      });

      // Check list_source_files tool
      const listSourceFilesTool = tools.find((t: any) => t.name === 'list_source_files');
      expect(listSourceFilesTool).toEqual({
        name: 'list_source_files',
        description: 'List all markdown files in a source',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source name (e.g., github:user/repo, local:/path)'
            }
          },
          required: ['source']
        }
      });

      // Check get_source_file tool
      const getSourceFileTool = tools.find((t: any) => t.name === 'get_source_file');
      expect(getSourceFileTool).toEqual({
        name: 'get_source_file',
        description: 'Get content of a specific file from source',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source name (e.g., github:user/repo, local:/path)'
            },
            file: {
              type: 'string',
              description: 'File path relative to source root'
            }
          },
          required: ['source', 'file']
        }
      });

      // Check get_file_variants tool
      const getFileVariantsTool = tools.find((t: any) => t.name === 'get_file_variants');
      expect(getFileVariantsTool).toEqual({
        name: 'get_file_variants',
        description: 'Get all available versions of a file from all sources',
        inputSchema: {
          type: 'object',
          properties: {
            fileName: {
              type: 'string',
              description: 'File name to search for across all sources (e.g., README.md, CLAUDE.md)'
            }
          },
          required: ['fileName']
        }
      });

      // Check get_source_bundle tool (should be present when bundle mode is enabled)
      const getSourceBundleTool = tools.find((t: any) => t.name === 'get_source_bundle');
      expect(getSourceBundleTool).toEqual({
        name: 'get_source_bundle',
        description: 'Get all configured files from source as a bundle',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source name (e.g., github:user/repo, local:/path)'
            }
          },
          required: ['source']
        }
      });
    });
  });
});