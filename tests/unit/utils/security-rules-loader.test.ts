import { SecurityRulesLoader, SecurityRules, RiskPattern } from '../../../src/utils/security-rules-loader';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

jest.mock('fs');
jest.mock('js-yaml');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockYaml = yaml as jest.Mocked<typeof yaml>;

describe('SecurityRulesLoader', () => {
  let loader: SecurityRulesLoader;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton instance
    (SecurityRulesLoader as any).instance = undefined;
    
    // Mock console methods
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    
    // Clear environment variables
    delete process.env.SECURITY_RULES_PATH;
    
    loader = SecurityRulesLoader.getInstance();
  });

  afterEach(() => {
    // Reset the loader's cached rules
    (loader as any).rules = null;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = SecurityRulesLoader.getInstance();
      const instance2 = SecurityRulesLoader.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(SecurityRulesLoader);
    });

    it('should create new instance only once', () => {
      const spy = jest.spyOn(SecurityRulesLoader, 'getInstance');
      
      const instance1 = SecurityRulesLoader.getInstance();
      const instance2 = SecurityRulesLoader.getInstance();
      
      expect(spy).toHaveBeenCalledTimes(2);
      expect(instance1).toBe(instance2);
    });
  });

  describe('loadRules', () => {
    const mockRules: SecurityRules = {
      language_risk_multipliers: {
        'en': 1.0,
        'zh': 1.5
      },
      risk_patterns: {
        high_risk: [{
          pattern: 'test pattern',
          factor: 'test_factor',
          weight: 5,
          languages: ['en']
        }],
        medium_risk: [],
        low_risk: []
      },
      suspicious_keywords: {
        'en': ['test', 'keyword']
      },
      thresholds: {
        block_content: 10,
        add_warning: 5,
        suspicious_keywords: 3
      }
    };

    it('should load rules from specified file path', () => {
      const testPath = '/test/security-rules.yaml';
      const fileContent = 'test: content';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(fileContent);
      mockYaml.load.mockReturnValue(mockRules);

      const result = loader.loadRules(testPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(testPath);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(testPath, 'utf8');
      expect(mockYaml.load).toHaveBeenCalledWith(fileContent);
      expect(result).toEqual(mockRules);
      expect(console.log).toHaveBeenCalledWith(`Loaded security rules from: ${testPath}`);
    });

    it('should use environment variable path when no path specified', () => {
      const envPath = '/env/security-rules.yaml';
      process.env.SECURITY_RULES_PATH = envPath;
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('content');
      mockYaml.load.mockReturnValue(mockRules);

      loader.loadRules();

      expect(mockFs.existsSync).toHaveBeenCalledWith(envPath);
    });

    it('should use default path when no path or env variable', () => {
      const expectedDefaultPath = `${process.cwd()}/security-rules.yaml`;
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('content');
      mockYaml.load.mockReturnValue(mockRules);

      loader.loadRules();

      expect(mockFs.existsSync).toHaveBeenCalledWith(expectedDefaultPath);
    });

    it('should return default rules when file does not exist', () => {
      const testPath = '/nonexistent/rules.yaml';
      mockFs.existsSync.mockReturnValue(false);

      const result = loader.loadRules(testPath);

      expect(console.warn).toHaveBeenCalledWith(`Security rules file not found: ${testPath}, using defaults`);
      expect(result).toEqual(expect.objectContaining({
        language_risk_multipliers: expect.any(Object),
        risk_patterns: expect.any(Object),
        suspicious_keywords: expect.any(Object),
        thresholds: expect.any(Object)
      }));
    });

    it('should return default rules when file read fails', () => {
      const testPath = '/error/rules.yaml';
      const error = new Error('Read error');
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw error;
      });

      const result = loader.loadRules(testPath);

      expect(console.error).toHaveBeenCalledWith(`Failed to load security rules from ${testPath}:`, error);
      expect(result).toEqual(expect.objectContaining({
        language_risk_multipliers: expect.any(Object),
        risk_patterns: expect.any(Object),
        suspicious_keywords: expect.any(Object),
        thresholds: expect.any(Object)
      }));
    });

    it('should return default rules when YAML parsing fails', () => {
      const testPath = '/invalid/rules.yaml';
      const yamlError = new Error('Invalid YAML');
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid: yaml: content:');
      mockYaml.load.mockImplementation(() => {
        throw yamlError;
      });

      const result = loader.loadRules(testPath);

      expect(console.error).toHaveBeenCalledWith(`Failed to load security rules from ${testPath}:`, yamlError);
      expect(result).toEqual(expect.objectContaining({
        language_risk_multipliers: expect.any(Object),
        risk_patterns: expect.any(Object),
        suspicious_keywords: expect.any(Object),
        thresholds: expect.any(Object)
      }));
    });

    it('should cache rules after first load', () => {
      const testPath = '/test/rules.yaml';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('content');
      mockYaml.load.mockReturnValue(mockRules);

      // First call
      const result1 = loader.loadRules(testPath);
      // Second call
      const result2 = loader.loadRules(testPath);

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });
  });

  describe('getDefaultRules', () => {
    it('should return comprehensive default security rules', () => {
      const defaultRules = (loader as any).getDefaultRules();

      expect(defaultRules).toEqual({
        language_risk_multipliers: {
          'zh': 1.2,
          'ru': 1.3,
          'ar': 1.1,
          'en': 1.0,
          'ja': 0.9,
          'ko': 0.9,
          'default': 1.0
        },
        risk_patterns: {
          high_risk: [{
            pattern: 'ignore.*previous.*instruction',
            factor: 'prompt_injection',
            weight: 3,
            languages: ['en']
          }],
          medium_risk: [{
            pattern: 'system.*prompt',
            factor: 'system_manipulation',
            weight: 2,
            languages: ['en']
          }],
          low_risk: [{
            pattern: 'secret',
            factor: 'secret_reference',
            weight: 1,
            languages: ['en']
          }]
        },
        suspicious_keywords: {
          'en': ['jailbreak', 'bypass', 'exploit', 'backdoor', 'override']
        },
        thresholds: {
          block_content: 5,
          add_warning: 3,
          suspicious_keywords: 3
        }
      });
    });

    it('should include all required risk pattern properties', () => {
      const defaultRules = (loader as any).getDefaultRules();
      
      const allPatterns = [
        ...defaultRules.risk_patterns.high_risk,
        ...defaultRules.risk_patterns.medium_risk,
        ...defaultRules.risk_patterns.low_risk
      ];

      allPatterns.forEach((pattern: RiskPattern) => {
        expect(pattern).toHaveProperty('pattern');
        expect(pattern).toHaveProperty('factor');
        expect(pattern).toHaveProperty('weight');
        expect(pattern).toHaveProperty('languages');
        expect(Array.isArray(pattern.languages)).toBe(true);
        expect(typeof pattern.weight).toBe('number');
      });
    });

    it('should have properly structured thresholds', () => {
      const defaultRules = (loader as any).getDefaultRules();

      expect(defaultRules.thresholds).toEqual({
        block_content: 5,
        add_warning: 3,
        suspicious_keywords: 3
      });

      Object.values(defaultRules.thresholds).forEach(threshold => {
        expect(typeof threshold).toBe('number');
        expect(threshold).toBeGreaterThan(0);
      });
    });

    it('should have language risk multipliers for various languages', () => {
      const defaultRules = (loader as any).getDefaultRules();

      expect(defaultRules.language_risk_multipliers).toHaveProperty('en');
      expect(defaultRules.language_risk_multipliers).toHaveProperty('zh');
      expect(defaultRules.language_risk_multipliers).toHaveProperty('ru');
      expect(defaultRules.language_risk_multipliers).toHaveProperty('ar');
      expect(defaultRules.language_risk_multipliers).toHaveProperty('ja');
      expect(defaultRules.language_risk_multipliers).toHaveProperty('ko');
      expect(defaultRules.language_risk_multipliers).toHaveProperty('default');

      Object.values(defaultRules.language_risk_multipliers).forEach(multiplier => {
        expect(typeof multiplier).toBe('number');
        expect(multiplier).toBeGreaterThan(0);
      });
    });
  });

  describe('getRules', () => {
    it('should return cached rules if available', () => {
      const cachedRules: SecurityRules = {
        language_risk_multipliers: { 'en': 1.0 },
        risk_patterns: { high_risk: [], medium_risk: [], low_risk: [] },
        suspicious_keywords: { 'en': [] },
        thresholds: { block_content: 1, add_warning: 1, suspicious_keywords: 1 }
      };

      (loader as any).rules = cachedRules;

      const result = loader.getRules();

      expect(result).toBe(cachedRules);
    });

    it('should load rules if not cached', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = loader.getRules();

      expect(result).toEqual(expect.objectContaining({
        language_risk_multipliers: expect.any(Object),
        risk_patterns: expect.any(Object),
        suspicious_keywords: expect.any(Object),
        thresholds: expect.any(Object)
      }));
    });
  });

  describe('reloadRules', () => {
    it('should force reload rules from file', () => {
      const testPath = '/test/rules.yaml';
      const newRules: SecurityRules = {
        language_risk_multipliers: { 'fr': 1.1 },
        risk_patterns: { high_risk: [], medium_risk: [], low_risk: [] },
        suspicious_keywords: { 'fr': ['test'] },
        thresholds: { block_content: 10, add_warning: 5, suspicious_keywords: 2 }
      };

      // Set up cached rules first
      (loader as any).rules = {
        language_risk_multipliers: { 'en': 1.0 },
        risk_patterns: { high_risk: [], medium_risk: [], low_risk: [] },
        suspicious_keywords: { 'en': [] },
        thresholds: { block_content: 1, add_warning: 1, suspicious_keywords: 1 }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('new content');
      mockYaml.load.mockReturnValue(newRules);

      const result = loader.reloadRules(testPath);

      expect(result).toEqual(newRules);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(testPath, 'utf8');
    });

    it('should clear cached rules before reloading', () => {
      const cachedRules = { language_risk_multipliers: {}, risk_patterns: { high_risk: [], medium_risk: [], low_risk: [] }, suspicious_keywords: {}, thresholds: { block_content: 1, add_warning: 1, suspicious_keywords: 1 } };
      (loader as any).rules = cachedRules;

      mockFs.existsSync.mockReturnValue(false);

      loader.reloadRules();

      expect((loader as any).rules).not.toBe(cachedRules);
    });

    it('should use default path when no path specified in reload', () => {
      const expectedDefaultPath = `${process.cwd()}/security-rules.yaml`;
      
      mockFs.existsSync.mockReturnValue(false);

      loader.reloadRules();

      // Since file doesn't exist, it should have checked the default path
      expect(mockFs.existsSync).toHaveBeenCalledWith(expectedDefaultPath);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle empty file gracefully', () => {
      const testPath = '/empty/rules.yaml';
      const yamlError = new Error('Invalid YAML: null content');
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('');
      mockYaml.load.mockImplementation(() => {
        throw yamlError;
      });

      const result = loader.loadRules(testPath);

      expect(console.error).toHaveBeenCalledWith(`Failed to load security rules from ${testPath}:`, yamlError);
      expect(result).toEqual(expect.objectContaining({
        language_risk_multipliers: expect.any(Object),
        risk_patterns: expect.any(Object),
        suspicious_keywords: expect.any(Object),
        thresholds: expect.any(Object)
      }));
    });

    it('should handle file permission errors', () => {
      const testPath = '/permission/denied.yaml';
      const permissionError = new Error('EACCES: permission denied');
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw permissionError;
      });

      const result = loader.loadRules(testPath);

      expect(console.error).toHaveBeenCalledWith(`Failed to load security rules from ${testPath}:`, permissionError);
      expect(result).toEqual(expect.objectContaining({
        language_risk_multipliers: expect.any(Object)
      }));
    });

    it('should handle malformed YAML content', () => {
      const testPath = '/malformed/rules.yaml';
      const malformedContent = 'invalid: yaml: [unclosed';
      const yamlError = new Error('YAMLException: unexpected end of the stream');
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(malformedContent);
      mockYaml.load.mockImplementation(() => {
        throw yamlError;
      });

      const result = loader.loadRules(testPath);

      expect(console.error).toHaveBeenCalledWith(`Failed to load security rules from ${testPath}:`, yamlError);
      expect(result).toEqual(expect.objectContaining({
        language_risk_multipliers: expect.any(Object)
      }));
    });

    it('should handle null or undefined file content', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(null as any);
      mockYaml.load.mockReturnValue({} as SecurityRules);

      const result = loader.loadRules('/null/rules.yaml');

      expect(mockYaml.load).toHaveBeenCalledWith(null);
      expect(result).toEqual({});
    });
  });

  describe('integration scenarios', () => {
    it('should work with real-world security rules structure', () => {
      const realisticRules: SecurityRules = {
        language_risk_multipliers: {
          'en': 1.0,
          'zh': 1.3,
          'ru': 1.4,
          'ar': 1.2,
          'default': 1.0
        },
        risk_patterns: {
          high_risk: [
            {
              pattern: 'ignore.*(previous|prior).*(instruction|command|rule)',
              factor: 'prompt_injection',
              weight: 5,
              languages: ['en']
            },
            {
              pattern: 'forget.*(everything|all).*(before|above)',
              factor: 'context_manipulation', 
              weight: 4,
              languages: ['en']
            }
          ],
          medium_risk: [
            {
              pattern: 'system.*(prompt|message|instruction)',
              factor: 'system_probing',
              weight: 3,
              languages: ['en']
            }
          ],
          low_risk: [
            {
              pattern: '(password|secret|key|token)',
              factor: 'credential_reference',
              weight: 2,
              languages: ['en', 'zh', 'ru']
            }
          ]
        },
        suspicious_keywords: {
          'en': ['jailbreak', 'bypass', 'exploit', 'override', 'manipulate', 'hack'],
          'zh': ['越狱', '绕过', '利用'],
          'ru': ['взлом', 'обход', 'эксплойт']
        },
        thresholds: {
          block_content: 8,
          add_warning: 5,
          suspicious_keywords: 4
        },
        geopolitical_context: {
          high_risk_regions: ['CN', 'RU', 'IR', 'KP'],
          notes: 'Enhanced monitoring for high-risk regions'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('realistic yaml content');
      mockYaml.load.mockReturnValue(realisticRules);

      const result = loader.loadRules('/realistic/rules.yaml');

      expect(result).toEqual(realisticRules);
      expect(result.geopolitical_context).toBeDefined();
      expect(result.geopolitical_context?.high_risk_regions).toContain('CN');
      expect(result.risk_patterns.high_risk).toHaveLength(2);
      expect(result.suspicious_keywords['zh']).toBeDefined();
    });

    it('should maintain singleton behavior across multiple operations', () => {
      const instance1 = SecurityRulesLoader.getInstance();
      const instance2 = SecurityRulesLoader.getInstance();
      
      mockFs.existsSync.mockReturnValue(false);
      
      instance1.loadRules();
      const rules1 = instance1.getRules();
      const rules2 = instance2.getRules();

      expect(instance1).toBe(instance2);
      expect(rules1).toStrictEqual(rules2);
    });
  });
});