import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ResourceHandlers } from "../src/resources/handlers.js";
import { ClaudeConfig } from "../src/utils/claude-config.js";
import { FileScanner } from "../src/utils/file-scanner.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Mock FileScanner
vi.mock('../src/utils/file-scanner.js');
vi.mock('../src/config/yaml-config.js');

// Mock Server class to capture setRequestHandler calls
class MockServer {
  requestHandlers = new Map();
  
  setRequestHandler(schema: any, handler: any) {
    // Use a known method name instead of schema.method which might be undefined
    const methodName = schema === ListResourcesRequestSchema ? 'resources/list' : 'resources/read';
    this.requestHandlers.set(methodName, handler);
  }
}

describe('ResourceHandlers', () => {
  let server: any; // Use MockServer instead of real Server
  let activeProfiles: Map<string, ClaudeConfig>;
  let resourceHandlers: ResourceHandlers;
  let mockFileScanner: any;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new MockServer();
    
    activeProfiles = new Map();
    resourceHandlers = new ResourceHandlers(server as any, activeProfiles);
    
    // Setup mock FileScanner
    mockFileScanner = {
      scanForClaudeFiles: vi.fn()
    };
    (resourceHandlers as any).fileScanner = mockFileScanner;
    
    // Setup handlers
    resourceHandlers.setupHandlers();
  });

  describe('Setup', () => {
    it('should setup handlers without errors', () => {
      const setupSpy = vi.spyOn(server, 'setRequestHandler');
      const newResourceHandlers = new ResourceHandlers(server, activeProfiles);
      
      expect(() => newResourceHandlers.setupHandlers()).not.toThrow();
      
      // Verify that setRequestHandler was called for both list and read resources
      expect(setupSpy).toHaveBeenCalledTimes(2);
    });

    it('should have FileScanner instance', () => {
      expect((resourceHandlers as any).fileScanner).toBeDefined();
    });
  });

  describe('List Resources Handler', () => {
    it('should return base resources when no active profiles', async () => {
      // Get the list resources handler
      const handler = server.requestHandlers.get('resources/list');
      expect(handler).toBeDefined();
      
      const result = await handler!({} as any);
      
      expect(result.resources.length).toBeGreaterThanOrEqual(4);
      expect(result.resources).toEqual(expect.arrayContaining([
        {
          uri: "config://files/scannable",
          name: "Scannable Config Files",
          description: "All configuration files that can be loaded (not yet active)",
          mimeType: "application/json",
        },
        {
          uri: "config://profiles/active",
          name: "Active Profiles List",
          description: "List of currently loaded/active profile names",
          mimeType: "application/json",
        },
        {
          uri: "engineering-guide://files",
          name: "📚 Engineering Guide - All Files",
          description: "All markdown files from Claude Code Engineering Guide",
          mimeType: "application/json",
        },
        {
          uri: "engineering-guide://combined", 
          name: "📘 Engineering Guide - Combined",
          description: "Combined content from all engineering guide files",
          mimeType: "text/markdown",
        },
      ]));
    });

    it('should return base resources plus profile resources when profiles exist', async () => {
      // Add active profiles
      activeProfiles.set('profile1', { title: 'Profile 1' } as ClaudeConfig);
      activeProfiles.set('profile2', { title: 'Profile 2' } as ClaudeConfig);
      
      const handler = server.requestHandlers.get('resources/list');
      const result = await handler!({} as any);
      
      expect(result.resources.length).toBeGreaterThanOrEqual(6); // 4+ base + 2 profiles
      expect(result.resources).toEqual(expect.arrayContaining([
        {
          uri: "config://profile/active/profile1",
          name: "Active: profile1",
          description: "Configuration details for active profile 'profile1'",
          mimeType: "application/json",
        },
        {
          uri: "config://profile/active/profile2",
          name: "Active: profile2", 
          description: "Configuration details for active profile 'profile2'",
          mimeType: "application/json",
        },
      ]));
    });
  });

  describe('Read Resources Handler', () => {
    describe('config://files/scannable', () => {
      it('should return scannable files successfully', async () => {
        const mockFiles = [
          { path: '/test/file1.md', isClaudeConfig: true, matchedPattern: 'CLAUDE.md' },
          { path: '/test/file2.md', isClaudeConfig: false, matchedPattern: undefined }
        ];
        mockFileScanner.scanForClaudeFiles.mockResolvedValue(mockFiles);
        
        const handler = server.requestHandlers.get('resources/read');
        const result = await handler!({ params: { uri: 'config://files/scannable' } } as any);
        
        expect(mockFileScanner.scanForClaudeFiles).toHaveBeenCalled();
        expect(result).toEqual({
          contents: [
            {
              uri: 'config://files/scannable',
              mimeType: 'application/json',
              text: JSON.stringify({
                totalFiles: 2,
                files: [
                  { path: '/test/file1.md', isClaudeConfig: true, matchedPattern: 'CLAUDE.md' },
                  { path: '/test/file2.md', isClaudeConfig: false, matchedPattern: undefined }
                ]
              }, null, 2)
            }
          ]
        });
      });

      it('should handle file scanning errors', async () => {
        mockFileScanner.scanForClaudeFiles.mockRejectedValue(new Error('Scan failed'));
        
        const handler = server.requestHandlers.get('resources/read');
        const result = await handler!({ params: { uri: 'config://files/scannable' } } as any);
        
        expect(result).toEqual({
          contents: [
            {
              uri: 'config://files/scannable',
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'Failed to scan files: Error: Scan failed' }, null, 2)
            }
          ]
        });
      });
    });

    describe('config://profiles/active', () => {
      it('should return empty active profiles list', async () => {
        const handler = server.requestHandlers.get('resources/read');
        const result = await handler!({ params: { uri: 'config://profiles/active' } } as any);
        
        expect(result).toEqual({
          contents: [
            {
              uri: 'config://profiles/active',
              mimeType: 'application/json',
              text: JSON.stringify({
                totalActiveProfiles: 0,
                activeProfiles: []
              }, null, 2)
            }
          ]
        });
      });

      it('should return active profiles list with profiles', async () => {
        activeProfiles.set('profile1', { title: 'Profile 1' } as ClaudeConfig);
        activeProfiles.set('profile2', { title: 'Profile 2' } as ClaudeConfig);
        
        const handler = server.requestHandlers.get('resources/read');
        const result = await handler!({ params: { uri: 'config://profiles/active' } } as any);
        
        expect(result).toEqual({
          contents: [
            {
              uri: 'config://profiles/active',
              mimeType: 'application/json',
              text: JSON.stringify({
                totalActiveProfiles: 2,
                activeProfiles: ['profile1', 'profile2']
              }, null, 2)
            }
          ]
        });
      });
    });

    describe('config://profile/active/{name}', () => {
      it('should return specific profile configuration', async () => {
        const testConfig = { title: 'Test Profile', version: '1.0.0' } as ClaudeConfig;
        activeProfiles.set('testProfile', testConfig);
        
        const handler = server.requestHandlers.get('resources/read');
        const result = await handler!({ params: { uri: 'config://profile/active/testProfile' } } as any);
        
        expect(result).toEqual({
          contents: [
            {
              uri: 'config://profile/active/testProfile',
              mimeType: 'application/json',
              text: JSON.stringify(testConfig, null, 2)
            }
          ]
        });
      });

      it('should handle non-existent profile', async () => {
        const handler = server.requestHandlers.get('resources/read');
        
        await expect(handler!({ params: { uri: 'config://profile/active/nonexistent' } } as any))
          .rejects.toThrow('Unknown resource: config://profile/active/nonexistent');
      });
    });

    describe('Error cases', () => {
      it('should throw error for unknown resource URI', async () => {
        const handler = server.requestHandlers.get('resources/read');
        
        await expect(handler!({ params: { uri: 'config://unknown/resource' } } as any))
          .rejects.toThrow('Unknown resource: config://unknown/resource');
      });

      it('should throw error for invalid profile URI format', async () => {
        const handler = server.requestHandlers.get('resources/read');
        
        await expect(handler!({ params: { uri: 'config://profile/invalid' } } as any))
          .rejects.toThrow('Unknown resource: config://profile/invalid');
      });
    });
  });

  describe('GitHub Engineering Guide Integration', () => {
    it('should include engineering guide resources in list', async () => {
      // Mock GitHub resource manager
      const mockGitHubManager = {
        getEngineeringGuide: vi.fn().mockResolvedValue([
          { name: 'intro.md', path: 'markdown/intro.md', content: '# Intro' },
          { name: 'guide.md', path: 'markdown/guide.md', content: '# Guide' }
        ]),
        getEngineeringGuideFile: vi.fn(),
        getCombinedEngineeringGuide: vi.fn().mockResolvedValue('# Combined\nContent')
      };
      (resourceHandlers as any).githubResourceManager = mockGitHubManager;
      
      const handler = server.requestHandlers.get('resources/list');
      const result = await handler!({} as any);
      
      const engineeringResources = result.resources.filter(r => r.uri.startsWith('engineering-guide://'));
      expect(engineeringResources.length).toBeGreaterThan(2);
      
      const filesResource = result.resources.find(r => r.uri === 'engineering-guide://files');
      expect(filesResource).toBeDefined();
      expect(filesResource!.name).toBe('📚 Engineering Guide - All Files');
      
      const combinedResource = result.resources.find(r => r.uri === 'engineering-guide://combined');
      expect(combinedResource).toBeDefined();
      expect(combinedResource!.name).toBe('📘 Engineering Guide - Combined');
    });

    it('should handle GitHub API errors gracefully', async () => {
      const mockGitHubManager = {
        getEngineeringGuide: vi.fn().mockRejectedValue(new Error('GitHub API error')),
        getEngineeringGuideFile: vi.fn(),
        getCombinedEngineeringGuide: vi.fn()
      };
      (resourceHandlers as any).githubResourceManager = mockGitHubManager;
      
      const handler = server.requestHandlers.get('resources/list');
      const result = await handler!({} as any);
      
      // Should still include base engineering guide resources even if API fails
      const engineeringResources = result.resources.filter(r => r.uri.startsWith('engineering-guide://'));
      expect(engineeringResources.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Auto-Apply Profiles', () => {
    it('should include auto-apply resource when profiles are marked for auto-apply', async () => {
      // Add profiles with auto-apply flag
      const autoApplyProfile = { title: 'Auto Apply Profile', _autoApply: true } as ClaudeConfig & { _autoApply: boolean };
      activeProfiles.set('auto-profile', autoApplyProfile);
      activeProfiles.set('normal-profile', { title: 'Normal Profile' } as ClaudeConfig);
      
      const handler = server.requestHandlers.get('resources/list');
      const result = await handler!({} as any);
      
      const autoApplyResource = result.resources.find(r => r.uri === 'config://auto-apply');
      expect(autoApplyResource).toBeDefined();
      expect(autoApplyResource!.name).toBe('🚀 Auto-Apply Instructions');
      expect(autoApplyResource!.description).toContain('1 profile(s)');
    });

    it('should not include auto-apply resource when no profiles are marked', async () => {
      activeProfiles.set('profile1', { title: 'Profile 1' } as ClaudeConfig);
      
      const handler = server.requestHandlers.get('resources/list');
      const result = await handler!({} as any);
      
      const autoApplyResource = result.resources.find(r => r.uri === 'config://auto-apply');
      expect(autoApplyResource).toBeUndefined();
    });
  });

  describe('Engineering Guide Read Resources', () => {
    it('should read engineering guide files list', async () => {
      const mockFiles = [
        { name: 'intro.md', path: 'markdown/intro.md', content: '# Introduction' },
        { name: 'guide.md', path: 'markdown/guide.md', content: '# Guide' }
      ];
      
      const mockGitHubManager = {
        getEngineeringGuide: vi.fn().mockResolvedValue(mockFiles),
        getEngineeringGuideFile: vi.fn(),
        getCombinedEngineeringGuide: vi.fn()
      };
      (resourceHandlers as any).githubResourceManager = mockGitHubManager;
      
      const handler = server.requestHandlers.get('resources/read');
      const result = await handler!({ params: { uri: 'engineering-guide://files' } } as any);
      
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('application/json');
      
      const data = JSON.parse(result.contents[0].text);
      expect(data.files).toHaveLength(2);
      expect(data.files[0].name).toBe('intro.md');
    });

    it('should read combined engineering guide', async () => {
      const mockFiles = [
        { name: 'intro.md', path: 'markdown/intro.md', content: '# Introduction', size: 100 },
        { name: 'guide.md', path: 'markdown/guide.md', content: '# Guide Content', size: 200 }
      ];
      
      const mockGitHubManager = {
        getEngineeringGuide: vi.fn().mockResolvedValue(mockFiles),
        getEngineeringGuideFile: vi.fn(),
        getCombinedEngineeringGuide: vi.fn()
      };
      (resourceHandlers as any).githubResourceManager = mockGitHubManager;
      
      const handler = server.requestHandlers.get('resources/read');
      const result = await handler!({ params: { uri: 'engineering-guide://combined' } } as any);
      
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('text/markdown');
      expect(result.contents[0].text).toContain('# Claude Code Engineering Guide');
      expect(result.contents[0].text).toContain('intro.md');
      expect(result.contents[0].text).toContain('# Introduction');
    });

    it('should read individual engineering guide file', async () => {
      const mockFiles = [
        { name: 'intro.md', path: 'markdown/intro.md', content: '# Introduction to Engineering', size: 100 }
      ];
      
      const mockGitHubManager = {
        getEngineeringGuide: vi.fn().mockResolvedValue(mockFiles),
        getEngineeringGuideFile: vi.fn(),
        getCombinedEngineeringGuide: vi.fn()
      };
      (resourceHandlers as any).githubResourceManager = mockGitHubManager;
      
      const handler = server.requestHandlers.get('resources/read');
      const result = await handler!({ params: { uri: 'engineering-guide://file/markdown%2Fintro.md' } } as any);
      
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('text/markdown');
      expect(result.contents[0].text).toBe('# Introduction to Engineering');
    });

    it('should handle engineering guide file not found', async () => {
      const mockFiles = [
        { name: 'intro.md', path: 'markdown/intro.md', content: '# Introduction', size: 100 }
      ];
      
      const mockGitHubManager = {
        getEngineeringGuide: vi.fn().mockResolvedValue(mockFiles),
        getEngineeringGuideFile: vi.fn(),
        getCombinedEngineeringGuide: vi.fn()
      };
      (resourceHandlers as any).githubResourceManager = mockGitHubManager;
      
      const handler = server.requestHandlers.get('resources/read');
      
      // When file is not found, it should throw an error
      await expect(handler!({ params: { uri: 'engineering-guide://file/nonexistent.md' } } as any))
        .rejects.toThrow('Unknown resource: engineering-guide://file/nonexistent.md');
    });

    it('should handle engineering guide API errors', async () => {
      const mockGitHubManager = {
        getEngineeringGuide: vi.fn().mockRejectedValue(new Error('GitHub API rate limit')),
        getEngineeringGuideFile: vi.fn(),
        getCombinedEngineeringGuide: vi.fn()
      };
      (resourceHandlers as any).githubResourceManager = mockGitHubManager;
      
      const handler = server.requestHandlers.get('resources/read');
      const result = await handler!({ params: { uri: 'engineering-guide://files' } } as any);
      
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('application/json');
      
      const data = JSON.parse(result.contents[0].text);
      expect(data.error).toContain('Failed to fetch engineering guide files');
      expect(data.error).toContain('GitHub API rate limit');
    });
  });

  describe('Auto-Apply Profile Resource Reading', () => {
    it('should read auto-apply instructions', async () => {
      const autoApplyProfile1 = { 
        title: 'Auto Profile 1', 
        instructions: 'Auto instructions 1',
        _autoApply: true 
      } as ClaudeConfig & { _autoApply: boolean };
      const autoApplyProfile2 = { 
        title: 'Auto Profile 2', 
        instructions: 'Auto instructions 2',
        _autoApply: true 
      } as ClaudeConfig & { _autoApply: boolean };
      
      activeProfiles.set('auto1', autoApplyProfile1);
      activeProfiles.set('auto2', autoApplyProfile2);
      activeProfiles.set('normal', { title: 'Normal' } as ClaudeConfig);
      
      const handler = server.requestHandlers.get('resources/read');
      const result = await handler!({ params: { uri: 'config://auto-apply' } } as any);
      
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('text/plain');
      
      const content = result.contents[0].text;
      expect(content).toContain('Auto instructions 1');
      expect(content).toContain('Auto instructions 2');
      expect(content).not.toContain('Normal');
    });

    it('should handle empty auto-apply profiles', async () => {
      activeProfiles.set('normal', { title: 'Normal Profile' } as ClaudeConfig);
      
      const handler = server.requestHandlers.get('resources/read');
      const result = await handler!({ params: { uri: 'config://auto-apply' } } as any);
      
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('text/plain');
      expect(result.contents[0].text).toBe('No profiles marked for auto-apply');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed URIs', async () => {
      const handler = server.requestHandlers.get('resources/read');
      
      await expect(handler!({ params: { uri: 'invalid://malformed/uri' } } as any))
        .rejects.toThrow('Unknown resource: invalid://malformed/uri');
    });

    it('should handle file scanner errors gracefully', async () => {
      mockFileScanner.scanForClaudeFiles.mockRejectedValue(new Error('Permission denied'));
      
      const handler = server.requestHandlers.get('resources/read');
      const result = await handler!({ params: { uri: 'config://files/scannable' } } as any);
      
      expect(result.contents[0].text).toContain('error');
      expect(result.contents[0].text).toContain('Permission denied');
    });

    it('should handle missing profile gracefully', async () => {
      const handler = server.requestHandlers.get('resources/read');
      
      await expect(handler!({ params: { uri: 'config://profile/active/missing-profile' } } as any))
        .rejects.toThrow('Unknown resource: config://profile/active/missing-profile');
    });

    it('should handle empty active profiles list', async () => {
      activeProfiles.clear();
      
      const handler = server.requestHandlers.get('resources/read');
      const result = await handler!({ params: { uri: 'config://profiles/active' } } as any);
      
      const data = JSON.parse(result.contents[0].text);
      expect(data.totalActiveProfiles).toBe(0);
      expect(data.activeProfiles).toEqual([]);
    });
  });

  describe('Integration', () => {
    it('should handle complex profile scenarios', async () => {
      // Setup complex scenario
      activeProfiles.set('profile1', { title: 'Profile 1', instructions: 'Test 1' } as ClaudeConfig);
      activeProfiles.set('profile2', { title: 'Profile 2', instructions: 'Test 2' } as ClaudeConfig);
      
      const mockFiles = [
        { path: '/config/profile3.md', isClaudeConfig: true, matchedPattern: '*-behavior.md' }
      ];
      mockFileScanner.scanForClaudeFiles.mockResolvedValue(mockFiles);
      
      // Test list resources
      const listHandler = server.requestHandlers.get('resources/list');
      const listResult = await listHandler!({} as any);
      expect(listResult.resources.length).toBeGreaterThanOrEqual(6); // 4+ base + 2 profiles
      
      // Test read active profiles
      const readHandler = server.requestHandlers.get('resources/read');
      const activeResult = await readHandler!({ params: { uri: 'config://profiles/active' } } as any);
      const activeData = JSON.parse(activeResult.contents[0].text);
      expect(activeData.totalActiveProfiles).toBe(2);
      expect(activeData.activeProfiles).toEqual(['profile1', 'profile2']);
      
      // Test read scannable files
      const scannableResult = await readHandler!({ params: { uri: 'config://files/scannable' } } as any);
      const scannableData = JSON.parse(scannableResult.contents[0].text);
      expect(scannableData.totalFiles).toBe(1);
      expect(scannableData.files[0].path).toBe('/config/profile3.md');
      
      // Test read specific profile
      const profileResult = await readHandler!({ params: { uri: 'config://profile/active/profile1' } } as any);
      const profileData = JSON.parse(profileResult.contents[0].text);
      expect(profileData.title).toBe('Profile 1');
      expect(profileData.instructions).toBe('Test 1');
    });
  });
});