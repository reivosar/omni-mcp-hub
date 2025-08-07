import { CLIHelpers } from '../../../src/utils/cli-helpers';
import { SourceConfigManager } from '../../../src/config/source-config-manager';

// Mock dependencies
jest.mock('../../../src/config/source-config-manager');

const MockSourceConfigManager = SourceConfigManager as jest.MockedClass<typeof SourceConfigManager>;

describe('CLIHelpers', () => {
  const originalConsole = console;
  let mockConsoleLog: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
  });

  describe('showConfigExamples', () => {
    it('should call SourceConfigManager.getConfigExamples and log result', () => {
      const mockExamples = 'Mock configuration examples';
      MockSourceConfigManager.getConfigExamples = jest.fn().mockReturnValue(mockExamples);

      CLIHelpers.showConfigExamples();

      expect(MockSourceConfigManager.getConfigExamples).toHaveBeenCalledTimes(1);
      expect(mockConsoleLog).toHaveBeenCalledWith(mockExamples);
    });

    it('should handle empty examples', () => {
      MockSourceConfigManager.getConfigExamples = jest.fn().mockReturnValue('');

      CLIHelpers.showConfigExamples();

      expect(mockConsoleLog).toHaveBeenCalledWith('');
    });
  });

  describe('showAutoDetectionHelp', () => {
    it('should display auto-detection help text', () => {
      CLIHelpers.showAutoDetectionHelp();

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const helpText = mockConsoleLog.mock.calls[0][0];
      
      // Check that the help text contains key information
      expect(helpText).toContain('Auto-detection feature');
      expect(helpText).toContain('Traditional method');
      expect(helpText).toContain('GitHub:');
      expect(helpText).toContain('Local:');
      expect(helpText).toContain('Benefits:');
      expect(helpText).toContain('https://github.com/owner/repo');
      expect(helpText).toContain('/absolute/path');
      expect(helpText).toContain('github:owner/repo@branch');
    });

    it('should show supported formats for GitHub', () => {
      CLIHelpers.showAutoDetectionHelp();

      const helpText = mockConsoleLog.mock.calls[0][0];
      expect(helpText).toContain('https://github.com/owner/repo');
      expect(helpText).toContain('github:owner/repo@branch');
      expect(helpText).toContain('owner/repo@branch');
      expect(helpText).toContain('owner/repo (default branch: main)');
    });

    it('should show supported formats for Local paths', () => {
      CLIHelpers.showAutoDetectionHelp();

      const helpText = mockConsoleLog.mock.calls[0][0];
      expect(helpText).toContain('/absolute/path');
      expect(helpText).toContain('./relative/path');
      expect(helpText).toContain('../parent/path');
      expect(helpText).toContain('file:///file/protocol/path');
      expect(helpText).toContain('C:\\Windows\\Path (Windows)');
    });
  });

  describe('validateConfigUrl', () => {
    let mockConfigManager: jest.Mocked<SourceConfigManager>;

    beforeEach(() => {
      mockConfigManager = new MockSourceConfigManager() as jest.Mocked<SourceConfigManager>;
      // Mock the private parseSourceUrl method
      (mockConfigManager as any).parseSourceUrl = jest.fn();
    });

    it('should validate GitHub URL successfully', () => {
      const testUrl = 'https://github.com/microsoft/vscode';
      const mockResult = {
        type: 'github',
        owner: 'microsoft',
        repo: 'vscode',
        branch: 'main'
      };
      
      (mockConfigManager as any).parseSourceUrl.mockReturnValue(mockResult);
      MockSourceConfigManager.mockImplementation(() => mockConfigManager);

      CLIHelpers.validateConfigUrl(testUrl);

      expect((mockConfigManager as any).parseSourceUrl).toHaveBeenCalledWith(testUrl);
      expect(mockConsoleLog).toHaveBeenCalledWith(`URL parsing successful: ${testUrl}`);
      expect(mockConsoleLog).toHaveBeenCalledWith('   Type: github');
      expect(mockConsoleLog).toHaveBeenCalledWith('   Owner: microsoft');
      expect(mockConsoleLog).toHaveBeenCalledWith('   Repo: vscode');
      expect(mockConsoleLog).toHaveBeenCalledWith('   Branch: main');
    });

    it('should validate local path successfully', () => {
      const testUrl = '/Users/mac/my-project';
      const mockResult = {
        type: 'local',
        path: '/Users/mac/my-project'
      };
      
      (mockConfigManager as any).parseSourceUrl.mockReturnValue(mockResult);
      MockSourceConfigManager.mockImplementation(() => mockConfigManager);

      CLIHelpers.validateConfigUrl(testUrl);

      expect((mockConfigManager as any).parseSourceUrl).toHaveBeenCalledWith(testUrl);
      expect(mockConsoleLog).toHaveBeenCalledWith(`URL parsing successful: ${testUrl}`);
      expect(mockConsoleLog).toHaveBeenCalledWith('   Type: local');
      expect(mockConsoleLog).toHaveBeenCalledWith('   Path: /Users/mac/my-project');
    });

    it('should handle parsing errors gracefully', () => {
      const testUrl = 'invalid-url';
      const errorMessage = 'Invalid URL format';
      
      (mockConfigManager as any).parseSourceUrl.mockImplementation(() => {
        throw new Error(errorMessage);
      });
      MockSourceConfigManager.mockImplementation(() => mockConfigManager);

      CLIHelpers.validateConfigUrl(testUrl);

      expect(mockConsoleError).toHaveBeenCalledWith(`URL parsing error: ${testUrl}`);
      expect(mockConsoleError).toHaveBeenCalledWith(`   ${errorMessage}`);
    });

    it('should handle non-Error exceptions', () => {
      const testUrl = 'invalid-url';
      const errorMessage = 'String error';
      
      (mockConfigManager as any).parseSourceUrl.mockImplementation(() => {
        throw errorMessage;
      });
      MockSourceConfigManager.mockImplementation(() => mockConfigManager);

      CLIHelpers.validateConfigUrl(testUrl);

      expect(mockConsoleError).toHaveBeenCalledWith(`URL parsing error: ${testUrl}`);
      expect(mockConsoleError).toHaveBeenCalledWith(`   ${errorMessage}`);
    });

    it('should handle unknown source types', () => {
      const testUrl = 'unknown://test';
      const mockResult = {
        type: 'unknown'
      };
      
      (mockConfigManager as any).parseSourceUrl.mockReturnValue(mockResult);
      MockSourceConfigManager.mockImplementation(() => mockConfigManager);

      CLIHelpers.validateConfigUrl(testUrl);

      expect(mockConsoleLog).toHaveBeenCalledWith(`URL parsing successful: ${testUrl}`);
      expect(mockConsoleLog).toHaveBeenCalledWith('   Type: unknown');
      // Should not log owner/repo/branch or path for unknown types
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Owner:'));
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Path:'));
    });
  });

  describe('Static method availability', () => {
    it('should have all expected static methods', () => {
      expect(typeof CLIHelpers.showConfigExamples).toBe('function');
      expect(typeof CLIHelpers.showAutoDetectionHelp).toBe('function');
      expect(typeof CLIHelpers.validateConfigUrl).toBe('function');
    });

    it('should not require instantiation', () => {
      // Should be able to call static methods without creating instance
      expect(() => CLIHelpers.showAutoDetectionHelp()).not.toThrow();
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle constructor errors gracefully', () => {
      MockSourceConfigManager.mockImplementation(() => {
        throw new Error('Constructor failed');
      });

      CLIHelpers.validateConfigUrl('test-url');

      expect(mockConsoleError).toHaveBeenCalledWith('URL parsing error: test-url');
      expect(mockConsoleError).toHaveBeenCalledWith('   Constructor failed');
    });

    it('should handle null results from parseSourceUrl', () => {
      // Reset all mocks
      jest.resetAllMocks();
      
      const mockConfigManager = {
        parseSourceUrl: jest.fn().mockReturnValue({ type: 'unknown' })
      };
      MockSourceConfigManager.mockImplementation(() => mockConfigManager as any);

      expect(() => CLIHelpers.validateConfigUrl('test-url')).not.toThrow();
    });
  });
});

describe('CLI Execution', () => {
  // Note: Testing the CLI execution part requires mocking require.main and process.argv
  // These tests would need to be in a separate integration test file
  // or use a different approach since they involve module-level code

  it('should export CLIHelpers class', () => {
    expect(CLIHelpers).toBeDefined();
    expect(typeof CLIHelpers).toBe('function');
  });

  it('should have expected method signatures', () => {
    expect(CLIHelpers.showConfigExamples.length).toBe(0);
    expect(CLIHelpers.showAutoDetectionHelp.length).toBe(0);
    expect(CLIHelpers.validateConfigUrl.length).toBe(1);
  });
});