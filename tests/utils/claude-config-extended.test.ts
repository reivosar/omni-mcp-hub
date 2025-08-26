import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeConfigManager, ClaudeConfig } from '../../src/utils/claude-config.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('ClaudeConfigManager Extended Tests', () => {
  let manager: ClaudeConfigManager;

  beforeEach(() => {
    manager = new ClaudeConfigManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseClaude', () => {
    it('should parse basic CLAUDE.md content with instructions', () => {
      const content = `# System Instructions
You are a helpful AI assistant.

# Custom Instructions
- Be concise
- Use examples
- Stay focused

# Knowledge Base
- Technical documentation
- Best practices
- Common patterns`;

      const config = manager.parseClaude(content);
      
      expect(config.instructions).toEqual(['You are a helpful AI assistant.']);
      expect(config.customInstructions).toEqual(['- Be concise', '- Use examples', '- Stay focused']);
      expect(config.knowledge).toEqual(['- Technical documentation', '- Best practices', '- Common patterns']);
    });

    it('should parse key-value pairs', () => {
      const content = `Project Name: Test Project
Description: A test project for validation
Version: 1.0.0

# Instructions
Basic instructions here.`;

      const config = manager.parseClaude(content);
      
      expect(config.project_name).toBe('Test Project');
      expect(config.description).toBe('A test project for validation');
      expect(config.version).toBe('1.0.0');
      expect(config.instructions).toEqual(['Basic instructions here.']);
    });

    it('should handle rules and guidelines sections', () => {
      const content = `# Rules
- Always be polite
- Provide accurate information

# Guidelines
- Use clear language
- Give examples when helpful`;

      const config = manager.parseClaude(content);
      
      // Guidelines overwrites rules (last section wins)
      expect(config.rules).toEqual(['- Use clear language', '- Give examples when helpful']);
    });

    it('should handle context and background sections', () => {
      const content = `# Context
- User is a developer
- Working on Node.js project

# Background
- Previous conversation about testing
- Focus on code quality`;

      const config = manager.parseClaude(content);
      
      // Background overwrites context (last section wins)
      expect(config.context).toEqual(['- Previous conversation about testing', '- Focus on code quality']);
    });

    it('should handle tools and available_tools sections', () => {
      const content = `# Tools
- File operations
- Code analysis

# Available Tools
- Git commands
- Database queries`;

      const config = manager.parseClaude(content);
      
      // Available Tools overwrites tools (last section wins)
      expect(config.tools).toEqual(['- Git commands', '- Database queries']);
    });

    it('should handle memory sections', () => {
      const content = `# Memory
Previous conversation about testing frameworks and best practices.

# Memory Context
Additional context about the user's preferences.`;

      const config = manager.parseClaude(content);
      
      // Memory Context overwrites memory (last section wins)
      expect(config.memory).toBe('Additional context about the user\'s preferences.');
    });

    it('should skip empty lines and comments', () => {
      const content = `<!-- This is a comment -->

# Instructions

You are helpful.

<!-- Another comment -->

# Rules
- Be nice`;

      const config = manager.parseClaude(content);
      
      expect(config.instructions).toEqual(['You are helpful.']);
      expect(config.rules).toEqual(['- Be nice']);
    });

    it('should handle custom sections', () => {
      const content = `# Custom Section
This is custom content that doesn't match standard sections.

# Another Custom
More custom content.`;

      const config = manager.parseClaude(content);
      
      expect(config.custom_section).toBe('This is custom content that doesn\'t match standard sections.');
      expect(config.another_custom).toBe('More custom content.');
    });

    it('should handle empty content', () => {
      const config = manager.parseClaude('');
      expect(config).toEqual({});
    });

    it('should handle content with only comments', () => {
      const content = `<!-- Comment 1 -->
<!-- Comment 2 -->
<!-- Comment 3 -->`;

      const config = manager.parseClaude(content);
      expect(config).toEqual({});
    });

    it('should handle mixed case section headers', () => {
      const content = `# INSTRUCTIONS
Upper case instructions.

# Custom Instructions
Mixed case instructions.

# system_instructions
Snake case instructions.`;

      const config = manager.parseClaude(content);
      
      // system_instructions overwrites instructions (last section wins)
      expect(config.instructions).toEqual(['Snake case instructions.']);
      expect(config.customInstructions).toEqual(['Mixed case instructions.']);
    });
  });

  describe('loadClaudeConfig', () => {
    it('should load and parse CLAUDE.md file successfully', async () => {
      const filePath = '/test/path/CLAUDE.md';
      const content = `# Instructions
You are a helpful assistant.

Project Name: Test Project`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const config = await manager.loadClaudeConfig(filePath);
      
      expect(config.instructions).toEqual(['You are a helpful assistant.']);
      expect(config.project_name).toBe('Test Project');
      expect(config._filePath).toBe(path.resolve(filePath));
      expect(config._lastModified).toBeDefined();
      
      expect(fs.readFile).toHaveBeenCalledWith(path.resolve(filePath), 'utf-8');
    });

    it('should use cache for subsequent requests', async () => {
      const filePath = '/test/path/CLAUDE.md';
      const content = `# Instructions\nCached content.`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      // First call
      const config1 = await manager.loadClaudeConfig(filePath);
      // Second call
      const config2 = await manager.loadClaudeConfig(filePath);
      
      expect(config1).toBe(config2); // Same object reference due to caching
      expect(fs.readFile).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should handle file not found errors', async () => {
      const filePath = '/nonexistent/CLAUDE.md';
      const error = new Error('File not found');
      error.code = 'ENOENT';

      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(manager.loadClaudeConfig(filePath))
        .rejects.toThrow(`Failed to load CLAUDE.md from ${filePath}`);
    });

    it('should handle permission errors', async () => {
      const filePath = '/restricted/CLAUDE.md';
      const error = new Error('Permission denied');
      error.code = 'EACCES';

      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(manager.loadClaudeConfig(filePath))
        .rejects.toThrow(`Failed to load CLAUDE.md from ${filePath}`);
    });

    it('should handle corrupted file content', async () => {
      const filePath = '/test/corrupted/CLAUDE.md';
      // Return content that could potentially cause parsing issues
      const content = null as any;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      await expect(manager.loadClaudeConfig(filePath))
        .rejects.toThrow();
    });
  });

  describe('saveClaude', () => {
    it('should save config to file successfully', async () => {
      const filePath = '/test/output/CLAUDE.md';
      const config: ClaudeConfig = {
        instructions: ['You are helpful.'],
        customInstructions: ['Be concise', 'Use examples'],
        projectName: 'Test Project'
      };

      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.saveClaude(filePath, config);

      expect(fs.writeFile).toHaveBeenCalledWith(
        filePath, 
        expect.stringContaining('# Instructions'), 
        'utf-8'
      );
    });

    it('should update cache after saving', async () => {
      const filePath = '/test/output/CLAUDE.md';
      const config: ClaudeConfig = {
        instructions: ['Cached after save.']
      };

      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('# Instructions\nCached after save.');

      await manager.saveClaude(filePath, config);
      
      // Load from cache (should not call readFile again)
      vi.clearAllMocks();
      const loadedConfig = await manager.loadClaudeConfig(filePath);
      
      expect(loadedConfig.instructions).toEqual(['Cached after save.']);
      expect(fs.readFile).not.toHaveBeenCalled(); // Loaded from cache
    });

    it('should handle write errors', async () => {
      const filePath = '/readonly/CLAUDE.md';
      const config: ClaudeConfig = { instructions: ['Test'] };
      const error = new Error('Permission denied');

      vi.mocked(fs.writeFile).mockRejectedValue(error);

      await expect(manager.saveClaude(filePath, config))
        .rejects.toThrow('Permission denied');
    });
  });

  describe('configToClaudeFormat', () => {
    it('should convert config with project name', () => {
      const config: ClaudeConfig = {
        projectName: 'My Project',
        instructions: ['You are helpful.']
      };

      // Access private method for testing
      const result = (manager as any).configToClaudeFormat(config);
      
      expect(result).toContain('# My Project');
      expect(result).toContain('# Instructions');
      expect(result).toContain('You are helpful.');
    });

    it('should convert config with custom instructions', () => {
      const config: ClaudeConfig = {
        customInstructions: ['Be concise', 'Use examples', 'Stay focused']
      };

      const result = (manager as any).configToClaudeFormat(config);
      
      expect(result).toContain('# Custom Instructions');
      expect(result).toContain('Be concise');
      expect(result).toContain('Use examples');
      expect(result).toContain('Stay focused');
    });

    it('should convert config with rules', () => {
      const config: ClaudeConfig = {
        rules: ['Always be polite', 'Provide accurate information']
      };

      const result = (manager as any).configToClaudeFormat(config);
      
      expect(result).toContain('# Rules');
      expect(result).toContain('Always be polite');
      expect(result).toContain('Provide accurate information');
    });

    it('should convert config with knowledge base', () => {
      const config: ClaudeConfig = {
        knowledge: ['Technical docs', 'Best practices']
      };

      const result = (manager as any).configToClaudeFormat(config);
      
      expect(result).toContain('# Knowledge');
      expect(result).toContain('Technical docs');
      expect(result).toContain('Best practices');
    });

    it('should handle empty config', () => {
      const config: ClaudeConfig = {};

      const result = (manager as any).configToClaudeFormat(config);
      
      expect(result).toBe('\n'); // Empty config returns single newline
    });

    it('should handle config with key-value pairs', () => {
      const config: ClaudeConfig = {
        project_name: 'Test Project',
        description: 'A test project',
        version: '1.0.0'
      };

      const result = (manager as any).configToClaudeFormat(config);
      
      expect(result).toContain('Project Name: Test Project');
      expect(result).toContain('Description: A test project');
      expect(result).toContain('Version: 1.0.0');
    });

    it('should convert config with memory context', () => {
      const config: ClaudeConfig = {
        memory: 'Previous conversation about testing frameworks.'
      };

      const result = (manager as any).configToClaudeFormat(config);
      
      expect(result).toContain('# Memory');
      expect(result).toContain('Previous conversation about testing frameworks.');
    });

    it('should convert config with tools', () => {
      const config: ClaudeConfig = {
        tools: ['File operations', 'Code analysis', 'Git commands']
      };

      const result = (manager as any).configToClaudeFormat(config);
      
      expect(result).toContain('# Tools');
      expect(result).toContain('File operations');
      expect(result).toContain('Code analysis');
      expect(result).toContain('Git commands');
    });

    it('should convert config with context', () => {
      const config: ClaudeConfig = {
        context: ['User is a developer', 'Working on Node.js project']
      };

      const result = (manager as any).configToClaudeFormat(config);
      
      expect(result).toContain('# Context');
      expect(result).toContain('User is a developer');
      expect(result).toContain('Working on Node.js project');
    });
  });

  describe('Integration Tests', () => {
    it('should roundtrip: parse -> save -> load', async () => {
      const originalContent = `# Instructions
You are a helpful AI assistant.

# Custom Instructions
- Be concise
- Use examples

# Knowledge Base
- Technical documentation
- Best practices

Project Name: Roundtrip Test`;

      const filePath = '/test/roundtrip/CLAUDE.md';

      // Mock file operations
      vi.mocked(fs.readFile).mockResolvedValue(originalContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Load original
      const config1 = await manager.loadClaudeConfig(filePath);
      
      // Save to new location
      const newPath = '/test/roundtrip/NEW_CLAUDE.md';
      await manager.saveClaude(newPath, config1);
      
      // Verify the saved content structure
      const savedContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(savedContent).toContain('# Instructions');
      expect(savedContent).toContain('You are a helpful AI assistant.');
      expect(savedContent).toContain('# Custom Instructions');
      expect(savedContent).toContain('- Be concise');
    });

    it('should handle complex nested content', () => {
      const content = `# Instructions
You are an advanced AI assistant with the following capabilities:
- Code analysis and generation
- Technical documentation
- Problem solving

# Rules
- Always validate user input
- Provide secure code examples
- Include error handling
- Consider performance implications`;

      const config = manager.parseClaude(content);
      
      expect(config.instructions?.[0]).toContain('You are an advanced AI assistant');
      expect(config.instructions?.join('\n')).toContain('- Code analysis and generation');
      expect(config.rules).toBeDefined();
      expect(Array.isArray(config.rules)).toBe(true);
      expect(config.rules!.length).toBeGreaterThan(0);
    });
  });
});