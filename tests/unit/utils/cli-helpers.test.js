"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cli_helpers_1 = require("../../../src/utils/cli-helpers");
const source_config_manager_1 = require("../../../src/config/source-config-manager");
jest.mock('../../../src/config/source-config-manager');
const MockSourceConfigManager = source_config_manager_1.SourceConfigManager;
describe('CLIHelpers', () => {
    const originalConsole = console;
    let mockConsoleLog;
    let mockConsoleError;
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
            cli_helpers_1.CLIHelpers.showConfigExamples();
            expect(MockSourceConfigManager.getConfigExamples).toHaveBeenCalledTimes(1);
            expect(mockConsoleLog).toHaveBeenCalledWith(mockExamples);
        });
        it('should handle empty examples', () => {
            MockSourceConfigManager.getConfigExamples = jest.fn().mockReturnValue('');
            cli_helpers_1.CLIHelpers.showConfigExamples();
            expect(mockConsoleLog).toHaveBeenCalledWith('');
        });
    });
    describe('showAutoDetectionHelp', () => {
        it('should display auto-detection help text', () => {
            cli_helpers_1.CLIHelpers.showAutoDetectionHelp();
            expect(mockConsoleLog).toHaveBeenCalledTimes(1);
            const helpText = mockConsoleLog.mock.calls[0][0];
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
            cli_helpers_1.CLIHelpers.showAutoDetectionHelp();
            const helpText = mockConsoleLog.mock.calls[0][0];
            expect(helpText).toContain('https://github.com/owner/repo');
            expect(helpText).toContain('github:owner/repo@branch');
            expect(helpText).toContain('owner/repo@branch');
            expect(helpText).toContain('owner/repo (default branch: main)');
        });
        it('should show supported formats for Local paths', () => {
            cli_helpers_1.CLIHelpers.showAutoDetectionHelp();
            const helpText = mockConsoleLog.mock.calls[0][0];
            expect(helpText).toContain('/absolute/path');
            expect(helpText).toContain('./relative/path');
            expect(helpText).toContain('../parent/path');
            expect(helpText).toContain('file:///file/protocol/path');
            expect(helpText).toContain('C:\\Windows\\Path (Windows)');
        });
    });
    describe('validateConfigUrl', () => {
        let mockConfigManager;
        beforeEach(() => {
            mockConfigManager = new MockSourceConfigManager();
            mockConfigManager.parseSourceUrl = jest.fn();
        });
        it('should validate GitHub URL successfully', () => {
            const testUrl = 'https://github.com/microsoft/vscode';
            const mockResult = {
                type: 'github',
                owner: 'microsoft',
                repo: 'vscode',
                branch: 'main'
            };
            mockConfigManager.parseSourceUrl.mockReturnValue(mockResult);
            MockSourceConfigManager.mockImplementation(() => mockConfigManager);
            cli_helpers_1.CLIHelpers.validateConfigUrl(testUrl);
            expect(mockConfigManager.parseSourceUrl).toHaveBeenCalledWith(testUrl);
            expect(mockConsoleLog).toHaveBeenCalledWith(`✅ URL parsing successful: ${testUrl}`);
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
            mockConfigManager.parseSourceUrl.mockReturnValue(mockResult);
            MockSourceConfigManager.mockImplementation(() => mockConfigManager);
            cli_helpers_1.CLIHelpers.validateConfigUrl(testUrl);
            expect(mockConfigManager.parseSourceUrl).toHaveBeenCalledWith(testUrl);
            expect(mockConsoleLog).toHaveBeenCalledWith(`✅ URL parsing successful: ${testUrl}`);
            expect(mockConsoleLog).toHaveBeenCalledWith('   Type: local');
            expect(mockConsoleLog).toHaveBeenCalledWith('   Path: /Users/mac/my-project');
        });
        it('should handle parsing errors gracefully', () => {
            const testUrl = 'invalid-url';
            const errorMessage = 'Invalid URL format';
            mockConfigManager.parseSourceUrl.mockImplementation(() => {
                throw new Error(errorMessage);
            });
            MockSourceConfigManager.mockImplementation(() => mockConfigManager);
            cli_helpers_1.CLIHelpers.validateConfigUrl(testUrl);
            expect(mockConsoleError).toHaveBeenCalledWith(`❌ URL parsing error: ${testUrl}`);
            expect(mockConsoleError).toHaveBeenCalledWith(`   ${errorMessage}`);
        });
        it('should handle non-Error exceptions', () => {
            const testUrl = 'invalid-url';
            const errorMessage = 'String error';
            mockConfigManager.parseSourceUrl.mockImplementation(() => {
                throw errorMessage;
            });
            MockSourceConfigManager.mockImplementation(() => mockConfigManager);
            cli_helpers_1.CLIHelpers.validateConfigUrl(testUrl);
            expect(mockConsoleError).toHaveBeenCalledWith(`❌ URL parsing error: ${testUrl}`);
            expect(mockConsoleError).toHaveBeenCalledWith(`   ${errorMessage}`);
        });
        it('should handle unknown source types', () => {
            const testUrl = 'unknown://test';
            const mockResult = {
                type: 'unknown'
            };
            mockConfigManager.parseSourceUrl.mockReturnValue(mockResult);
            MockSourceConfigManager.mockImplementation(() => mockConfigManager);
            cli_helpers_1.CLIHelpers.validateConfigUrl(testUrl);
            expect(mockConsoleLog).toHaveBeenCalledWith(`✅ URL parsing successful: ${testUrl}`);
            expect(mockConsoleLog).toHaveBeenCalledWith('   Type: unknown');
            expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Owner:'));
            expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Path:'));
        });
    });
    describe('Static method availability', () => {
        it('should have all expected static methods', () => {
            expect(typeof cli_helpers_1.CLIHelpers.showConfigExamples).toBe('function');
            expect(typeof cli_helpers_1.CLIHelpers.showAutoDetectionHelp).toBe('function');
            expect(typeof cli_helpers_1.CLIHelpers.validateConfigUrl).toBe('function');
        });
        it('should not require instantiation', () => {
            expect(() => cli_helpers_1.CLIHelpers.showAutoDetectionHelp()).not.toThrow();
        });
    });
    describe('Error handling edge cases', () => {
        it('should handle constructor errors gracefully', () => {
            MockSourceConfigManager.mockImplementation(() => {
                throw new Error('Constructor failed');
            });
            cli_helpers_1.CLIHelpers.validateConfigUrl('test-url');
            expect(mockConsoleError).toHaveBeenCalledWith('❌ URL parsing error: test-url');
            expect(mockConsoleError).toHaveBeenCalledWith('   Constructor failed');
        });
        it('should handle null results from parseSourceUrl', () => {
            jest.resetAllMocks();
            const mockConfigManager = {
                parseSourceUrl: jest.fn().mockReturnValue({ type: 'unknown' })
            };
            MockSourceConfigManager.mockImplementation(() => mockConfigManager);
            expect(() => cli_helpers_1.CLIHelpers.validateConfigUrl('test-url')).not.toThrow();
        });
    });
});
describe('CLI Execution', () => {
    it('should export CLIHelpers class', () => {
        expect(cli_helpers_1.CLIHelpers).toBeDefined();
        expect(typeof cli_helpers_1.CLIHelpers).toBe('function');
    });
    it('should have expected method signatures', () => {
        expect(cli_helpers_1.CLIHelpers.showConfigExamples.length).toBe(0);
        expect(cli_helpers_1.CLIHelpers.showAutoDetectionHelp.length).toBe(0);
        expect(cli_helpers_1.CLIHelpers.validateConfigUrl.length).toBe(1);
    });
});
