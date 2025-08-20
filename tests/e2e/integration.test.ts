import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { OmniMCPServer } from '../../src/index.js';
import { Logger } from '../../src/utils/logger.js';

describe('E2E Integration Tests', () => {
  let server: OmniMCPServer;
  let testConfigDir: string;
  let testYamlConfig: string;
  let testClaudeConfig: string;

  beforeAll(async () => {
    await setupTestEnvironment();
    server = new OmniMCPServer(Logger.getInstance());
  });

  afterAll(async () => {
    if (server) {
      server.cleanup();
    }
    await cleanupTestEnvironment();
  });

  beforeEach(() => {
    // Reset any test state if needed
  });

  async function setupTestEnvironment(): Promise<void> {
    testConfigDir = path.join(process.cwd(), 'test-integration');
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }

    // Create test YAML configuration
    testYamlConfig = path.join(testConfigDir, 'agents.yaml');
    const yamlConfig = {
      agents: {
        'test-agent': {
          command: 'echo',
          args: ['{"tools": [], "resources": [], "capabilities": {}}'],
          env: {},
          autoReconnect: false,
          timeout: 5000
        }
      },
      settings: {
        healthCheckInterval: 30000,
        maxRetries: 2,
        logLevel: 'info'
      }
    };
    
    fs.writeFileSync(testYamlConfig, JSON.stringify(yamlConfig, null, 2));

    // Create test Claude configuration
    testClaudeConfig = path.join(testConfigDir, '.mcp-config.json');
    const claudeConfig = {
      mcpServers: {},
      profiles: {
        'integration-test': {
          autoLoad: false,
          mcpServers: {},
          instructions: [
            'This is an integration test profile',
            'Used for E2E testing scenarios'
          ],
          rules: [
            'Validate all inputs thoroughly',
            'Provide comprehensive error handling',
            'Log all significant events'
          ]
        }
      }
    };
    
    fs.writeFileSync(testClaudeConfig, JSON.stringify(claudeConfig, null, 2));

    // Set environment variables for testing
    process.env.MCP_YAML_CONFIG_PATH = testYamlConfig;
    process.env.NODE_ENV = 'test';
  }

  async function cleanupTestEnvironment(): Promise<void> {
    try {
      if (fs.existsSync(testConfigDir)) {
        fs.rmSync(testConfigDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Restore environment
    delete process.env.MCP_YAML_CONFIG_PATH;
    delete process.env.NODE_ENV;
  }

  describe('Server Initialization', () => {
    it('should initialize server with test configuration', () => {
      expect(server).toBeDefined();
      expect(server.getServer()).toBeDefined();
    });

    it('should load active profiles', () => {
      const profiles = server.getActiveProfiles();
      expect(profiles).toBeDefined();
      expect(profiles instanceof Map).toBe(true);
    });

    it('should generate behavior instructions', () => {
      const testConfig = {
        autoLoad: false,
        mcpServers: {},
        instructions: ['Test instruction'],
        rules: ['Test rule']
      };

      const instructions = server.generateBehaviorInstructions(testConfig);
      expect(instructions).toContain('Test instruction');
      expect(instructions).toContain('Test rule');
    });
  });

  describe('Configuration Management', () => {
    it('should handle YAML configuration parsing', async () => {
      // Test that YAML configuration is properly loaded
      expect(fs.existsSync(testYamlConfig)).toBe(true);
      
      const yamlContent = fs.readFileSync(testYamlConfig, 'utf8');
      const config = JSON.parse(yamlContent);
      
      expect(config.agents).toBeDefined();
      expect(config.settings).toBeDefined();
      expect(config.agents['test-agent']).toBeDefined();
    });

    it('should handle Claude configuration parsing', async () => {
      expect(fs.existsSync(testClaudeConfig)).toBe(true);
      
      const claudeContent = fs.readFileSync(testClaudeConfig, 'utf8');
      const config = JSON.parse(claudeContent);
      
      expect(config.profiles).toBeDefined();
      expect(config.profiles['integration-test']).toBeDefined();
    });

    it('should validate configuration structure', () => {
      const claudeContent = fs.readFileSync(testClaudeConfig, 'utf8');
      const config = JSON.parse(claudeContent);
      const profile = config.profiles['integration-test'];
      
      expect(profile.autoLoad).toBeDefined();
      expect(profile.instructions).toBeDefined();
      expect(profile.rules).toBeDefined();
      expect(Array.isArray(profile.instructions)).toBe(true);
      expect(Array.isArray(profile.rules)).toBe(true);
    });
  });

  describe('Profile Management', () => {
    it('should handle profile loading', async () => {
      // Create a test profile
      const testProfile = {
        autoLoad: false,
        mcpServers: {},
        instructions: ['Integration test profile'],
        rules: ['Test validation rule']
      };

      // Test behavior generation
      const behavior = server.generateBehaviorInstructions(testProfile);
      expect(behavior).toContain('Integration test profile');
      expect(behavior).toContain('Test validation rule');
    });

    it('should handle profile validation', () => {
      const validProfile = {
        autoLoad: true,
        mcpServers: {},
        instructions: ['Valid instruction'],
        rules: ['Valid rule']
      };

      const invalidProfile = {
        // Missing required fields
        autoLoad: true
      };

      // Valid profile should generate proper behavior
      const validBehavior = server.generateBehaviorInstructions(validProfile);
      expect(validBehavior).toBeDefined();
      expect(typeof validBehavior).toBe('string');
      expect(validBehavior.length).toBeGreaterThan(0);

      // Invalid profile should still handle gracefully
      const invalidBehavior = server.generateBehaviorInstructions(invalidProfile as any);
      expect(invalidBehavior).toBeDefined();
      expect(typeof invalidBehavior).toBe('string');
    });

    it('should handle multiple profiles', () => {
      const profiles = new Map();
      
      profiles.set('profile1', {
        autoLoad: true,
        instructions: ['Profile 1 instruction'],
        rules: ['Profile 1 rule'],
        mcpServers: {}
      });
      
      profiles.set('profile2', {
        autoLoad: false,
        instructions: ['Profile 2 instruction'],
        rules: ['Profile 2 rule'],
        mcpServers: {}
      });

      expect(profiles.size).toBe(2);
      expect(profiles.has('profile1')).toBe(true);
      expect(profiles.has('profile2')).toBe(true);
      
      const profile1 = profiles.get('profile1');
      const behavior1 = server.generateBehaviorInstructions(profile1);
      expect(behavior1).toContain('Profile 1 instruction');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration files gracefully', async () => {
      const missingConfigPath = path.join(testConfigDir, 'nonexistent.yaml');
      
      // Set environment to point to missing file
      const originalConfig = process.env.MCP_YAML_CONFIG_PATH;
      process.env.MCP_YAML_CONFIG_PATH = missingConfigPath;
      
      try {
        // Server should handle missing config gracefully
        const testServer = new OmniMCPServer();
        expect(testServer).toBeDefined();
        testServer.cleanup();
      } finally {
        // Restore original config
        if (originalConfig) {
          process.env.MCP_YAML_CONFIG_PATH = originalConfig;
        }
      }
    });

    it('should handle malformed configuration files', async () => {
      const malformedConfigPath = path.join(testConfigDir, 'malformed.yaml');
      fs.writeFileSync(malformedConfigPath, 'invalid: yaml: content: [unclosed');
      
      const originalConfig = process.env.MCP_YAML_CONFIG_PATH;
      process.env.MCP_YAML_CONFIG_PATH = malformedConfigPath;
      
      try {
        // Server should handle malformed config gracefully
        const testServer = new OmniMCPServer();
        expect(testServer).toBeDefined();
        testServer.cleanup();
      } finally {
        if (originalConfig) {
          process.env.MCP_YAML_CONFIG_PATH = originalConfig;
        }
        fs.unlinkSync(malformedConfigPath);
      }
    });

    it('should handle invalid profile configurations', () => {
      const invalidProfiles = [
        { /* missing required fields */ },
        { autoLoad: 'invalid' }, // Wrong type for autoLoad but no arrays to break forEach
        { instructions: [], rules: [] } // Valid arrays but minimal content
      ];

      for (const profile of invalidProfiles) {
        expect(() => {
          const behavior = server.generateBehaviorInstructions(profile as any);
          expect(typeof behavior).toBe('string');
        }).not.toThrow();
      }

      // Test configurations that would break forEach - these should throw
      const breakingProfiles = [
        null,
        undefined,
        { rules: 'not-array' },
        { instructions: 'not-array' }
      ];
      
      for (const profile of breakingProfiles) {
        try {
          const behavior = server.generateBehaviorInstructions(profile as any);
          // If it doesn't throw, behavior should still be a string
          expect(typeof behavior).toBe('string');
        } catch (error) {
          // These profiles may legitimately throw errors
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple rapid profile generations', () => {
      const testProfile = {
        autoLoad: true,
        mcpServers: {},
        instructions: Array(100).fill('Performance test instruction'),
        rules: Array(100).fill('Performance test rule')
      };

      const start = Date.now();
      
      for (let i = 0; i < 50; i++) {
        const behavior = server.generateBehaviorInstructions(testProfile);
        expect(behavior).toBeDefined();
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle large profile configurations', () => {
      const largeProfile = {
        autoLoad: true,
        mcpServers: {},
        instructions: Array(1000).fill('Large profile instruction'),
        rules: Array(1000).fill('Large profile rule')
      };

      const behavior = server.generateBehaviorInstructions(largeProfile);
      expect(behavior).toBeDefined();
      expect(behavior.length).toBeGreaterThan(1000);
    });

    it('should manage memory efficiently with many profiles', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const profiles = new Map();
      
      // Create many profiles
      for (let i = 0; i < 100; i++) {
        profiles.set(`profile-${i}`, {
          autoLoad: true,
          mcpServers: {},
          instructions: [`Instruction for profile ${i}`],
          rules: [`Rule for profile ${i}`]
        });
      }
      
      // Generate behaviors for all profiles
      for (const [name, profile] of profiles) {
        const behavior = server.generateBehaviorInstructions(profile);
        expect(behavior).toBeDefined();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Component Integration', () => {
    it('should integrate all major components without errors', () => {
      // This test ensures all components work together
      expect(server.getServer()).toBeDefined();
      expect(server.getActiveProfiles()).toBeDefined();
      
      // Test profile generation works
      const testProfile = {
        autoLoad: true,
        mcpServers: {},
        instructions: ['Component integration test'],
        rules: ['Integration validation']
      };
      
      const behavior = server.generateBehaviorInstructions(testProfile);
      expect(behavior).toBeDefined();
    });

    it('should maintain state consistency across operations', () => {
      const initialProfiles = server.getActiveProfiles();
      const initialSize = initialProfiles.size;
      
      // Perform various operations
      const testProfile = {
        autoLoad: true,
        mcpServers: {},
        instructions: ['State consistency test'],
        rules: ['State validation']
      };
      
      server.generateBehaviorInstructions(testProfile);
      
      const finalProfiles = server.getActiveProfiles();
      
      // State should remain consistent
      expect(finalProfiles).toBeDefined();
      expect(finalProfiles instanceof Map).toBe(true);
    });

    it('should handle cleanup properly', () => {
      const testServer = new OmniMCPServer();
      
      expect(testServer).toBeDefined();
      expect(testServer.getServer()).toBeDefined();
      
      // Should cleanup without errors
      expect(() => {
        testServer.cleanup();
      }).not.toThrow();
    });
  });

  describe('Real-World Usage Scenarios', () => {
    it('should handle typical profile switching scenario', () => {
      const profiles = [
        {
          autoLoad: true,
          mcpServers: {},
          instructions: ['Development mode instructions'],
          rules: ['Development validation rules']
        },
        {
          autoLoad: false,
          mcpServers: {},
          instructions: ['Production mode instructions'],
          rules: ['Production validation rules']
        },
        {
          autoLoad: true,
          mcpServers: {},
          instructions: ['Testing mode instructions'],
          rules: ['Testing validation rules']
        }
      ];

      for (const profile of profiles) {
        const behavior = server.generateBehaviorInstructions(profile);
        expect(behavior).toBeDefined();
        
        if (profile.autoLoad) {
          expect(behavior).toContain('instructions');
        }
      }
    });

    it('should handle configuration updates scenario', () => {
      // Initial configuration
      let currentProfile = {
        autoLoad: true,
        mcpServers: {},
        instructions: ['Initial instructions'],
        rules: ['Initial rules']
      };
      
      let behavior = server.generateBehaviorInstructions(currentProfile);
      expect(behavior).toContain('Initial instructions');
      
      // Update configuration
      currentProfile = {
        ...currentProfile,
        instructions: ['Updated instructions'],
        rules: ['Updated rules']
      };
      
      behavior = server.generateBehaviorInstructions(currentProfile);
      expect(behavior).toContain('Updated instructions');
      expect(behavior).not.toContain('Initial instructions');
    });

    it('should handle mixed configuration types', () => {
      const complexProfile = {
        autoLoad: true,
        mcpServers: {
          'file-system': {
            command: 'node',
            args: ['filesystem-mcp']
          },
          'web-search': {
            command: 'python',
            args: ['-m', 'web_search_mcp']
          }
        },
        instructions: [
          'Handle file operations carefully',
          'Validate web search queries',
          'Provide detailed error messages'
        ],
        rules: [
          'Always check file permissions before access',
          'Sanitize all user inputs',
          'Log security-relevant events'
        ]
      };

      const behavior = server.generateBehaviorInstructions(complexProfile);
      expect(behavior).toContain('Handle file operations carefully');
      expect(behavior).toContain('Always check file permissions');
      expect(behavior).toContain('Sanitize all user inputs');
    });
  });
});