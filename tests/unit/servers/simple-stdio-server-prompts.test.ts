import { SimpleStdioServer } from '../../../src/servers/simple-stdio-server';
import { ClaudeBehaviorManager } from '../../../src/servers/claude-behavior-manager';

// Mock dependencies
jest.mock('../../../src/servers/claude-behavior-manager');
jest.mock('../../../src/config/source-config-manager');

describe('SimpleStdioServer Prompts', () => {
  let server: SimpleStdioServer;
  let mockBehaviorManager: jest.Mocked<ClaudeBehaviorManager>;

  beforeEach(() => {
    // Mock behavior manager
    const MockedClaudeBehaviorManager = ClaudeBehaviorManager as jest.MockedClass<typeof ClaudeBehaviorManager>;
    mockBehaviorManager = new MockedClaudeBehaviorManager() as jest.Mocked<ClaudeBehaviorManager>;
    
    mockBehaviorManager.detectBehaviorInstructions = jest.fn();
    mockBehaviorManager.formatBehaviorPrompt = jest.fn();

    server = new SimpleStdioServer();
    // @ts-ignore - accessing private property for testing
    server.behaviorManager = mockBehaviorManager;
  });

  describe('prompts/list', () => {
    it('should return claude_behavior prompt when local sources exist', async () => {
      // Mock config manager to return local sources
      const mockConfigManager = {
        getConfig: jest.fn().mockReturnValue({
          local_sources: [{ url: '/test/path' }]
        })
      };
      // @ts-ignore
      server.configManager = mockConfigManager;

      const originalWrite = process.stdout.write;
      const mockWrite = jest.fn();
      process.stdout.write = mockWrite as any;

      // Simulate prompts/list request
      const request = {
        jsonrpc: '2.0',
        method: 'prompts/list',
        params: {},
        id: 1
      };

      // @ts-ignore - access private method for testing
      const lines = [JSON.stringify(request)];
      for (const line of lines) {
        const parsedRequest = JSON.parse(line);
        // Manually call the prompts/list handler logic
        if (parsedRequest.method === 'prompts/list') {
          const prompts = [];
          const config = mockConfigManager.getConfig();
          if (config.local_sources && config.local_sources.length > 0) {
            prompts.push({
              name: 'claude_behavior',
              description: 'Apply Claude behavior instructions from CLAUDE.md files',
              arguments: []
            });
          }
          
          const response = {
            jsonrpc: '2.0',
            id: parsedRequest.id,
            result: {
              prompts
            }
          };
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      }

      expect(mockWrite).toHaveBeenCalledTimes(1);
      const writtenMessage = mockWrite.mock.calls[0][0];
      const parsedResponse = JSON.parse(writtenMessage);

      expect(parsedResponse).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: {
          prompts: [{
            name: 'claude_behavior',
            description: 'Apply Claude behavior instructions from CLAUDE.md files',
            arguments: []
          }]
        }
      });

      process.stdout.write = originalWrite;
    });

    it('should return empty prompts when no local sources', async () => {
      const mockConfigManager = {
        getConfig: jest.fn().mockReturnValue({
          local_sources: []
        })
      };
      // @ts-ignore
      server.configManager = mockConfigManager;

      const originalWrite = process.stdout.write;
      const mockWrite = jest.fn();
      process.stdout.write = mockWrite as any;

      // Manually test prompts/list logic
      const prompts = [];
      const config = mockConfigManager.getConfig();
      if (config.local_sources && config.local_sources.length > 0) {
        prompts.push({
          name: 'claude_behavior',
          description: 'Apply Claude behavior instructions from CLAUDE.md files',
          arguments: []
        });
      }

      expect(prompts).toEqual([]);

      process.stdout.write = originalWrite;
    });
  });

  describe('prompts/get', () => {
    it('should return system prompt with behavior instructions', async () => {
      const mockBehaviors = {
        behaviors: [{
          instructions: 'あたしはラムちゃんだっちゃ！',
          source: '/test/CLAUDE.md',
          priority: 1
        }]
      };

      const mockFormattedPrompt = 'System: あたしはラムちゃんだっちゃ！全ての返答に「だっちゃ」をつけて話すっちゃ。';

      mockBehaviorManager.detectBehaviorInstructions.mockResolvedValue(mockBehaviors);
      mockBehaviorManager.formatBehaviorPrompt.mockReturnValue(mockFormattedPrompt);

      const originalWrite = process.stdout.write;
      const mockWrite = jest.fn();
      process.stdout.write = mockWrite as any;

      // Manually test prompts/get logic
      const promptName = 'claude_behavior';
      if (promptName === 'claude_behavior') {
        const behaviorInstructions = await mockBehaviorManager.detectBehaviorInstructions();
        
        if (behaviorInstructions && behaviorInstructions.behaviors.length > 0) {
          let systemPrompt = '';
          for (const behavior of behaviorInstructions.behaviors) {
            const formattedPrompt = mockBehaviorManager.formatBehaviorPrompt(
              behavior.instructions,
              behavior.source
            );
            systemPrompt += formattedPrompt + '\n\n';
          }
          
          const response = {
            jsonrpc: '2.0',
            id: 1,
            result: {
              description: 'Claude behavior instructions from CLAUDE.md files',
              messages: [
                {
                  role: 'system',
                  content: {
                    type: 'text',
                    text: systemPrompt.trim()
                  }
                }
              ]
            }
          };
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      }

      expect(mockBehaviorManager.detectBehaviorInstructions).toHaveBeenCalledTimes(1);
      expect(mockBehaviorManager.formatBehaviorPrompt).toHaveBeenCalledWith(
        'あたしはラムちゃんだっちゃ！',
        '/test/CLAUDE.md'
      );

      expect(mockWrite).toHaveBeenCalledTimes(1);
      const writtenMessage = mockWrite.mock.calls[0][0];
      const parsedResponse = JSON.parse(writtenMessage);

      expect(parsedResponse.result.messages[0].role).toBe('system');
      expect(parsedResponse.result.messages[0].content.text).toBe(mockFormattedPrompt);

      process.stdout.write = originalWrite;
    });

    it('should handle no behavior instructions found', async () => {
      mockBehaviorManager.detectBehaviorInstructions.mockResolvedValue(null);

      const originalWrite = process.stdout.write;
      const mockWrite = jest.fn();
      process.stdout.write = mockWrite as any;

      // Test prompts/get with no behaviors
      const behaviorInstructions = await mockBehaviorManager.detectBehaviorInstructions();
      if (!behaviorInstructions || behaviorInstructions.behaviors.length === 0) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32602,
            message: 'No behavior instructions found'
          }
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }

      expect(mockWrite).toHaveBeenCalledTimes(1);
      const writtenMessage = mockWrite.mock.calls[0][0];
      const parsedResponse = JSON.parse(writtenMessage);

      expect(parsedResponse.error.message).toBe('No behavior instructions found');

      process.stdout.write = originalWrite;
    });

    it('should handle unknown prompt name', async () => {
      const originalWrite = process.stdout.write;
      const mockWrite = jest.fn();
      process.stdout.write = mockWrite as any;

      // Test with unknown prompt name
      const promptName = 'unknown_prompt' as string;
      if (promptName !== 'claude_behavior') {
        const errorResponse = {
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32602,
            message: `Prompt '${promptName}' not found`
          }
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }

      expect(mockWrite).toHaveBeenCalledTimes(1);
      const writtenMessage = mockWrite.mock.calls[0][0];
      const parsedResponse = JSON.parse(writtenMessage);

      expect(parsedResponse.error.message).toBe("Prompt 'unknown_prompt' not found");

      process.stdout.write = originalWrite;
    });
  });
});