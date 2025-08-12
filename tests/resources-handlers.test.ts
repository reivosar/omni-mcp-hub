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
      
      expect(result).toEqual({
        resources: [
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
        ]
      });
    });

    it('should return base resources plus profile resources when profiles exist', async () => {
      // Add active profiles
      activeProfiles.set('profile1', { title: 'Profile 1' } as ClaudeConfig);
      activeProfiles.set('profile2', { title: 'Profile 2' } as ClaudeConfig);
      
      const handler = server.requestHandlers.get('resources/list');
      const result = await handler!({} as any);
      
      expect(result.resources).toHaveLength(4); // 2 base + 2 profiles
      expect(result.resources[2]).toEqual({
        uri: "config://profile/active/profile1",
        name: "Active: profile1",
        description: "Configuration details for active profile 'profile1'",
        mimeType: "application/json",
      });
      expect(result.resources[3]).toEqual({
        uri: "config://profile/active/profile2",
        name: "Active: profile2", 
        description: "Configuration details for active profile 'profile2'",
        mimeType: "application/json",
      });
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
      expect(listResult.resources).toHaveLength(4); // 2 base + 2 profiles
      
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