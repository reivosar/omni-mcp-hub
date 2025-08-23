import { describe, it, expect } from 'vitest';
import { 
  ProfileMerger, 
  ProfileMergeResult, 
  MergeOptions, 
  MergeStrategy,
  APPEND_ALLOWED_SECTIONS,
  REPLACE_ONLY_SECTIONS
} from '../../src/behavior/merge-rules.js';

describe('Profile Merge Rules (P0-3)', () => {
  describe('Complete Replacement Strategy (Default)', () => {
    it('should completely replace previous profile by default', () => {
      const profileA: ProfileMergeResult = {
        instructions: ['Do X', 'Follow pattern A'],
        rules: ['Rule 1', 'Rule 2'],
        context: ['Context A']
      };

      const profileB: ProfileMergeResult = {
        instructions: ['Do Y', 'Follow pattern B'],
        rules: ['Rule 3'],
        knowledge: ['New knowledge']
      };

      const result = ProfileMerger.merge(profileA, profileB);

      expect(result.instructions).toEqual(['Do Y', 'Follow pattern B']);
      expect(result.rules).toEqual(['Rule 3']);
      expect(result.knowledge).toEqual(['New knowledge']);
      expect(result.context).toBeUndefined(); // Previous context is not preserved
    });

    it('should handle null previous profile', () => {
      const newProfile: ProfileMergeResult = {
        instructions: ['First profile'],
        rules: ['Initial rule']
      };

      const result = ProfileMerger.merge(null, newProfile);

      expect(result).toEqual(newProfile);
    });
  });

  describe('Tool Union Exception', () => {
    it('should merge allowToolsAppend with union strategy', () => {
      const profileA: ProfileMergeResult = {
        instructions: ['Base instructions'],
        allowToolsAppend: ['web.search', 'file.read']
      };

      const profileB: ProfileMergeResult = {
        instructions: ['New instructions'],
        allowToolsAppend: ['code.write', 'web.search'] // Duplicate intentional
      };

      const options: MergeOptions = {
        preserveToolsAppend: true
      };

      const result = ProfileMerger.merge(profileA, profileB, options);

      expect(result.instructions).toEqual(['New instructions']); // Replaced
      expect(result.allowToolsAppend).toEqual(['web.search', 'file.read', 'code.write']); // Union with dedup
    });

    it('should handle empty allowToolsAppend arrays', () => {
      const profileA: ProfileMergeResult = {
        allowToolsAppend: ['existing.tool']
      };

      const profileB: ProfileMergeResult = {
        allowToolsAppend: []
      };

      const options: MergeOptions = {
        preserveToolsAppend: true
      };

      const result = ProfileMerger.merge(profileA, profileB, options);

      expect(result.allowToolsAppend).toEqual(['existing.tool']); // Preserves existing
    });
  });

  describe('Append-Only Section Exception', () => {
    it('should append to whitelisted sections when requested', () => {
      const profileA: ProfileMergeResult = {
        instructions: ['Old instructions'],
        stopwords: ['old', 'deprecated']
      };

      const profileB: ProfileMergeResult = {
        instructions: ['New instructions'],
        stopwords: ['new', 'modern']
      };

      const options: MergeOptions = {
        appendSections: ['stopwords']
      };

      const result = ProfileMerger.merge(profileA, profileB, options);

      expect(result.instructions).toEqual(['New instructions']); // Replaced
      expect(result.stopwords).toEqual(['old', 'deprecated', 'new', 'modern']); // Appended
    });

    it('should validate append sections against whitelist', () => {
      const options: MergeOptions = {
        appendSections: ['instructions'] // Prohibited section
      };

      const validation = ProfileMerger.validateMergeOptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Section 'instructions' cannot be appended - it must be replaced completely");
    });

    it('should reject non-whitelisted sections for append', () => {
      const options: MergeOptions = {
        appendSections: ['custom_section'] // Not in whitelist
      };

      const validation = ProfileMerger.validateMergeOptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Section 'custom_section' is not in the append whitelist");
    });
  });

  describe('Section Classification', () => {
    it('should classify replace-only sections correctly', () => {
      const replaceOnlySections = [
        'instructions',
        'customInstructions',
        'rules',
        'context',
        'knowledge',
        'memory'
      ];

      replaceOnlySections.forEach(section => {
        expect(REPLACE_ONLY_SECTIONS.has(section)).toBe(true);
      });
    });

    it('should classify append-allowed sections correctly', () => {
      const appendAllowedSections = [
        'allowToolsAppend',
        'stopwords',
        'memory_dict',
        'glossary'
      ];

      appendAllowedSections.forEach(section => {
        expect(APPEND_ALLOWED_SECTIONS.has(section)).toBe(true);
      });
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid options', () => {
      const options: MergeOptions = {
        appendSections: ['stopwords', 'glossary'],
        preserveToolsAppend: true
      };

      const validation = ProfileMerger.validateMergeOptions(options);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should fail validation for multiple invalid sections', () => {
      const options: MergeOptions = {
        appendSections: ['instructions', 'rules', 'invalid_section']
      };

      const validation = ProfileMerger.validateMergeOptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(2);
    });
  });

  describe('Complex Merge Scenarios', () => {
    it('should handle profile with both replacement and union', () => {
      const profileA: ProfileMergeResult = {
        instructions: ['Old instructions'],
        rules: ['Old rule'],
        allowToolsAppend: ['tool1'],
        stopwords: ['old']
      };

      const profileB: ProfileMergeResult = {
        instructions: ['New instructions'],
        customInstructions: ['Custom'],
        allowToolsAppend: ['tool2'],
        stopwords: ['new']
      };

      const options: MergeOptions = {
        appendSections: ['stopwords'],
        preserveToolsAppend: true
      };

      const result = ProfileMerger.merge(profileA, profileB, options);

      expect(result.instructions).toEqual(['New instructions']); // Replaced
      expect(result.rules).toBeUndefined(); // Not in new profile
      expect(result.customInstructions).toEqual(['Custom']); // New addition
      expect(result.allowToolsAppend).toEqual(['tool1', 'tool2']); // Union
      expect(result.stopwords).toEqual(['old', 'new']); // Appended
    });

    it('should handle non-array values gracefully', () => {
      const profileA: ProfileMergeResult = {
        memory: 'Old memory content',
        custom_field: 'old value'
      };

      const profileB: ProfileMergeResult = {
        memory: 'New memory content',
        custom_field: 'new value'
      };

      const result = ProfileMerger.merge(profileA, profileB);

      expect(result.memory).toBe('New memory content'); // Replaced
      expect(result.custom_field).toBe('new value'); // Replaced
    });
  });

  describe('Strategy Documentation', () => {
    it('should provide comprehensive strategy documentation', () => {
      const doc = ProfileMerger.getStrategyDoc();

      expect(doc).toContain('Complete Replacement');
      expect(doc).toContain('Tool Permissions (Union)');
      expect(doc).toContain('Append-Only Sections');
      expect(doc).toContain('Prohibited Merging');
      expect(doc).toContain('Examples');
    });
  });
});