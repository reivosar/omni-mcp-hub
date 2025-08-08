/**
 * Claude Code Stdio Server Tests
 * 
 * Simple smoke tests to ensure the module can be imported and basic functionality works
 */

describe('ClaudeCodeStdioServer', () => {
  it('should import without throwing', () => {
    expect(() => {
      const module = require('../../../src/servers/claude-code-stdio-server');
      expect(module.ClaudeCodeStdioServer).toBeDefined();
    }).not.toThrow();
  });
  
  it('should have expected exports', () => {
    const { ClaudeCodeStdioServer } = require('../../../src/servers/claude-code-stdio-server');
    expect(ClaudeCodeStdioServer).toBeDefined();
    expect(typeof ClaudeCodeStdioServer).toBe('function');
  });
});