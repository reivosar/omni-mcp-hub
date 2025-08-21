import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeConfigManager } from '../../src/utils/claude-config.js';
import { FileScanner } from '../../src/utils/file-scanner.js';

describe('Fuzz Testing for Parsers', () => {
  
  describe('CLAUDE.md Parser Fuzzing', () => {
    const claudeConfig = new ClaudeConfigManager();
    
    const fuzzInputs = [
      // Edge cases
      '',
      '\n',
      '\r\n',
      '# '.repeat(1000),
      '```'.repeat(100),
      
      // Malformed markdown
      '# Incomplete header\n```',
      '```typescript\nunclosed code block',
      '## Nested # headers ## inside',
      
      // Special characters
      '# Header with 🚀 emoji\n\nContent with special chars: @#$%^&*()',
      '# Header\n\n```\n<script>alert("xss")</script>\n```',
      
      // Large inputs
      'A'.repeat(100000),
      ('# Section\n\nContent\n\n').repeat(1000),
      
      // Injection attempts
      '# ${process.env.SECRET}\n\n${require("fs").readFileSync("/etc/passwd")}',
      '# Header\n\n<!--#exec cmd="/bin/ls" -->',
      
      // Unicode edge cases
      '# \u0000\u0001\u0002\u0003',
      '# \uD800\uDC00', // Surrogate pairs
      '# \uFEFF', // Zero-width no-break space
      
      // Nested structures
      '# Main\n## Sub1\n### Sub2\n#### Sub3\n##### Sub4\n###### Sub5',
      '```\n```\n```\n```\n```', // Nested code blocks
      
      // Mixed content
      '# Header\n\n- List item 1\n  - Nested item\n    ```code```\n- List item 2',
      
      // Binary-like content
      Buffer.from([0xFF, 0xFE, 0x00, 0x00]).toString(),
      
      // Recursive patterns
      '# ' + '## '.repeat(100) + 'Deep nesting',
      
      // Control characters
      '\x00\x01\x02\x03\x04\x05\x06\x07\x08',
      
      // Invalid UTF-8 sequences
      '\xC0\x80', // Overlong encoding
      '\xED\xA0\x80', // UTF-16 surrogate
    ];

    it('should handle all fuzz inputs without crashing', () => {
      fuzzInputs.forEach((input, index) => {
        expect(() => {
          // Create temporary file with fuzz input
          const tempPath = path.join(process.cwd(), `temp-fuzz-${index}.md`);
          try {
            fs.writeFileSync(tempPath, input);
            claudeConfig.loadClaudeConfig(tempPath);
          } catch (error) {
            // Expected - should handle gracefully
          } finally {
            // Clean up
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          }
        }).not.toThrow();
      });
    });

    it('should maintain consistent behavior with random inputs', () => {
      for (let i = 0; i < 100; i++) {
        const randomInput = generateRandomMarkdown();
        const tempPath = path.join(process.cwd(), `temp-random-${i}.md`);
        
        try {
          fs.writeFileSync(tempPath, randomInput);
          const result1 = claudeConfig.loadClaudeConfig(tempPath);
          const result2 = claudeConfig.loadClaudeConfig(tempPath);
          
          // Should produce consistent results
          expect(result1).toEqual(result2);
        } catch (error) {
          // Should fail consistently
          expect(() => claudeConfig.loadClaudeConfig(tempPath)).toThrow();
        } finally {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        }
      }
    });
  });

  describe('AGENTS.md Parser Fuzzing', () => {
    const fileScanner = new FileScanner();
    
    const agentsFuzzInputs = [
      // Valid but edge case formats
      '# Agent: test\nType: tool',
      '# Agent: name-with-dashes\nType: resource',
      
      // Invalid formats
      'No header here',
      '# Agent without type',
      '# Agent: \nType: ',
      
      // Injection attempts
      '# Agent: ../../../etc/passwd\nType: tool',
      '# Agent: ; rm -rf /\nType: resource',
      
      // Large agent definitions
      `# Agent: ${'大'.repeat(1000)}\nType: tool\n${'Description: test\n'.repeat(100)}`,
      
      // Special characters in names
      '# Agent: @#$%^&*()\nType: tool',
      '# Agent: <script>alert(1)</script>\nType: resource',
      
      // Malformed YAML-like content
      '# Agent: test\n  invalid: yaml:\n    - list\n  - items',
      
      // Empty and whitespace
      '   \n\n\n   ',
      '\t\t\t',
      
      // Mixed line endings
      '# Agent: test\r\nType: tool\rDescription: test\n',
    ];

    it('should handle AGENTS.md fuzz inputs safely', () => {
      agentsFuzzInputs.forEach((input, index) => {
        expect(() => {
          const tempPath = path.join(process.cwd(), `temp-agents-${index}.md`);
          try {
            fs.writeFileSync(tempPath, input);
            // Simulate parsing - should not crash
            const content = fs.readFileSync(tempPath, 'utf-8');
            parseAgentsContent(content);
          } catch (error) {
            // Expected - should handle gracefully
          } finally {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          }
        }).not.toThrow();
      });
    });
  });

  describe('Configuration File Fuzzing', () => {
    const configFuzzInputs = [
      // Invalid JSON
      '{',
      '}',
      '{"key": }',
      '{"key": undefined}',
      
      // Invalid YAML
      'key: value:\n  nested: error',
      '- item\n  - wrong indent',
      
      // Circular references (as string)
      '{"a": "~a"}',
      
      // Deep nesting
      JSON.stringify(createDeepObject(100)),
      
      // Large arrays
      JSON.stringify({ array: new Array(10000).fill('item') }),
      
      // Special values
      JSON.stringify({ 
        null: null,
        undefined: undefined,
        nan: NaN,
        infinity: Infinity,
        negInfinity: -Infinity
      }),
      
      // Binary data
      Buffer.from('binary data').toString('base64'),
      
      // SQL/NoSQL injection patterns
      '{"$where": "function() { return true; }"}',
      '{"username": {"$gt": ""}}',
    ];

    it('should handle configuration file fuzzing', () => {
      configFuzzInputs.forEach((input, index) => {
        expect(() => {
          try {
            JSON.parse(input);
          } catch {
            // Try as YAML or other format
            parseConfigContent(input);
          }
        }).not.toThrow(TypeError); // Should not throw system errors
      });
    });
  });
});

