import { describe, it, expect, beforeEach } from 'vitest';
import { BehaviorGenerator } from '../../src/utils/behavior-generator.js';
import { ClaudeConfig } from '../../src/utils/claude-config.js';
import { MergeOptions } from '../../src/behavior/merge-rules.js';

describe('BehaviorGenerator with Merge Rules (P0-3)', () => {
  beforeEach(() => {
    // Clear any previous merged profile state
    BehaviorGenerator.clearMergedProfile();
  });

  describe('Profile Application and Merging', () => {
    it('should apply first profile without merging', () => {
      const config: ClaudeConfig = {
        instructions: ['First profile instructions'],
        rules: ['First rule'],
        allowToolsAppend: ['tool1']
      };

      const result = BehaviorGenerator.applyProfileWithMerge(config);

      expect(result.instructions).toEqual(['First profile instructions']);
      expect(result.rules).toEqual(['First rule']);
      expect(result.allowToolsAppend).toEqual(['tool1']);
    });

    it('should replace profile completely by default', () => {
      const configA: ClaudeConfig = {
        instructions: ['Profile A instructions'],
        rules: ['Rule A'],
        context: ['Context A']
      };

      const configB: ClaudeConfig = {
        instructions: ['Profile B instructions'],
        customInstructions: ['Custom B']
      };

      // Apply first profile
      BehaviorGenerator.applyProfileWithMerge(configA);
      
      // Apply second profile (should replace)
      const result = BehaviorGenerator.applyProfileWithMerge(configB);

      expect(result.instructions).toEqual(['Profile B instructions']);
      expect(result.customInstructions).toEqual(['Custom B']);
      expect(result.rules).toBeUndefined(); // Not preserved from A
      expect(result.context).toBeUndefined(); // Not preserved from A
    });

    it('should merge allowToolsAppend when preserveToolsAppend is true', () => {
      const configA: ClaudeConfig = {
        instructions: ['Profile A'],
        allowToolsAppend: ['web.search', 'file.read']
      };

      const configB: ClaudeConfig = {
        instructions: ['Profile B'],
        allowToolsAppend: ['code.write', 'web.search'] // Intentional duplicate
      };

      const options: MergeOptions = {
        preserveToolsAppend: true
      };

      // Apply profiles
      BehaviorGenerator.applyProfileWithMerge(configA);
      const result = BehaviorGenerator.applyProfileWithMerge(configB, options);

      expect(result.instructions).toEqual(['Profile B']); // Replaced
      expect(result.allowToolsAppend).toEqual(['web.search', 'file.read', 'code.write']); // Merged with dedup
    });

    it('should append to whitelisted sections when specified', () => {
      const configA: ClaudeConfig = {
        instructions: ['Profile A'],
        stopwords: ['old', 'deprecated']
      };

      const configB: ClaudeConfig = {
        instructions: ['Profile B'],
        stopwords: ['new', 'modern']
      };

      const options: MergeOptions = {
        appendSections: ['stopwords']
      };

      // Apply profiles
      BehaviorGenerator.applyProfileWithMerge(configA);
      const result = BehaviorGenerator.applyProfileWithMerge(configB, options);

      expect(result.instructions).toEqual(['Profile B']); // Replaced
      expect(result.stopwords).toEqual(['old', 'deprecated', 'new', 'modern']); // Appended
    });
  });

  describe('Instruction Generation from Merged Profiles', () => {
    it('should generate instructions with MCP override header', () => {
      const config: ClaudeConfig = {
        instructions: ['Test instructions'],
        rules: ['Test rule']
      };

      const merged = BehaviorGenerator.applyProfileWithMerge(config);
      const instructions = BehaviorGenerator.generateFromMerged(merged);

      expect(instructions).toContain('# MCP PROFILE PRIORITY OVERRIDE');
      expect(instructions).toContain('MANDATORY PRIORITY CONTROL');
      expect(instructions).toContain('Test instructions');
      expect(instructions).toContain('Test rule');
    });

    it('should include merged tools section', () => {
      const configA: ClaudeConfig = {
        allowToolsAppend: ['tool1', 'tool2']
      };

      const configB: ClaudeConfig = {
        allowToolsAppend: ['tool3']
      };

      const options: MergeOptions = {
        preserveToolsAppend: true
      };

      BehaviorGenerator.applyProfileWithMerge(configA);
      const merged = BehaviorGenerator.applyProfileWithMerge(configB, options);
      const instructions = BehaviorGenerator.generateFromMerged(merged);

      expect(instructions).toContain('# Additional Permitted Tools');
      expect(instructions).toContain('- tool1');
      expect(instructions).toContain('- tool2');
      expect(instructions).toContain('- tool3');
    });

    it('should handle empty merged profile', () => {
      const emptyConfig: ClaudeConfig = {};

      const merged = BehaviorGenerator.applyProfileWithMerge(emptyConfig);
      const instructions = BehaviorGenerator.generateFromMerged(merged);

      expect(instructions).toContain('# MCP PROFILE PRIORITY OVERRIDE');
      expect(instructions).not.toContain('# System Instructions');
      expect(instructions).not.toContain('# Additional Permitted Tools');
    });
  });

  describe('Convenience Methods', () => {
    it('should apply and generate in one operation', () => {
      const config: ClaudeConfig = {
        instructions: ['Combined operation test'],
        allowToolsAppend: ['combined.tool']
      };

      const instructions = BehaviorGenerator.applyAndGenerate(config);

      expect(instructions).toContain('# MCP PROFILE PRIORITY OVERRIDE');
      expect(instructions).toContain('Combined operation test');
      expect(instructions).toContain('- combined.tool');
    });

    it('should maintain state across operations', () => {
      const configA: ClaudeConfig = {
        allowToolsAppend: ['persistent.tool']
      };

      const configB: ClaudeConfig = {
        instructions: ['New instructions'],
        allowToolsAppend: ['additional.tool']
      };

      const options: MergeOptions = {
        preserveToolsAppend: true
      };

      // Apply first profile
      BehaviorGenerator.applyAndGenerate(configA);
      
      // Get current state
      const currentProfile = BehaviorGenerator.getCurrentMergedProfile();
      expect(currentProfile?.allowToolsAppend).toEqual(['persistent.tool']);

      // Apply second profile
      const instructions = BehaviorGenerator.applyAndGenerate(configB, options);

      expect(instructions).toContain('New instructions');
      expect(instructions).toContain('- persistent.tool');
      expect(instructions).toContain('- additional.tool');
    });
  });

  describe('State Management', () => {
    it('should clear merged profile state', () => {
      const config: ClaudeConfig = {
        instructions: ['Test profile']
      };

      BehaviorGenerator.applyProfileWithMerge(config);
      expect(BehaviorGenerator.getCurrentMergedProfile()).not.toBeNull();

      BehaviorGenerator.clearMergedProfile();
      expect(BehaviorGenerator.getCurrentMergedProfile()).toBeNull();
    });

    it('should return current merged profile', () => {
      const config: ClaudeConfig = {
        instructions: ['Current profile test'],
        rules: ['Current rule']
      };

      const applied = BehaviorGenerator.applyProfileWithMerge(config);
      const current = BehaviorGenerator.getCurrentMergedProfile();

      expect(current).toEqual(applied);
      expect(current?.instructions).toEqual(['Current profile test']);
      expect(current?.rules).toEqual(['Current rule']);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with original generateInstructions', () => {
      const config: ClaudeConfig = {
        instructions: ['Backward compatibility test'],
        rules: ['Compatible rule']
      };

      const instructions = BehaviorGenerator.generateInstructions(config);

      expect(instructions).toContain('# MCP PROFILE PRIORITY OVERRIDE');
      expect(instructions).toContain('Backward compatibility test');
      expect(instructions).toContain('Compatible rule');
    });

    it('should not interfere with merged profile state when using original method', () => {
      const mergedConfig: ClaudeConfig = {
        instructions: ['Merged profile']
      };

      const standaloneConfig: ClaudeConfig = {
        instructions: ['Standalone profile']
      };

      // Set up merged profile
      BehaviorGenerator.applyProfileWithMerge(mergedConfig);
      const beforeState = BehaviorGenerator.getCurrentMergedProfile();

      // Use original method
      BehaviorGenerator.generateInstructions(standaloneConfig);

      // Merged profile state should be unchanged
      const afterState = BehaviorGenerator.getCurrentMergedProfile();
      expect(afterState).toEqual(beforeState);
    });
  });
});