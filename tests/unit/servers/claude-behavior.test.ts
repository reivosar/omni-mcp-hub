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
      getSourceFile: jest.fn()
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
      expect(result!.instructions).toContain('Lum-chan style');
      expect(result!.instructions).toContain('だっちゃ');
      expect(result!.source).toBe('/app/docs/single/CLAUDE.md');
    });

    it('should return null when no CLAUDE.md found', async () => {
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/documents' }
      ]);

      mockSourceManager.getSourceFile.mockResolvedValue(null);

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result).toBeNull();
    });

    it('should return null when CLAUDE.md has no behavior instructions', async () => {
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

      expect(result).toBeNull();
    });

    it('should extract behavior from multiple instruction patterns', async () => {
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/app/docs' }
      ]);

      const claudeContent = `# Documentation

## System Behavior
Respond as Lum-chan with "だっちゃ" endings.

## Claude Instructions
- Use cheerful tone
- Be energetic
- Add "だっちゃ" to sentences

## Assistant Prompt
Act like the character Lum from Urusei Yatsura.
`;

      mockSourceManager.getSourceFile.mockResolvedValue(claudeContent);

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result).toBeDefined();
      expect(result!.instructions).toContain('Respond as Lum-chan');
      expect(result!.instructions).toContain('Use cheerful tone');
      expect(result!.instructions).toContain('Act like the character Lum');
    });

    it('should handle file read errors gracefully', async () => {
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/app/docs' }
      ]);

      mockSourceManager.getSourceFile.mockRejectedValue(new Error('File read error'));

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result).toBeNull();
    });

    it('should prioritize first found CLAUDE.md', async () => {
      mockConfigManager.getSources.mockReturnValue([
        { type: 'local', path: '/app/docs/single' },
        { type: 'local', path: '/app/docs/multi' }
      ]);

      mockSourceManager.getSourceFile
        .mockResolvedValueOnce('# First CLAUDE.md\n## System Behavior\nFirst instructions')
        .mockResolvedValueOnce('# Second CLAUDE.md\n## System Behavior\nSecond instructions');

      const result = await behaviorManager.detectBehaviorInstructions();

      expect(result!.instructions).toContain('First instructions');
      expect(result!.instructions).not.toContain('Second instructions');
      expect(result!.source).toBe('/app/docs/single/CLAUDE.md');
    });
  });

  describe('extractBehaviorFromContent', () => {
    it('should extract system behavior section', () => {
      const content = `# Title
## System Behavior
These are behavior instructions.
More instructions here.
## Other Section
Not behavior instructions.`;

      const result = behaviorManager.extractBehaviorFromContent(content);

      expect(result).toContain('These are behavior instructions');
      expect(result).toContain('More instructions here');
      expect(result).not.toContain('Not behavior instructions');
    });

    it('should extract claude instructions section', () => {
      const content = `# Title
## Claude Instructions
- Instruction 1
- Instruction 2
## Other Section
Other content.`;

      const result = behaviorManager.extractBehaviorFromContent(content);

      expect(result).toContain('Instruction 1');
      expect(result).toContain('Instruction 2');
    });

    it('should extract assistant prompt section', () => {
      const content = `# Title
## Assistant Prompt
You should behave like this.
Additional prompt here.
## Next Section
Not prompt content.`;

      const result = behaviorManager.extractBehaviorFromContent(content);

      expect(result).toContain('You should behave like this');
      expect(result).toContain('Additional prompt here');
      expect(result).not.toContain('Not prompt content');
    });

    it('should combine multiple behavior sections', () => {
      const content = `# Title
## System Behavior
System instructions.
## Claude Instructions
Claude instructions.
## Assistant Prompt
Assistant instructions.`;

      const result = behaviorManager.extractBehaviorFromContent(content);

      expect(result).toContain('System instructions');
      expect(result).toContain('Claude instructions'); 
      expect(result).toContain('Assistant instructions');
    });

    it('should return null when no behavior sections found', () => {
      const content = `# Title
## Configuration
Technical content.
## Usage
More technical content.`;

      const result = behaviorManager.extractBehaviorFromContent(content);

      expect(result).toBeNull();
    });

    it('should handle Japanese section headers', () => {
      const content = `# Title だっちゃ
## System Behavior だっちゃ
ラムちゃんとして振る舞うっちゃ！
## Other Section
Other content.`;

      const result = behaviorManager.extractBehaviorFromContent(content);

      expect(result).toContain('ラムちゃんとして振る舞うっちゃ');
    });
  });

  describe('formatBehaviorPrompt', () => {
    it('should format behavior instructions as system prompt', () => {
      const instructions = `Respond as Lum-chan with "だっちゃ" endings.
Use cheerful and energetic tone.`;
      const source = '/app/docs/single/CLAUDE.md';

      const result = behaviorManager.formatBehaviorPrompt(instructions, source);

      expect(result).toContain('Based on CLAUDE.md instructions');
      expect(result).toContain('Respond as Lum-chan');
      expect(result).toContain('だっちゃ');
      expect(result).toContain('cheerful and energetic');
      expect(result).toContain('/app/docs/single/CLAUDE.md');
    });

    it('should handle empty instructions', () => {
      const result = behaviorManager.formatBehaviorPrompt('', '/app/docs/CLAUDE.md');

      expect(result).toContain('Based on CLAUDE.md instructions');
      expect(result).toContain('no specific behavior');
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