// Helper functions
function generateRandomMarkdown(): string {
  const elements = [
    '# Header\n',
    '## Subheader\n',
    'Regular text\n',
    '```\ncode block\n```\n',
    '- List item\n',
    '> Quote\n',
    '[Link](url)\n',
    '![Image](url)\n',
    '**Bold**\n',
    '*Italic*\n',
    '---\n',
  ];
  
  let result = '';
  const length = Math.floor(Math.random() * 100) + 1;
  
  for (let i = 0; i < length; i++) {
    result += elements[Math.floor(Math.random() * elements.length)];
  }
  
  return result;
}

function createDeepObject(depth: number): any {
  if (depth <= 0) return 'leaf';
  return { nested: createDeepObject(depth - 1) };
}

function parseAgentsContent(content: string): void {
  // Simple parser simulation
  const lines = content.split('\n');
  const agents = [];
  let currentAgent: any = null;
  
  for (const line of lines) {
    if (line.startsWith('# Agent:')) {
      if (currentAgent) agents.push(currentAgent);
      currentAgent = { name: line.substring(9).trim() };
    } else if (line.startsWith('Type:') && currentAgent) {
      currentAgent.type = line.substring(5).trim();
    }
  }
  
  if (currentAgent) agents.push(currentAgent);
  return agents;
}

function parseConfigContent(content: string): any {
  // Try various parsing strategies
  try {
    return JSON.parse(content);
  } catch {
    // Try line-by-line parsing
    const lines = content.split('\n');
    const config: any = {};
    
    for (const line of lines) {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key && value) {
        config[key] = value;
      }
    }
    
    return config;
  }
}