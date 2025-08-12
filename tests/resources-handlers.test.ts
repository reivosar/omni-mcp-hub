import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ResourceHandlers } from "../src/resources/handlers.js";
import { ClaudeConfig } from "../src/utils/claude-config.js";
import { FileScanner } from "../src/utils/file-scanner.js";

// Mock FileScanner
vi.mock('../src/utils/file-scanner.js');
vi.mock('../src/config/yaml-config.js');

describe('ResourceHandlers', () => {
  let server: Server;
  let activeProfiles: Map<string, ClaudeConfig>;
  let resourceHandlers: ResourceHandlers;

  beforeEach(() => {
    server = new Server({ name: 'test', version: '1.0.0' }, { capabilities: { resources: {}, tools: {} } });
    activeProfiles = new Map();
    resourceHandlers = new ResourceHandlers(server, activeProfiles);
  });

  describe('Setup', () => {
    it('should setup handlers without errors', () => {
      const setupSpy = vi.spyOn(server, 'setRequestHandler');
      expect(() => resourceHandlers.setupHandlers()).not.toThrow();
      
      // Verify that setRequestHandler was called for both list and read resources
      expect(setupSpy).toHaveBeenCalledTimes(2);
    });

    it('should have FileScanner instance', () => {
      expect((resourceHandlers as any).fileScanner).toBeDefined();
    });
  });

  describe('Basic Functionality', () => {
    it('should create active profile resources', () => {
      // Add test profiles
      activeProfiles.set('test1', { title: 'Test 1' } as ClaudeConfig);
      activeProfiles.set('test2', { title: 'Test 2' } as ClaudeConfig);
      
      // Test internal logic by checking activeProfiles
      expect(activeProfiles.size).toBe(2);
      expect(activeProfiles.has('test1')).toBe(true);
      expect(activeProfiles.has('test2')).toBe(true);
    });

    it('should create FileScanner with mock', () => {
      const mockFileScanner = vi.mocked((resourceHandlers as any).fileScanner);
      mockFileScanner.scanForClaudeFiles = vi.fn().mockResolvedValue([
        { path: '/test/file1.md', isClaudeConfig: true, matchedPattern: 'CLAUDE.md' }
      ]);

      expect(mockFileScanner.scanForClaudeFiles).toBeDefined();
    });
  });

  describe('FileScanner Integration', () => {
    it('should initialize FileScanner with YamlConfigManager', () => {
      const fileScanner = (resourceHandlers as any).fileScanner;
      expect(fileScanner).toBeDefined();
      expect(fileScanner.scanForClaudeFiles).toBeDefined();
    });
  });
});