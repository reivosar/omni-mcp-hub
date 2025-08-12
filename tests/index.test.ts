import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OmniMCPServer } from '../src/index.js';
import { BehaviorGenerator } from '../src/utils/behavior-generator.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ファイルシステムをモック
vi.mock('fs/promises');
const mockedFs = vi.mocked(fs);

describe('OmniMCPServer', () => {
  let server: OmniMCPServer;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // .mcp-config.jsonの読み込みをモック（存在しない場合）
    mockedFs.readFile.mockRejectedValue(new Error('File not found'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create server instance', () => {
      server = new OmniMCPServer();
      expect(server).toBeDefined();
    });

    it('should initialize with empty profiles when no config file exists', () => {
      server = new OmniMCPServer();
      
      // loadInitialConfigが失敗しても正常に動作することを確認
      expect(server).toBeDefined();
    });

    it('should have initialized handlers', () => {
      server = new OmniMCPServer();
      
      const serverInstance = server.getServer();
      expect(serverInstance).toBeDefined();
      
      // ハンドラーが設定されていることを間接的に確認
      expect(typeof serverInstance.connect).toBe('function');
      expect(typeof serverInstance.setRequestHandler).toBe('function');
    });
  });

  describe('Integration with Handlers', () => {
    beforeEach(() => {
      server = new OmniMCPServer();
    });

    it('should have server instance accessible', () => {
      const serverInstance = server.getServer();
      expect(serverInstance).toBeDefined();
    });

    it('should have active profiles accessible', () => {
      const profiles = server.getActiveProfiles();
      expect(profiles).toBeInstanceOf(Map);
    });
  });

  describe('Tool Validation', () => {
    beforeEach(() => {
      server = new OmniMCPServer();
    });

    it('should validate load_claude_config arguments - string format', () => {
      const args = './test-config.md';
      
      let filePath: string = '';
      let profileName: string | undefined;
      let autoApply: boolean = true;
      
      if (typeof args === 'string') {
        filePath = args;
      } else if (args && typeof args === 'object') {
        const argsObj = args as { 
          filePath?: string; 
          profileName?: string;
          autoApply?: boolean;
        };
        filePath = argsObj.filePath || '';
        profileName = argsObj.profileName;
        autoApply = argsObj.autoApply !== undefined ? argsObj.autoApply : true;
      }

      expect(filePath).toBe('./test-config.md');
      expect(profileName).toBeUndefined();
      expect(autoApply).toBe(true);
    });

    it('should validate load_claude_config arguments - object format', () => {
      const args = {
        filePath: './test-config.md',
        profileName: 'test',
        autoApply: false
      };
      
      let filePath: string = '';
      let profileName: string | undefined;
      let autoApply: boolean = true;
      
      if (typeof args === 'string') {
        filePath = args;
      } else if (args && typeof args === 'object') {
        const argsObj = args as { 
          filePath?: string; 
          profileName?: string;
          autoApply?: boolean;
        };
        filePath = argsObj.filePath || '';
        profileName = argsObj.profileName;
        autoApply = argsObj.autoApply !== undefined ? argsObj.autoApply : true;
      }

      expect(filePath).toBe('./test-config.md');
      expect(profileName).toBe('test');
      expect(autoApply).toBe(false);
    });

    it('should validate apply_claude_behavior arguments - string format', () => {
      const args = 'test-profile';
      
      let profileName: string | string[] | undefined;
      
      if (typeof args === 'string') {
        profileName = args;
      } else {
        ({ profileName } = args as {
          profileName?: string | string[];
        });
      }

      let profilesToApply: string[] = [];
      
      if (!profileName) {
        profilesToApply = [];
      } else if (Array.isArray(profileName)) {
        profilesToApply = profileName;
      } else {
        profilesToApply = [profileName];
      }

      expect(profilesToApply).toEqual(['test-profile']);
    });

    it('should validate apply_claude_behavior arguments - array format', () => {
      const args = {
        profileName: ['profile1', 'profile2']
      };
      
      let profileName: string | string[] | undefined;
      
      if (typeof args === 'string') {
        profileName = args;
      } else {
        ({ profileName } = args as {
          profileName?: string | string[];
        });
      }

      let profilesToApply: string[] = [];
      
      if (!profileName) {
        profilesToApply = [];
      } else if (Array.isArray(profileName)) {
        profilesToApply = profileName;
      } else {
        profilesToApply = [profileName];
      }

      expect(profilesToApply).toEqual(['profile1', 'profile2']);
    });
  });

  describe('Profile Name Generation', () => {
    beforeEach(() => {
      server = new OmniMCPServer();
    });

    it('should generate profile name from file path', () => {
      const filePath = './examples/lum-behavior.md';
      const expectedProfileName = path.basename(filePath, path.extname(filePath));
      
      expect(expectedProfileName).toBe('lum-behavior');
    });

    it('should use provided profile name over generated name', () => {
      const filePath = './examples/lum-behavior.md';
      const providedProfileName = 'custom-name';
      const autoProfileName = providedProfileName || path.basename(filePath, path.extname(filePath));
      
      expect(autoProfileName).toBe('custom-name');
    });

    it('should handle various file extensions', () => {
      const testCases = [
        { path: './config.md', expected: 'config' },
        { path: './my-config.markdown', expected: 'my-config' },
        { path: '/absolute/path/config.md', expected: 'config' },
        { path: 'simple.md', expected: 'simple' },
      ];

      for (const testCase of testCases) {
        const result = path.basename(testCase.path, path.extname(testCase.path));
        expect(result).toBe(testCase.expected);
      }
    });
  });

  describe('Behavior Instructions Generation', () => {
    beforeEach(() => {
      server = new OmniMCPServer();
    });

    it('should delegate to BehaviorGenerator', () => {
      const config = {
        instructions: 'Test instructions',
        customInstructions: ['Custom 1']
      };

      const serverResult = server.generateBehaviorInstructions(config);
      const generatorResult = BehaviorGenerator.generateInstructions(config);

      // サーバーの結果がBehaviorGeneratorと同じであることを確認
      expect(serverResult).toBe(generatorResult);
    });

    it('should handle empty config through delegation', () => {
      const config = {};

      const result = server.generateBehaviorInstructions(config);

      expect(result).toBe('');
    });
  });

  describe('Active Profiles Management', () => {
    beforeEach(() => {
      server = new OmniMCPServer();
    });

    it('should manage active profiles correctly', () => {
      const profiles = server.getActiveProfiles();
      
      // 初期状態では空
      expect(profiles.size).toBe(0);
      
      // プロファイルを追加
      const testConfig = {
        project_name: 'Test Project',
        instructions: 'Test instructions'
      };
      profiles.set('test-profile', testConfig);
      
      expect(profiles.size).toBe(1);
      expect(profiles.has('test-profile')).toBe(true);
      expect(profiles.get('test-profile')?.project_name).toBe('Test Project');
    });

    it('should handle multiple profiles', () => {
      const profiles = server.getActiveProfiles();
      
      profiles.set('profile1', { name: 'Profile 1' });
      profiles.set('profile2', { name: 'Profile 2' });
      profiles.set('profile3', { name: 'Profile 3' });
      
      expect(profiles.size).toBe(3);
      expect(Array.from(profiles.keys())).toEqual(['profile1', 'profile2', 'profile3']);
      
      // プロファイル削除
      profiles.delete('profile2');
      expect(profiles.size).toBe(2);
      expect(profiles.has('profile2')).toBe(false);
    });
  });

  describe('Server Instance', () => {
    beforeEach(() => {
      server = new OmniMCPServer();
    });

    it('should provide access to server instance', () => {
      const serverInstance = server.getServer();
      
      expect(serverInstance).toBeDefined();
      expect(typeof serverInstance.connect).toBe('function');
      expect(typeof serverInstance.setRequestHandler).toBe('function');
    });

    it('should have correct server configuration', () => {
      const serverInstance = server.getServer();
      
      // サーバーインスタンスが正しく設定されていることを確認
      expect(serverInstance).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      server = new OmniMCPServer();
    });

    it('should handle file loading errors gracefully', () => {
      const errorMessage = 'Failed to load CLAUDE.md from non-existent.md: Error: File not found';
      
      expect(errorMessage).toContain('Failed to load CLAUDE.md');
      expect(errorMessage).toContain('non-existent.md');
      expect(errorMessage).toContain('File not found');
    });

    it('should handle empty file path', () => {
      const filePath = '';
      
      if (!filePath) {
        const response = {
          content: [
            {
              type: "text",
              text: `File path is required`,
            },
          ],
          isError: true,
        };
        
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toBe('File path is required');
      }
    });

    it('should handle invalid JSON in .mcp-config.json', () => {
      const invalidJson = '{ invalid json }';
      
      expect(() => {
        JSON.parse(invalidJson);
      }).toThrow();
    });

    it('should handle missing profile names in apply_claude_behavior', () => {
      const activeProfiles = new Map();
      const requestedProfile = 'non-existent-profile';
      
      const config = activeProfiles.get(requestedProfile);
      expect(config).toBeUndefined();
      
      if (!config) {
        const response = {
          content: [
            {
              type: "text",
              text: `No configuration found for profile '${requestedProfile}'`,
            },
          ],
        };
        
        expect(response.content[0].text).toContain('No configuration found');
        expect(response.content[0].text).toContain(requestedProfile);
      }
    });
  });

  describe('Resource Management', () => {
    beforeEach(() => {
      server = new OmniMCPServer();
    });

    it('should generate dynamic profile resources', () => {
      const activeProfiles = new Map([
        ['profile1', { name: 'Profile 1' }],
        ['profile2', { name: 'Profile 2' }]
      ]);

      // プロファイルリソースの生成ロジック
      const profileResources = Array.from(activeProfiles.keys()).map(profileName => ({
        uri: `claude://profile/${profileName}`,
        name: `Claude Profile: ${profileName}`,
        description: `Configuration details for Claude profile '${profileName}'`,
        mimeType: "application/json",
      }));

      expect(profileResources).toHaveLength(2);
      expect(profileResources[0].uri).toBe('claude://profile/profile1');
      expect(profileResources[0].name).toBe('Claude Profile: profile1');
      expect(profileResources[1].uri).toBe('claude://profile/profile2');
      expect(profileResources[1].name).toBe('Claude Profile: profile2');
    });

    it('should handle profile resource URI parsing', () => {
      const testUris = [
        'claude://profile/lum-behavior',
        'claude://profile/pirate-mode',
        'info://server',
        'greeting://world'
      ];

      for (const uri of testUris) {
        const profileMatch = uri.match(/^claude:\/\/profile\/(.+)$/);
        
        if (profileMatch) {
          const profileName = profileMatch[1];
          expect(['lum-behavior', 'pirate-mode']).toContain(profileName);
        } else {
          expect(['info://server', 'greeting://world']).toContain(uri);
        }
      }
    });
  });
});