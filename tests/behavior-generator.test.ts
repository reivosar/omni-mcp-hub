import { describe, it, expect } from 'vitest';
import { BehaviorGenerator } from '../src/utils/behavior-generator.js';

describe('BehaviorGenerator', () => {
  describe('generateInstructions', () => {
    it('should generate complete behavior instructions', () => {
      const config = {
        instructions: ['Main system instructions'],
        customInstructions: ['Custom instruction 1', 'Custom instruction 2'],
        rules: ['Rule 1', 'Rule 2'],
        context: ['Context info 1', 'Context info 2'],
        knowledge: ['Knowledge item 1'],
        tools: ['Tool 1', 'Tool 2'],
        memory: 'Memory context information'
      };

      const result = BehaviorGenerator.generateInstructions(config);

      expect(result).toContain('# System Instructions');
      expect(result).toContain('Main system instructions');
      expect(result).toContain('# Custom Instructions');
      expect(result).toContain('- Custom instruction 1');
      expect(result).toContain('# Rules to Follow');
      expect(result).toContain('- Rule 1');
      expect(result).toContain('# Context Information');
      expect(result).toContain('- Context info 1');
      expect(result).toContain('# Knowledge Base');
      expect(result).toContain('- Knowledge item 1');
      expect(result).toContain('# Memory Context');
      expect(result).toContain('Memory context information');
      expect(result).toContain('# Available Tools');
      expect(result).toContain('- Tool 1');
    });

    it('should handle empty config sections gracefully', () => {
      const config = {
        instructions: ['Only instructions'],
        customInstructions: [],
        rules: undefined,
        context: undefined,
        knowledge: [],
        tools: null,
        memory: ''
      };

      const result = BehaviorGenerator.generateInstructions(config);

      expect(result).toContain('# System Instructions');
      expect(result).toContain('Only instructions');
      expect(result).not.toContain('# Custom Instructions');
      expect(result).not.toContain('# Rules to Follow');
      expect(result).not.toContain('# Memory Context');
    });

    it('should handle completely empty config', () => {
      const config = {};

      const result = BehaviorGenerator.generateInstructions(config);

      expect(result).toContain('# MCP PROFILE PRIORITY OVERRIDE');
      expect(result).toContain('MANDATORY PRIORITY CONTROL');
    });

    it('should handle only instructions', () => {
      const config = {
        instructions: ['Just instructions']
      };

      const result = BehaviorGenerator.generateInstructions(config);

      expect(result).toContain('# MCP PROFILE PRIORITY OVERRIDE');
      expect(result).toContain('# System Instructions\nJust instructions');
    });

    it('should handle only custom instructions', () => {
      const config = {
        customInstructions: ['Custom 1', 'Custom 2']
      };

      const result = BehaviorGenerator.generateInstructions(config);

      expect(result).toContain('# MCP PROFILE PRIORITY OVERRIDE');
      expect(result).toContain('# Custom Instructions\n- Custom 1\n- Custom 2');
    });

    it('should handle only memory', () => {
      const config = {
        memory: 'Memory content only'
      };

      const result = BehaviorGenerator.generateInstructions(config);

      expect(result).toContain('# MCP PROFILE PRIORITY OVERRIDE');
      expect(result).toContain('# Memory Context\nMemory content only');
    });

    it('should preserve order of sections', () => {
      const config = {
        memory: 'Memory',
        instructions: ['Instructions'],
        tools: ['Tool'],
        customInstructions: ['Custom']
      };

      const result = BehaviorGenerator.generateInstructions(config);
      const lines = result.split('\n');

      // Verify order: instructions -> customInstructions -> ... -> memory -> tools
      const instructionsIndex = lines.findIndex(line => line === '# System Instructions');
      const customIndex = lines.findIndex(line => line === '# Custom Instructions');
      const memoryIndex = lines.findIndex(line => line === '# Memory Context');
      const toolsIndex = lines.findIndex(line => line === '# Available Tools');

      expect(instructionsIndex).toBeLessThan(customIndex);
      expect(customIndex).toBeLessThan(memoryIndex);
      expect(memoryIndex).toBeLessThan(toolsIndex);
    });

    it('should handle arrays with empty strings', () => {
      const config = {
        customInstructions: ['Valid instruction', '', 'Another valid'],
        rules: ['', 'Valid rule', '']
      };

      const result = BehaviorGenerator.generateInstructions(config);

      expect(result).toContain('- Valid instruction');
      expect(result).toContain('- Another valid');
      expect(result).toContain('- Valid rule');
      expect(result).toContain('- '); // Empty strings are also included
    });
  });
});