import { SimpleStdioServer } from '../../../src/servers/simple-stdio-server';
import { ClaudeBehaviorManager } from '../../../src/servers/claude-behavior-manager';

// Mock dependencies
jest.mock('../../../src/servers/claude-behavior-manager');
jest.mock('../../../src/config/source-config-manager');

describe('SimpleStdioServer', () => {
  let server: SimpleStdioServer;
  let mockBehaviorManager: jest.Mocked<ClaudeBehaviorManager>;

  beforeEach(() => {
    // Mock behavior manager
    const MockedClaudeBehaviorManager = ClaudeBehaviorManager as jest.MockedClass<typeof ClaudeBehaviorManager>;
    mockBehaviorManager = new MockedClaudeBehaviorManager() as jest.Mocked<ClaudeBehaviorManager>;
    
    // Mock detectBehaviorInstructions method
    mockBehaviorManager.detectBehaviorInstructions = jest.fn();
    mockBehaviorManager.formatBehaviorPrompt = jest.fn();

    server = new SimpleStdioServer();
    // @ts-ignore - accessing private property for testing
    server.behaviorManager = mockBehaviorManager;
  });

  describe('sendBehaviorInstructions', () => {
    it('should send behavior instructions when available', async () => {
      const mockBehaviors = {
        behaviors: [{
          instructions: 'Test behavior instructions',
          source: '/test/path/CLAUDE.md',
          priority: 1
        }]
      };

      const mockFormattedPrompt = 'Formatted test behavior prompt だっちゃ';

      mockBehaviorManager.detectBehaviorInstructions.mockResolvedValue(mockBehaviors);
      mockBehaviorManager.formatBehaviorPrompt.mockReturnValue(mockFormattedPrompt);

      // Mock stdout write
      const originalWrite = process.stdout.write;
      const mockWrite = jest.fn();
      process.stdout.write = mockWrite as any;

      // Call private method via reflection
      // @ts-ignore
      await server.sendBehaviorInstructions();

      // Verify behavior manager methods were called
      expect(mockBehaviorManager.detectBehaviorInstructions).toHaveBeenCalledTimes(1);
      expect(mockBehaviorManager.formatBehaviorPrompt).toHaveBeenCalledWith(
        'Test behavior instructions',
        '/test/path/CLAUDE.md'
      );

      // Verify JSON message was written to stdout
      expect(mockWrite).toHaveBeenCalledTimes(1);
      const writtenMessage = mockWrite.mock.calls[0][0];
      const parsedMessage = JSON.parse(writtenMessage);

      expect(parsedMessage).toEqual({
        jsonrpc: '2.0',
        method: 'system/behavior',
        params: {
          source: '/test/path/CLAUDE.md',
          instructions: mockFormattedPrompt,
          type: 'claude_behavior'
        }
      });

      // Restore stdout
      process.stdout.write = originalWrite;
    });

    it('should handle no behavior instructions gracefully', async () => {
      mockBehaviorManager.detectBehaviorInstructions.mockResolvedValue(null);

      const originalWrite = process.stdout.write;
      const mockWrite = jest.fn();
      process.stdout.write = mockWrite as any;

      // @ts-ignore
      await server.sendBehaviorInstructions();

      expect(mockBehaviorManager.detectBehaviorInstructions).toHaveBeenCalledTimes(1);
      expect(mockWrite).not.toHaveBeenCalled();

      process.stdout.write = originalWrite;
    });

    it('should handle empty behavior instructions', async () => {
      mockBehaviorManager.detectBehaviorInstructions.mockResolvedValue({
        behaviors: []
      });

      const originalWrite = process.stdout.write;
      const mockWrite = jest.fn();
      process.stdout.write = mockWrite as any;

      // @ts-ignore
      await server.sendBehaviorInstructions();

      expect(mockBehaviorManager.detectBehaviorInstructions).toHaveBeenCalledTimes(1);
      expect(mockWrite).not.toHaveBeenCalled();

      process.stdout.write = originalWrite;
    });

    it('should handle multiple behavior instructions', async () => {
      const mockBehaviors = {
        behaviors: [
          {
            instructions: 'First behavior',
            source: '/test/path1/CLAUDE.md',
            priority: 1
          },
          {
            instructions: 'Second behavior',
            source: '/test/path2/CLAUDE.md',
            priority: 2
          }
        ]
      };

      mockBehaviorManager.detectBehaviorInstructions.mockResolvedValue(mockBehaviors);
      mockBehaviorManager.formatBehaviorPrompt
        .mockReturnValueOnce('Formatted first behavior')
        .mockReturnValueOnce('Formatted second behavior');

      const originalWrite = process.stdout.write;
      const mockWrite = jest.fn();
      process.stdout.write = mockWrite as any;

      // @ts-ignore
      await server.sendBehaviorInstructions();

      expect(mockBehaviorManager.formatBehaviorPrompt).toHaveBeenCalledTimes(2);
      expect(mockWrite).toHaveBeenCalledTimes(2);

      process.stdout.write = originalWrite;
    });

    it('should handle errors gracefully', async () => {
      const originalError = console.error;
      const mockConsoleError = jest.fn();
      console.error = mockConsoleError;

      mockBehaviorManager.detectBehaviorInstructions.mockRejectedValue(new Error('Test error'));

      // @ts-ignore
      await server.sendBehaviorInstructions();

      expect(mockConsoleError).toHaveBeenCalledWith('Failed to send behavior instructions:', expect.any(Error));

      console.error = originalError;
    });
  });
});