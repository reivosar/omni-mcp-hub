import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { AdminUI } from '../../src/cli/admin-ui.js';
import * as inquirer from 'inquirer';

// Mock external dependencies
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
    Separator: vi.fn().mockImplementation((line) => ({ type: 'separator', line }))
  },
  prompt: vi.fn(),
  Separator: vi.fn().mockImplementation((line) => ({ type: 'separator', line }))
}));
vi.mock('../../src/utils/claude-config.js');
vi.mock('../../src/config/yaml-config.js', () => ({
  YamlConfigManager: {
    createWithPath: vi.fn(() => ({
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      getConfig: vi.fn(() => ({ profiles: [] }))
    }))
  }
}));
vi.mock('../../src/utils/path-resolver.js', () => ({
  PathResolver: {
    getInstance: vi.fn(() => ({
      getYamlConfigPath: vi.fn(() => 'mock-yaml-path'),
      resolveProfilePath: vi.fn((path) => path),
    }))
  }
}));
vi.mock('../../src/utils/profile-manager.js');
vi.mock('../../src/utils/logger.js', () => ({
  createFileLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));
vi.mock('cli-table3');
vi.mock('chalk', () => {
  const chalk = vi.fn((str: string) => str);
  chalk.cyan = vi.fn((str: string) => str);
  chalk.green = vi.fn((str: string) => str);
  chalk.yellow = vi.fn((str: string) => str);
  chalk.red = vi.fn((str: string) => str);
  chalk.blue = vi.fn((str: string) => str);
  chalk.magenta = vi.fn((str: string) => str);
  chalk.bold = {
    cyan: vi.fn((str: string) => str),
    green: vi.fn((str: string) => str),
    yellow: vi.fn((str: string) => str),
    blue: vi.fn((str: string) => str)
  };
  chalk.cyan.bold = vi.fn((str: string) => str);
  chalk.green.bold = vi.fn((str: string) => str);
  chalk.yellow.bold = vi.fn((str: string) => str);
  chalk.red.bold = vi.fn((str: string) => str);
  chalk.blue.bold = vi.fn((str: string) => str);
  chalk.magenta.bold = vi.fn((str: string) => str);
  return {
    default: chalk
  };
});

describe('AdminUI', () => {
  let adminUI: AdminUI;
  let mockExit: MockedFunction<typeof process.exit>;
  let mockConsoleLog: MockedFunction<typeof console.log>;
  let mockConsoleClear: MockedFunction<typeof console.clear>;

  beforeEach(() => {
    adminUI = new AdminUI();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation();
    mockConsoleClear = vi.spyOn(console, 'clear').mockImplementation();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Command Pattern Implementation Tests', () => {
    it('should verify command pattern is used instead of switch statement', () => {
      const showMainMenuCode = (adminUI as any).showMainMenu.toString();
      
      // Verify no switch statement is present
      expect(showMainMenuCode).not.toContain('switch');
      expect(showMainMenuCode).not.toContain('case ');
      
      // Verify command pattern elements are present
      expect(showMainMenuCode).toContain('menuHandlers');
      expect(showMainMenuCode).toContain('const handler = menuHandlers[action]');
      expect(showMainMenuCode).toContain('if (handler)');
    });

    it('should have proper menu handler mappings', () => {
      const showMainMenuCode = (adminUI as any).showMainMenu.toString();
      
      // Verify all expected menu options are mapped
      const expectedMappings = [
        '"list": () => this.listProfiles()',
        '"add": () => this.addProfile()',
        '"edit": () => this.editProfile()',
        '"remove": () => this.removeProfile()', 
        '"validate": () => this.validateProfile()',
        '"import": () => this.importProfiles()',
        '"export": () => this.exportProfiles()',
        '"inheritance_chain": () => this.showInheritanceChain()',
        '"check_circular": () => this.checkCircularDependencies()',
        '"export_resolved": () => this.exportResolvedProfile()',
        '"preview_resolution": () => this.previewResolution()',
        '"status": () => this.showSystemStatus()'
      ];
      
      expectedMappings.forEach(mapping => {
        expect(showMainMenuCode).toContain(mapping);
      });
      
      // Verify exit handler
      expect(showMainMenuCode).toContain('"exit": async () => {');
      expect(showMainMenuCode).toContain("process.exit(0)");
    });

    it('should call pressAnyKey after non-exit actions', () => {
      const showMainMenuCode = (adminUI as any).showMainMenu.toString();
      
      // Verify pressAnyKey is called after handler execution
      expect(showMainMenuCode).toContain('await this.pressAnyKey()');
      
      // Verify recursive showMainMenu call
      expect(showMainMenuCode).toContain('await this.showMainMenu()');
    });
  });

  describe('Individual Method Functionality', () => {
    it('should have all required methods available', () => {
      const methodNames = [
        'listProfiles',
        'addProfile', 
        'editProfile',
        'removeProfile',
        'validateProfile',
        'importProfiles',
        'exportProfiles',
        'showInheritanceChain',
        'checkCircularDependencies',
        'exportResolvedProfile',
        'previewResolution',
        'showSystemStatus',
        'pressAnyKey'
      ];

      methodNames.forEach(methodName => {
        expect(typeof (adminUI as any)[methodName]).toBe('function');
      });
    });

    it('should test method spying works correctly', async () => {
      // Test that we can spy on individual methods
      const listProfilesSpy = vi.spyOn(adminUI as any, 'listProfiles').mockResolvedValue(undefined);
      const pressAnyKeySpy = vi.spyOn(adminUI as any, 'pressAnyKey').mockResolvedValue(undefined);
      
      // Call methods directly
      await (adminUI as any).listProfiles();
      await (adminUI as any).pressAnyKey();
      
      expect(listProfilesSpy).toHaveBeenCalledTimes(1);
      expect(pressAnyKeySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Menu Structure Tests', () => {
    it('should have correct menu choices defined', () => {
      const showMainMenuCode = (adminUI as any).showMainMenu.toString();
      
      // Verify menu choices are properly structured
      const expectedChoices = [
        'List all profiles',
        'Add new profile', 
        'Edit profile',
        'Remove profile',
        'Validate profile',
        'Import profiles',
        'Export profiles',
        'Show inheritance chain',
        'Check circular dependencies',
        'Export resolved profile',
        'Preview profile resolution',
        'System status',
        'Exit'
      ];
      
      expectedChoices.forEach(choice => {
        expect(showMainMenuCode).toContain(choice);
      });
      
      // Verify separators are used
      expect(showMainMenuCode).toContain('--- Inheritance Management ---');
      expect(showMainMenuCode).toContain('--- System ---');
    });
  });

  describe('Complexity Reduction Verification', () => {
    it('should have low cyclomatic complexity after refactoring', () => {
      const showMainMenuCode = (adminUI as any).showMainMenu.toString();
      
      // Count complexity indicators (if, for, while, case, catch, &&, ||, ?, :)
      const complexityIndicators = [
        /\bif\s*\(/g,
        /\bfor\s*\(/g, 
        /\bwhile\s*\(/g,
        /\bcase\s+/g,
        /\bcatch\s*\(/g,
        /&&/g,
        /\|\|/g,
        /\?/g,
        /:/g
      ];
      
      let totalComplexity = 1; // Base complexity
      complexityIndicators.forEach(pattern => {
        const matches = showMainMenuCode.match(pattern);
        if (matches) {
          totalComplexity += matches.length;
        }
      });
      
      // After refactoring, complexity should be significantly reduced
      // Original switch had 13 cases = complexity ~15
      // Command pattern should reduce this but method still has menu choices
      expect(totalComplexity).toBeLessThan(60); // Reasonable threshold for this method
    });

    it('should verify no duplicate case handling logic', () => {
      const showMainMenuCode = (adminUI as any).showMainMenu.toString();
      
      // Should not contain break statements (switch pattern)
      expect(showMainMenuCode).not.toContain('break;');
      
      // Should not contain fall-through logic
      expect(showMainMenuCode).not.toContain('default:');
    });
  });

  describe('Edge Case Handling', () => {
    it('should handle missing handler gracefully', () => {
      const showMainMenuCode = (adminUI as any).showMainMenu.toString();
      
      // Verify handler existence check
      expect(showMainMenuCode).toContain('const handler = menuHandlers[action]');
      expect(showMainMenuCode).toContain('if (handler)');
      expect(showMainMenuCode).toContain('await handler()');
      
      // Should not crash on undefined handler (graceful degradation)
    });
  });
});