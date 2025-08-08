/**
 * Claude Behavior Management Tests
 * 
 * Tests for automatic CLAUDE.md behavior prompt detection and application
 */

import { ClaudeBehaviorManager } from '../../../src/servers/claude-behavior-manager';
import { SourceConfigManager } from '../../../src/config/source-config-manager';
import { OmniSourceManager } from '../../../src/sources/source-manager';

// Mock dependencies
jest.mock('../../../src/config/source-config-manager');
jest.mock('../../../src/sources/source-manager');

const MockSourceConfigManager = SourceConfigManager as jest.MockedClass<typeof SourceConfigManager>;
const MockOmniSourceManager = OmniSourceManager as jest.MockedClass<typeof OmniSourceManager>;

describe('ClaudeBehaviorManager', () => {
  let behaviorManager: ClaudeBehaviorManager;
  let mockConfigManager: jest.Mocked<SourceConfigManager>;
  let mockSourceManager: jest.Mocked<OmniSourceManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfigManager = {
      getSources: jest.fn(),
      getConfig: jest.fn().mockReturnValue({
        server: { port: 3000 },
        files: { patterns: ['CLAUDE.md'], max_size: 1048576 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 3 }
      })
    } as any;
    
    mockSourceManager = {
      getSourceFile: jest.fn(),
      initializeSources: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockSourceConfigManager.mockImplementation(() => mockConfigManager);
    MockOmniSourceManager.mockImplementation(() => mockSourceManager);
    
    behaviorManager = new ClaudeBehaviorManager();
  });

  describe('detectBehaviorInstructions', () => {
    it('should detect behavior instructions from CLAUDE.md', async () => {
      // Setup mock local sources
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/app/docs/single' },
        { type: 'local', path: '/documents' }
      ]);

      // Mock CLAUDE.md content with behavior instructions
      const claudeContent = `# Single-Tier Configuration だっちゃ

シンプルな平坦設定アプローチでOmni MCP Hubをデプロイするっちゃ！

## System Behavior だっちゃ

Claude should respond in Lum-chan style with "だっちゃ" at the end of sentences.
Always use cheerful and energetic tone.
`;

      mockSourceManager.getSourceFile
        .mockResolvedValueOnce(claudeContent) // First source has CLAUDE.md
        .mockResolvedValueOnce(null); // Second source doesn't

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result).toBeDefined();
      expect(result!.behaviors).toHaveLength(1);
      expect(result!.behaviors[0].instructions).toContain('Single-Tier Configuration だっちゃ');
      expect(result!.behaviors[0].instructions).toContain('シンプルな平坦設定アプローチでOmni MCP Hub');
      expect(result!.behaviors[0].source).toBe('/app/docs/single/CLAUDE.md');
      expect(result!.behaviors[0].priority).toBe(0);
    });

    it('should return null when no CLAUDE.md found', async () => {
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/documents' }
      ]);

      mockSourceManager.getSourceFile.mockResolvedValue(null);

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result).toBeNull();
    });

    it('should return full content when CLAUDE.md exists', async () => {
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/app/docs' }
      ]);

      const claudeContent = `# Technical Documentation

This is just technical documentation without behavior instructions.

## Configuration

Some technical content here.
`;

      mockSourceManager.getSourceFile.mockResolvedValue(claudeContent);

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result).toBeDefined();
      expect(result!.behaviors).toHaveLength(1);
      expect(result!.behaviors[0].instructions).toContain('Technical Documentation');
    });

    it('should collect multiple CLAUDE.md files', async () => {
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/app/docs/high', behavior_priority: 10 },
        { type: 'local', path: '/app/docs/low', behavior_priority: 5 },
        { type: 'local', path: '/app/docs/default' }
      ]);

      const highPriorityContent = `# High Priority Behavior
Use formal language.`;
      
      const lowPriorityContent = `# Low Priority Behavior  
Be casual.`;
      
      const defaultContent = `# Default Behavior
Be helpful.`;

      mockSourceManager.getSourceFile
        .mockResolvedValueOnce(highPriorityContent)
        .mockResolvedValueOnce(lowPriorityContent)
        .mockResolvedValueOnce(defaultContent);

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result).toBeDefined();
      expect(result!.behaviors).toHaveLength(3);
      // Should be sorted by priority (highest first)
      expect(result!.behaviors[0].priority).toBe(10);
      expect(result!.behaviors[0].instructions).toContain('High Priority');
      expect(result!.behaviors[1].priority).toBe(5);
      expect(result!.behaviors[1].instructions).toContain('Low Priority');
      expect(result!.behaviors[2].priority).toBe(0);
      expect(result!.behaviors[2].instructions).toContain('Default');
    });

    it('should handle file read errors gracefully', async () => {
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/app/docs' }
      ]);

      mockSourceManager.getSourceFile.mockRejectedValue(new Error('File read error'));

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result).toBeNull();
    });

    it('should collect all found CLAUDE.md files', async () => {
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/app/docs/single' },
        { type: 'local', path: '/app/docs/multi' }
      ]);

      mockSourceManager.getSourceFile
        .mockResolvedValueOnce('# First CLAUDE.md\nFirst instructions')
        .mockResolvedValueOnce('# Second CLAUDE.md\nSecond instructions');

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result).toBeDefined();
      expect(result!.behaviors).toHaveLength(2);
      expect(result!.behaviors[0].instructions).toContain('First instructions');
      expect(result!.behaviors[1].instructions).toContain('Second instructions');
      expect(result!.behaviors[0].source).toBe('/app/docs/single/CLAUDE.md');
      expect(result!.behaviors[1].source).toBe('/app/docs/multi/CLAUDE.md');
    });
  });

  describe('extractBehaviorFromContent', () => {
    it('should return full content', () => {
      const content = `# Title
## System Behavior
These are behavior instructions.
More instructions here.
## Other Section
Not behavior instructions.`;

      const result = behaviorManager.extractBehaviorFromContent(content);

      expect(result).toBe(content);
    });

    it('should return null for empty content', () => {
      const result = behaviorManager.extractBehaviorFromContent('');

      expect(result).toBeNull();
    });
  });

  describe('formatBehaviorPrompt', () => {
    it('should return raw instructions', () => {
      const instructions = `Respond as Lum-chan with "だっちゃ" endings.
Use cheerful and energetic tone.`;
      const source = '/app/docs/single/CLAUDE.md';

      const result = behaviorManager.formatBehaviorPrompt(instructions, source);

      expect(result).toBe(instructions);
    });

    it('should handle empty instructions', () => {
      const result = behaviorManager.formatBehaviorPrompt('  ', '/app/docs/CLAUDE.md');

      expect(result).toBe('');
    });
  });

  describe('isEnabled', () => {
    it('should be enabled by default', () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        files: { patterns: ['CLAUDE.md'], max_size: 1048576 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 3 },
        behavior_detection: undefined
      } as any);

      expect(behaviorManager.isEnabled()).toBe(true);
    });

    it('should respect explicit configuration', () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        files: { patterns: ['CLAUDE.md'], max_size: 1048576 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 3 },
        behavior_detection: { enabled: false }
      } as any);

      expect(behaviorManager.isEnabled()).toBe(false);
    });

    it('should be enabled when explicitly set to true', () => {
      mockConfigManager.getConfig.mockReturnValue({
        server: { port: 3000 },
        files: { patterns: ['CLAUDE.md'], max_size: 1048576 },
        fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 3 },
        behavior_detection: { enabled: true }
      } as any);

      expect(behaviorManager.isEnabled()).toBe(true);
    });
  });
});