import { 
  SourceConfigManager, 
  GitHubSourceConfig, 
  LocalSourceConfig, 
  MCPServerConfig,
  Config 
} from '../../src/config/source-config-manager';
import path from 'path';
import fs from 'fs';
import * as yaml from 'js-yaml';

describe('Examples Validation', () => {
  const examplesDir = path.join(__dirname, '../../examples');

  beforeAll(() => {
    // Ensure examples directory exists
    expect(fs.existsSync(examplesDir)).toBe(true);
  });

  // Helper function to read raw YAML content
  const readRawYaml = (filePath: string): any => {
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.load(content);
  };

  // Helper function to validate port range
  const isValidPort = (port: number): boolean => {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  };

  // Helper function to validate URL format
  const isValidGitHubUrl = (url: string): boolean => {
    return /^github:[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+(@[a-zA-Z0-9_.-]+)?$/.test(url);
  };

  describe('GitHub Sources Example', () => {
    const configPath = path.join(examplesDir, 'github_sources/mcp-sources.yaml');

    test('should exist and be valid YAML', () => {
      expect(fs.existsSync(configPath)).toBe(true);
      
      // Test YAML parsing
      expect(() => readRawYaml(configPath)).not.toThrow();
    });

    test('should preserve environment variable format in raw YAML', () => {
      const rawContent = fs.readFileSync(configPath, 'utf8');
      
      // Check that environment variables are in the correct format
      expect(rawContent).toContain('${GITHUB_TOKEN}');
      expect(rawContent).toContain('${PORT:-3000}');
      
      // Check YAML structure
      const rawYaml = readRawYaml(configPath);
      expect(rawYaml.github_sources).toBeDefined();
      expect(Array.isArray(rawYaml.github_sources)).toBe(true);
    });

    test('should load and validate configuration with proper types', () => {
      const manager = new SourceConfigManager();
      const config: Config = manager.load(configPath);
      
      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.server.port).toBeDefined();
      
      // Validate port range
      if (typeof config.server.port === 'number') {
        expect(isValidPort(config.server.port)).toBe(true);
      }
      
      expect(config.github_sources).toBeDefined();
      expect(config.github_sources!.length).toBeGreaterThan(0);
      
      // Validate github_sources structure with proper typing
      config.github_sources!.forEach((source: GitHubSourceConfig) => {
        expect(source.url).toBeDefined();
        expect(isValidGitHubUrl(source.url)).toBe(true);
        
        // Token should be defined (even if empty due to env var expansion)
        expect('token' in source).toBe(true);
        
        // Optional fields validation
        if (source.branch) {
          expect(typeof source.branch).toBe('string');
        }
      });

      // Should not have mcp_servers in github_sources example
      expect(config.mcp_servers).toBeUndefined();
      // Should not have local_sources in github_sources example  
      expect(config.local_sources).toBeUndefined();
    });

    test('should have proper file patterns', () => {
      const manager = new SourceConfigManager();
      const config: Config = manager.load(configPath);
      
      expect(config.files).toBeDefined();
      expect(config.files.patterns).toBeDefined();
      expect(Array.isArray(config.files.patterns)).toBe(true);
      expect(config.files.patterns.length).toBeGreaterThan(0);
      
      // Validate essential patterns
      const patterns = config.files.patterns;
      expect(patterns).toContain('README.md');
      expect(patterns).toContain('*.md');
      expect(patterns).toContain('docs/**/*.md');
      expect(patterns).toContain('CLAUDE.md');
      
      // Validate max_size
      expect(config.files.max_size).toBeDefined();
      expect(config.files.max_size).toBeGreaterThan(0);
      expect(config.files.max_size).toBeLessThanOrEqual(10 * 1024 * 1024); // Max 10MB
    });

    test('should have valid fetch configuration', () => {
      const config: Config = new SourceConfigManager().load(configPath);
      
      expect(config.fetch).toBeDefined();
      expect(config.fetch.timeout).toBeGreaterThan(0);
      expect(config.fetch.timeout).toBeLessThanOrEqual(300000); // Max 5 minutes
      expect(config.fetch.retries).toBeGreaterThanOrEqual(0);
      expect(config.fetch.retries).toBeLessThanOrEqual(10);
      expect(config.fetch.retry_delay).toBeGreaterThan(0);
      expect(config.fetch.max_depth).toBeGreaterThan(0);
      expect(config.fetch.max_depth).toBeLessThanOrEqual(10);
    });
  });

  describe('Local Sources Example', () => {
    const configPath = path.join(examplesDir, 'local_sources/mcp-sources.yaml');

    test('should exist and be valid YAML', () => {
      expect(fs.existsSync(configPath)).toBe(true);
      expect(() => readRawYaml(configPath)).not.toThrow();
    });

    test('should preserve environment variable paths in raw YAML', () => {
      const rawContent = fs.readFileSync(configPath, 'utf8');
      
      expect(rawContent).toContain('${PROJECTS_PATH:-/home/user/projects}');
      expect(rawContent).toContain('${DOCS_PATH:-/usr/local/docs}');
      expect(rawContent).toContain('${WORKSPACE_PATH:-/workspace}');
    });

    test('should load and validate configuration with proper types', () => {
      const manager = new SourceConfigManager();
      const config: Config = manager.load(configPath);
      
      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.local_sources).toBeDefined();
      expect(config.local_sources!.length).toBeGreaterThan(0);
      
      // Validate local_sources structure with proper typing
      config.local_sources!.forEach((source: LocalSourceConfig) => {
        expect(source.url).toBeDefined();
        expect(typeof source.url).toBe('string');
        
        // Validate path format
        if (source.url.startsWith('/') || source.url === './') {
          expect(source.url).toMatch(/^(\.\/|\/[\w\-\/]*)/);
        }
      });

      // Should not have other source types
      expect(config.mcp_servers).toBeUndefined();
      expect(config.github_sources).toBeUndefined();
    });

    test('should have comprehensive file patterns', () => {
      const manager = new SourceConfigManager();
      const config: Config = manager.load(configPath);
      
      const expectedPatterns = [
        'CLAUDE.md',
        'README.md',
        '*.md',
        'docs/**/*.md',
        '**/*.txt',
        'CHANGELOG.md',
        'CONTRIBUTING.md'
      ];
      
      expectedPatterns.forEach(pattern => {
        expect(config.files.patterns).toContain(pattern);
      });
      
      // Validate file size limit
      expect(config.files.max_size).toBe(1048576); // 1MB
    });
  });

  describe('MCP Servers Example', () => {
    const configPath = path.join(examplesDir, 'mcp_servers/mcp-sources.yaml');

    test('should exist and be valid YAML', () => {
      expect(fs.existsSync(configPath)).toBe(true);
      expect(() => readRawYaml(configPath)).not.toThrow();
    });

    test('should preserve environment variables in raw YAML', () => {
      const rawContent = fs.readFileSync(configPath, 'utf8');
      
      expect(rawContent).toContain('${ARXIV_API_KEY}');
      expect(rawContent).toContain('${ALLOWED_PATHS:-/tmp}');
      expect(rawContent).toContain('${DATABASE_PATH:-./data.db}');
      expect(rawContent).toContain('${GIT_USER_NAME:-"Claude"}');
      expect(rawContent).toContain('${GIT_USER_EMAIL:-"claude@anthropic.com"}');
    });

    test('should load and validate configuration with proper types', () => {
      const manager = new SourceConfigManager();
      const config: Config = manager.load(configPath);
      
      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.mcp_servers).toBeDefined();
      expect(config.mcp_servers!.length).toBeGreaterThan(0);
      
      // Should not have documentation sources
      expect(config.github_sources).toBeUndefined();
      expect(config.local_sources).toBeUndefined();
    });

    test('should have all required MCP servers with proper configuration', () => {
      const manager = new SourceConfigManager();
      const config: Config = manager.load(configPath);
      
      const requiredServers = ['arxiv', 'filesystem', 'browser', 'sqlite', 'git', 'time'];
      const serverNames = config.mcp_servers!.map((s: MCPServerConfig) => s.name);
      
      requiredServers.forEach(name => {
        expect(serverNames).toContain(name);
      });
      
      // Validate each server configuration
      config.mcp_servers!.forEach((server: MCPServerConfig) => {
        expect(server.name).toBeTruthy();
        expect(server.install_command).toBeTruthy();
        expect(server.command).toBeTruthy();
        expect(server.enabled).toBe(true);
        
        // Validate install commands format
        if (server.install_command) {
          if (server.install_command.startsWith('pip')) {
            expect(server.install_command).toMatch(/^pip install [\w-]+$/);
          } else if (server.install_command.startsWith('npm')) {
            expect(server.install_command).toMatch(/^npm install -g @?[\w\/-]+$/);
          } else if (server.install_command.startsWith('uvx')) {
            expect(server.install_command).toMatch(/^uvx install [\w-]+$/);
          }
        }
        
        // Validate args if present
        if (server.args) {
          expect(Array.isArray(server.args)).toBe(true);
          expect(server.args.length).toBeGreaterThan(0);
        }
        
        // Validate env if present
        if (server.env) {
          expect(typeof server.env).toBe('object');
        }
      });
    });

    test('should have proper security configuration', () => {
      const manager = new SourceConfigManager();
      const config: Config = manager.load(configPath);
      
      expect(config.security).toBeDefined();
      expect(config.security!.content_validation).toBeDefined();
      expect(config.security!.content_validation!.enabled).toBe(true);
      
      // Validate reject patterns
      const rejectPatterns = config.security!.content_validation!.reject_patterns;
      expect(rejectPatterns).toBeDefined();
      expect(Array.isArray(rejectPatterns)).toBe(true);
      expect(rejectPatterns!.length).toBeGreaterThan(0);
      
      // Check for essential security patterns
      const patterns = rejectPatterns!.join(' ');
      expect(patterns).toContain('password');
      expect(patterns).toContain('api[_-]?key');
      expect(patterns).toContain('secret');
      expect(patterns).toContain('token');
      
      // Validate additional keywords
      const keywords = config.security!.content_validation!.additional_keywords;
      expect(keywords).toBeDefined();
      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords).toContain('malicious');
      expect(keywords).toContain('exploit');
      
      // Validate max file size
      expect(config.security!.content_validation!.max_file_size).toBeDefined();
      expect(config.security!.content_validation!.max_file_size).toBeGreaterThan(0);
    });
  });

  describe('Complete Configuration Example', () => {
    const configPath = path.join(examplesDir, 'mcp-sources.example.yaml');

    test('should exist and be valid YAML', () => {
      expect(fs.existsSync(configPath)).toBe(true);
      expect(() => readRawYaml(configPath)).not.toThrow();
    });

    test('should load and validate configuration', () => {
      const manager = new SourceConfigManager();
      const config: Config = manager.load(configPath);
      
      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      
      // Validate port
      if (typeof config.server.port === 'number') {
        expect(isValidPort(config.server.port)).toBe(true);
      }
    });

    test('should include all configuration sections', () => {
      const manager = new SourceConfigManager();
      const config: Config = manager.load(configPath);
      
      // Should have at least one source type
      const hasGithubSources = config.github_sources && config.github_sources.length > 0;
      const hasLocalSources = config.local_sources && config.local_sources.length > 0;
      const hasMcpServers = config.mcp_servers && config.mcp_servers.length > 0;
      
      expect(hasGithubSources || hasLocalSources || hasMcpServers).toBe(true);
      
      // Should have required configuration sections
      expect(config.files).toBeDefined();
      expect(config.files.patterns).toBeDefined();
      expect(config.files.max_size).toBeDefined();
      
      expect(config.fetch).toBeDefined();
      expect(config.fetch.timeout).toBeDefined();
      expect(config.fetch.retries).toBeDefined();
      expect(config.fetch.retry_delay).toBeDefined();
      expect(config.fetch.max_depth).toBeDefined();
    });
  });

  describe('Error Cases', () => {
    test('should handle non-existent configuration file', () => {
      const manager = new SourceConfigManager();
      const nonExistentPath = path.join(examplesDir, 'non-existent.yaml');
      
      // SourceConfigManager returns default config for non-existent files
      const config = manager.load(nonExistentPath);
      expect(config).toBeDefined();
      
      // Should have default empty arrays for sources
      expect(config.github_sources).toEqual([]);
      expect(config.local_sources).toEqual([]);
      expect(config.mcp_servers).toEqual([]);
    });

    test('should handle invalid YAML syntax', () => {
      const invalidYamlPath = path.join(examplesDir, 'test-invalid.yaml');
      
      // Create temporary invalid YAML file
      fs.writeFileSync(invalidYamlPath, 'invalid:\n  - item1\n item2'); // Invalid indentation
      
      try {
        expect(() => readRawYaml(invalidYamlPath)).toThrow();
        
        const manager = new SourceConfigManager();
        expect(() => manager.load(invalidYamlPath)).toThrow();
      } finally {
        // Clean up
        if (fs.existsSync(invalidYamlPath)) {
          fs.unlinkSync(invalidYamlPath);
        }
      }
    });

    test('should handle missing required fields', () => {
      const incompletePath = path.join(examplesDir, 'test-incomplete.yaml');
      
      // Create configuration without required fields
      fs.writeFileSync(incompletePath, yaml.dump({
        // Missing server section
        files: {
          patterns: ['*.md']
        }
      }));
      
      try {
        const manager = new SourceConfigManager();
        const config = manager.load(incompletePath);
        
        // Should still load but with undefined sections
        expect(config).toBeDefined();
        expect(config.server).toBeUndefined();
      } finally {
        // Clean up
        if (fs.existsSync(incompletePath)) {
          fs.unlinkSync(incompletePath);
        }
      }
    });

    test('should handle invalid port values', () => {
      const invalidPortPath = path.join(examplesDir, 'test-invalid-port.yaml');
      
      // Test negative port
      fs.writeFileSync(invalidPortPath, yaml.dump({
        server: { port: -1 },
        files: { patterns: ['*.md'], max_size: 1048576 }
      }));
      
      try {
        const manager = new SourceConfigManager();
        const config = manager.load(invalidPortPath);
        
        // Configuration loads, but port is invalid
        expect(config.server.port).toBe(-1);
        expect(isValidPort(config.server.port)).toBe(false);
      } finally {
        if (fs.existsSync(invalidPortPath)) {
          fs.unlinkSync(invalidPortPath);
        }
      }
      
      // Test port > 65535
      fs.writeFileSync(invalidPortPath, yaml.dump({
        server: { port: 70000 },
        files: { patterns: ['*.md'], max_size: 1048576 }
      }));
      
      try {
        const manager = new SourceConfigManager();
        const config = manager.load(invalidPortPath);
        
        expect(config.server.port).toBe(70000);
        expect(isValidPort(config.server.port)).toBe(false);
      } finally {
        if (fs.existsSync(invalidPortPath)) {
          fs.unlinkSync(invalidPortPath);
        }
      }
    });
  });

  describe('README Files', () => {
    test('github_sources should have README with required content', () => {
      const readmePath = path.join(examplesDir, 'github_sources/README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      
      const content = fs.readFileSync(readmePath, 'utf8');
      expect(content).toContain('GitHub Sources Example');
      expect(content).toContain('GITHUB_TOKEN');
      expect(content).toContain('Environment Variables');
      expect(content).toContain('Usage');
    });

    test('local_sources should have README with required content', () => {
      const readmePath = path.join(examplesDir, 'local_sources/README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      
      const content = fs.readFileSync(readmePath, 'utf8');
      expect(content).toContain('Local Sources Example');
      expect(content).toContain('PROJECTS_PATH');
      expect(content).toContain('DOCS_PATH');
      expect(content).toContain('WORKSPACE_PATH');
      expect(content).toContain('File Patterns');
    });

    test('mcp_servers should have README with required content', () => {
      const readmePath = path.join(examplesDir, 'mcp_servers/README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      
      const content = fs.readFileSync(readmePath, 'utf8');
      expect(content).toContain('MCP Servers Example');
      expect(content).toContain('Auto-Installation');
      expect(content).toContain('Tool Naming');
      expect(content).toContain('Environment Variables');
      expect(content).toContain('Security');
    });

    test('main examples README should be comprehensive', () => {
      const readmePath = path.join(examplesDir, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      
      const content = fs.readFileSync(readmePath, 'utf8');
      expect(content).toContain('Omni MCP Hub Examples');
      expect(content).toContain('GitHub Sources');
      expect(content).toContain('Local Sources');
      expect(content).toContain('MCP Servers');
      expect(content).toContain('Quick Start');
      expect(content).toContain('Available Examples');
    });
  });
});