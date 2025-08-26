import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeConfigManager } from '../../src/utils/claude-config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ClaudeConfigManager', () => {
  let manager: ClaudeConfigManager;
  const testDir = path.join(__dirname, 'test-configs');
  const testFile = path.join(testDir, 'test-config.md');

  beforeEach(async () => {
    manager = new ClaudeConfigManager();
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore errors
    }
  });

  describe('loadClaudeConfig', () => {
    it('should load a valid CLAUDE.md file', async () => {
      const content = `# Test Configuration

Project Name: Test Project
Description: A test configuration
Version: 1.0.0

# Instructions

Test instructions here.

# Custom Instructions

- Custom instruction 1
- Custom instruction 2

# Rules

- Rule 1
- Rule 2

# Knowledge

- Knowledge item 1
- Knowledge item 2

# Context

- Context item 1
- Context item 2

# Tools

- Tool 1
- Tool 2

# Memory

Test memory content here.`;

      await fs.writeFile(testFile, content);
      
      const config = await manager.loadClaudeConfig(testFile);
      
      expect(config.project_name).toBe('Test Project');
      expect(config.description).toBe('A test configuration');
      expect(config.version).toBe('1.0.0');
      expect(config.instructions).toEqual(['Test instructions here.']);
      expect(config.customInstructions).toHaveLength(2);
      expect(config.customInstructions?.[0]).toBe('- Custom instruction 1');
      expect(config.rules).toHaveLength(2);
      expect(config.knowledge).toHaveLength(2);
      expect(config.context).toHaveLength(2);
      expect(config.tools).toHaveLength(2);
      expect(config.memory).toBe('Test memory content here.');
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        manager.loadClaudeConfig('/non/existent/file.md')
      ).rejects.toThrow();
    });

    it('should handle empty sections gracefully', async () => {
      const content = `# Test Configuration

Project Name: Minimal Project

# Instructions

Some instructions.`;

      await fs.writeFile(testFile, content);
      
      const config = await manager.loadClaudeConfig(testFile);
      
      expect(config.project_name).toBe('Minimal Project');
      expect(config.instructions).toEqual(['Some instructions.']);
      expect(config.customInstructions || []).toEqual([]);
      expect(config.rules || []).toEqual([]);
      expect(config.knowledge || []).toEqual([]);
      expect(config.context || []).toEqual([]);
      expect(config.tools || []).toEqual([]);
      expect(config.memory || '').toBe('');
    });
  });

  describe('saveClaude', () => {
    it('should save a configuration to file', async () => {
      const config = {
        project_name: 'Saved Project',
        description: 'A saved configuration',
        version: '2.0.0',
        instructions: ['Saved instructions'],
        customInstructions: ['Custom 1', 'Custom 2'],
        rules: ['Rule 1', 'Rule 2'],
        knowledge: ['Knowledge 1'],
        context: ['Context 1'],
        tools: ['Tool 1'],
        memory: 'Saved memory'
      };

      await manager.saveClaude(testFile, config);
      
      const content = await fs.readFile(testFile, 'utf-8');
      
      expect(content).toContain('Project Name: Saved Project');
      expect(content).toContain('Description: A saved configuration');
      expect(content).toContain('Version: 2.0.0');
      expect(content).toContain('# Instructions');
      expect(content).toContain('Saved instructions');
      expect(content).toContain('# Custom Instructions');
      expect(content).toContain('Custom 1');
      expect(content).toContain('Custom 2');
      expect(content).toContain('# Rules');
      expect(content).toContain('Rule 1');
      expect(content).toContain('# Memory');
      expect(content).toContain('Saved memory');
    });
  });

  describe('findClaudeFiles', () => {
    it('should find CLAUDE.md files in directory', async () => {
      // Create test CLAUDE.md file (only filenames containing claude.md)
      await fs.writeFile(path.join(testDir, 'CLAUDE.md'), '# Test');
      await fs.writeFile(path.join(testDir, 'custom-claude.md'), '# Config 1');
      await fs.writeFile(path.join(testDir, 'another-claude.md'), '# Config 2');
      await fs.writeFile(path.join(testDir, 'not-a-config.txt'), 'Text file');
      await fs.writeFile(path.join(testDir, 'config.md'), '# Not a claude file');

      const files = await manager.findClaudeFiles(testDir);
      
      expect(files).toHaveLength(3);
      expect(files).toContain(path.join(testDir, 'CLAUDE.md'));
      expect(files).toContain(path.join(testDir, 'custom-claude.md'));
      expect(files).toContain(path.join(testDir, 'another-claude.md'));
      expect(files).not.toContain(path.join(testDir, 'not-a-config.txt'));
      expect(files).not.toContain(path.join(testDir, 'config.md'));
    });

    it('should return empty array for directory with no .md files', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'Text');
      await fs.writeFile(path.join(testDir, 'file.json'), '{}');

      const files = await manager.findClaudeFiles(testDir);
      
      expect(files).toHaveLength(0);
    });
  });
});