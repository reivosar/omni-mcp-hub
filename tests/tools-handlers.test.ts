import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ToolHandlers } from "../src/tools/handlers.js";
import { ClaudeConfigManager, ClaudeConfig } from "../src/utils/claude-config.js";
import { FileScanner } from "../src/utils/file-scanner.js";

// Mock FileScanner
vi.mock('../src/utils/file-scanner.js');
vi.mock('../src/config/yaml-config.js');

describe('ToolHandlers', () => {
  let server: Server;
  let claudeConfigManager: ClaudeConfigManager;
  let activeProfiles: Map<string, ClaudeConfig>;
  let toolHandlers: ToolHandlers;

  beforeEach(() => {
    server = new Server({ name: 'test', version: '1.0.0' }, { capabilities: { resources: {}, tools: {} } });
    claudeConfigManager = new ClaudeConfigManager();
    activeProfiles = new Map();
    toolHandlers = new ToolHandlers(server, claudeConfigManager, activeProfiles);
  });

  describe('New Tool Handlers', () => {
    it('should handle list_claude_configs with no loaded profiles', async () => {
      // Mock FileScanner
      const mockFileScanner = vi.mocked((toolHandlers as any).fileScanner);
      mockFileScanner.scanForClaudeFiles = vi.fn().mockResolvedValue([]);
      
      const result = await (toolHandlers as any).handleListClaudeConfigs({});
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('CLAUDE.md configs');
    });

    it('should handle list_claude_configs with loaded profiles', async () => {
      // Mock FileScanner
      const mockFileScanner = vi.mocked((toolHandlers as any).fileScanner);
      mockFileScanner.scanForClaudeFiles = vi.fn().mockResolvedValue([]);
      
      // Add test profiles
      activeProfiles.set('test1', { title: 'Test 1', description: 'Test profile 1' } as ClaudeConfig);
      activeProfiles.set('test2', { title: 'Test 2', description: 'Test profile 2' } as ClaudeConfig);

      const result = await (toolHandlers as any).handleListClaudeConfigs({});
      
      expect(result.content[0].text).toContain('CLAUDE.md configs');
      expect(result.content[0].text).toContain('test1');
      expect(result.content[0].text).toContain('test2');
    });

    it('should handle list_claude_configs successfully', async () => {
      // Mock FileScanner
      const mockFileScanner = vi.mocked((toolHandlers as any).fileScanner);
      mockFileScanner.scanForClaudeFiles = vi.fn().mockResolvedValue([
        { path: '/test/file1.md', isClaudeConfig: true, matchedPattern: 'CLAUDE.md' },
        { path: '/test/file2.md', isClaudeConfig: true, matchedPattern: '*-behavior.md' }
      ]);

      const result = await (toolHandlers as any).handleListClaudeConfigs({});
      
      expect(result.content[0].text).toContain('CLAUDE.md configs');
      expect(result.content[0].text).toContain('/test/file1.md');
      expect(result.content[0].text).toContain('/test/file2.md');
    });

    it('should handle list_claude_configs and filter out loaded files', async () => {
      // Add loaded profile with file path
      const loadedConfig = { title: 'Test', _filePath: '/test/file1.md' } as ClaudeConfig & { _filePath: string };
      activeProfiles.set('loaded', loadedConfig);

      // Mock FileScanner
      const mockFileScanner = vi.mocked((toolHandlers as any).fileScanner);
      mockFileScanner.scanForClaudeFiles = vi.fn().mockResolvedValue([
        { path: '/test/file1.md', isClaudeConfig: true, matchedPattern: 'CLAUDE.md' },
        { path: '/test/file2.md', isClaudeConfig: true, matchedPattern: '*-behavior.md' }
      ]);

      const result = await (toolHandlers as any).handleListClaudeConfigs({});
      
      expect(result.content[0].text).toContain('CLAUDE.md configs');
      expect(result.content[0].text).toContain('/test/file2.md');
    });

    it('should handle list_claude_configs scan errors', async () => {
      // Mock FileScanner to throw error
      const mockFileScanner = vi.mocked((toolHandlers as any).fileScanner);
      mockFileScanner.scanForClaudeFiles = vi.fn().mockRejectedValue(new Error('Scan failed'));

      const result = await (toolHandlers as any).handleListClaudeConfigs({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to list configs');
    });

    it('should handle get_applied_config with no active profile', async () => {
      const result = await (toolHandlers as any).handleGetAppliedConfig({});
      
      expect(result.content[0].text).toContain('No configuration is currently applied.');
    });

    it('should handle get_applied_config with active profile', async () => {
      // Mock loadClaudeConfig
      const mockConfig = { title: 'Test Config', description: 'Test Desc' };
      claudeConfigManager.loadClaudeConfig = vi.fn().mockResolvedValue(mockConfig);
      
      // Apply a profile first
      await (toolHandlers as any).handleApplyClaudeConfig({ filePath: './test.md', autoApply: false });
      
      const result = await (toolHandlers as any).handleGetAppliedConfig({});
      
      expect(result.content[0].text).toContain('Applied configuration');
      expect(result.content[0].text).toContain('test');
    });

    it('should handle apply_claude_config with profileName only (existing profile)', async () => {
      // Mock existing profile in activeProfiles
      const mockConfig = { title: 'Zoro Config', _filePath: './examples/zoro-behavior.md' };
      activeProfiles.set('zoro', mockConfig as any);
      
      // Mock loadClaudeConfig
      claudeConfigManager.loadClaudeConfig = vi.fn().mockResolvedValue(mockConfig);
      
      const result = await (toolHandlers as any).handleApplyClaudeConfig({ profileName: 'zoro' });
      
      expect(result.content[0].text).toContain('Successfully loaded CLAUDE.md configuration');
      expect(result.content[0].text).toContain('./examples/zoro-behavior.md');
      expect(claudeConfigManager.loadClaudeConfig).toHaveBeenCalledWith('./examples/zoro-behavior.md');
    });

    it('should handle apply_claude_config with profileName only (path discovery)', async () => {
      // Mock loadClaudeConfig - fail for most paths, succeed for one
      const mockConfig = { 
        title: 'Test Config', 
        instructions: 'Test instructions',
        customInstructions: [],
        rules: [],
        knowledge: [],
        context: [],
        tools: [],
        memory: ''
      };
      
      claudeConfigManager.loadClaudeConfig = vi.fn()
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(mockConfig)
        .mockResolvedValueOnce(mockConfig);
      
      const result = await (toolHandlers as any).handleApplyClaudeConfig({ profileName: 'test' });
      
      expect(result.content[0].text).toContain('Successfully loaded CLAUDE.md configuration');
      expect(claudeConfigManager.loadClaudeConfig).toHaveBeenCalledWith('test.md');
      expect(claudeConfigManager.loadClaudeConfig).toHaveBeenCalledWith('./test.md');
    });

    it('should handle apply_claude_config with profileName only (not found)', async () => {
      // Mock loadClaudeConfig to always fail
      claudeConfigManager.loadClaudeConfig = vi.fn().mockRejectedValue(new Error('Not found'));
      
      const result = await (toolHandlers as any).handleApplyClaudeConfig({ profileName: 'nonexistent' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('File path is required');
    });
  });

  describe('Handler Direct Calls', () => {
    it('should call apply_claude_config handler directly', async () => {
      // Mock ClaudeConfigManager
      claudeConfigManager.loadClaudeConfig = vi.fn().mockResolvedValue({
        title: 'Test Config'
      });
      
      const result = await (toolHandlers as any).handleApplyClaudeConfig({
        filePath: '/test/config.md',
        profileName: 'test'
      });
      
      expect(result.content[0].text).toContain('Successfully loaded');
    });

    it('should call apply_claude_config handler with error', async () => {
      // Mock ClaudeConfigManager to throw error
      claudeConfigManager.loadClaudeConfig = vi.fn().mockRejectedValue(new Error('Load failed'));
      
      const result = await (toolHandlers as any).handleApplyClaudeConfig({
        filePath: '/invalid/config.md'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to load CLAUDE.md');
    });

    it('should call apply_claude_config handler with string argument', async () => {
      // Mock ClaudeConfigManager
      claudeConfigManager.loadClaudeConfig = vi.fn().mockResolvedValue({
        title: 'Test Config'
      });
      
      const result = await (toolHandlers as any).handleApplyClaudeConfig('/test/config.md');
      
      expect(result.content[0].text).toContain('Successfully loaded');
    });


    it('should setup handlers without error', () => {
      const setupSpy = vi.spyOn(server, 'setRequestHandler');
      expect(() => toolHandlers.setupHandlers()).not.toThrow();
      expect(setupSpy).toHaveBeenCalledTimes(2);
    });

    it('should test setupCallToolHandler routing', async () => {
      let callToolHandler: any = null;
      const setRequestHandlerSpy = vi.spyOn(server, 'setRequestHandler').mockImplementation((schema, handler) => {
        // Check if this is the call tool schema
        if (schema === CallToolRequestSchema) {
          callToolHandler = handler;
        }
        return undefined;
      });
      
      toolHandlers.setupHandlers();
      expect(callToolHandler).not.toBeNull();
      
      // Test all tool routing
      const mockFileScanner = vi.mocked((toolHandlers as any).fileScanner);
      mockFileScanner.scanForClaudeFiles = vi.fn().mockResolvedValue([]);
      claudeConfigManager.loadClaudeConfig = vi.fn().mockResolvedValue({ title: 'Test' });
      
      // Test each tool route
      await callToolHandler({ params: { name: 'list_claude_configs', arguments: {} } });
      await callToolHandler({ params: { name: 'list_claude_configs', arguments: {} } });
      await callToolHandler({ params: { name: 'get_applied_config', arguments: {} } });
      await callToolHandler({ params: { name: 'apply_claude_config', arguments: { filePath: '/test.md' } } });
      
      // Test unknown tool
      await expect(callToolHandler({ 
        params: { name: 'unknown_tool', arguments: {} }
      })).rejects.toThrow('Unknown tool: unknown_tool');
      
      setRequestHandlerSpy.mockRestore();
    });

    it('should test setupListToolsHandler', async () => {
      let listToolsHandler: any = null;
      const setRequestHandlerSpy = vi.spyOn(server, 'setRequestHandler').mockImplementation((schema, handler) => {
        // Check if this is the list tools schema
        if (schema === ListToolsRequestSchema) {
          listToolsHandler = handler;
        }
        return undefined;
      });
      
      toolHandlers.setupHandlers();
      expect(listToolsHandler).not.toBeNull();
      
      const result = await listToolsHandler();
      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBe(3);
      
      // Verify all tools are registered
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('apply_claude_config');
      expect(toolNames).toContain('list_claude_configs');
      expect(toolNames).toContain('get_applied_config');
      
      setRequestHandlerSpy.mockRestore();
    });

    it('should test apply_claude_config profile name generation', async () => {
      claudeConfigManager.loadClaudeConfig = vi.fn().mockResolvedValue({ title: 'Test' });
      
      const result = await (toolHandlers as any).handleApplyClaudeConfig({
        filePath: '/path/to/my-config.md'
        // No profileName provided - should auto-generate
      });
      
      expect(result.content[0].text).toContain('my-config');
      expect(activeProfiles.has('my-config')).toBe(true);
    });

    it('should test apply_claude_config autoApply false', async () => {
      claudeConfigManager.loadClaudeConfig = vi.fn().mockResolvedValue({ title: 'Test' });
      
      const result = await (toolHandlers as any).handleApplyClaudeConfig({
        filePath: '/test/config.md',
        profileName: 'testProfile',
        autoApply: false
      });
      
      expect(result.content[0].text).toContain('Successfully loaded CLAUDE.md configuration');
      expect(result.content[1].text).toContain('Configuration includes:');
    });

    it('should test apply_claude_config with existing profile name', async () => {
      claudeConfigManager.loadClaudeConfig = vi.fn().mockResolvedValue({ title: 'Test' });
      
      // Pre-populate with existing profile
      activeProfiles.set('config', { title: 'Existing' } as any);
      
      const result = await (toolHandlers as any).handleApplyClaudeConfig({
        filePath: '/test/config.md'
        // Will generate 'config' which already exists - should overwrite
      });
      
      // Should overwrite the existing profile
      expect(activeProfiles.has('config')).toBe(true);
      expect(result.content[0].text).toContain('config');
    });
  });
});