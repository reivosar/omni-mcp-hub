import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface RiskPattern {
  pattern: string;
  factor: string;
  weight: number;
  languages: string[];
}

export interface SecurityRules {
  language_risk_multipliers: Record<string, number>;
  risk_patterns: {
    high_risk: RiskPattern[];
    medium_risk: RiskPattern[];
    low_risk: RiskPattern[];
  };
  suspicious_keywords: Record<string, string[]>;
  thresholds: {
    block_content: number;
    add_warning: number;
    suspicious_keywords: number;
  };
  geopolitical_context?: {
    high_risk_regions: string[];
    notes?: string;
  };
}

export class SecurityRulesLoader {
  private static instance: SecurityRulesLoader;
  private rules: SecurityRules | null = null;

  private constructor() {}

  static getInstance(): SecurityRulesLoader {
    if (!SecurityRulesLoader.instance) {
      SecurityRulesLoader.instance = new SecurityRulesLoader();
    }
    return SecurityRulesLoader.instance;
  }

  loadRules(rulesPath?: string): SecurityRules {
    if (this.rules) {
      return this.rules;
    }

    const defaultPath = path.join(process.cwd(), 'security-rules.yaml');
    const filePath = rulesPath || process.env.SECURITY_RULES_PATH || defaultPath;

    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`Security rules file not found: ${filePath}, using defaults`);
        return this.getDefaultRules();
      }

      const fileContents = fs.readFileSync(filePath, 'utf8');
      this.rules = yaml.load(fileContents) as SecurityRules;
      
      console.log(`Loaded security rules from: ${filePath}`);
      return this.rules;
    } catch (error) {
      console.error(`Failed to load security rules from ${filePath}:`, error);
      return this.getDefaultRules();
    }
  }

  private getDefaultRules(): SecurityRules {
    return {
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
        high_risk: [
          {
            pattern: 'ignore.*previous.*instruction',
            factor: 'prompt_injection',
            weight: 3,
            languages: ['en']
          }
        ],
        medium_risk: [
          {
            pattern: 'system.*prompt',
            factor: 'system_manipulation',
            weight: 2,
            languages: ['en']
          }
        ],
        low_risk: [
          {
            pattern: 'secret',
            factor: 'secret_reference',
            weight: 1,
            languages: ['en']
          }
        ]
      },
      suspicious_keywords: {
        'en': ['jailbreak', 'bypass', 'exploit', 'backdoor', 'override']
      },
      thresholds: {
        block_content: 5,
        add_warning: 3,
        suspicious_keywords: 3
      }
    };
  }

  getRules(): SecurityRules {
    if (!this.rules) {
      return this.loadRules();
    }
    return this.rules;
  }

  // Force reload rules (useful for config updates)
  reloadRules(rulesPath?: string): SecurityRules {
    this.rules = null;
    return this.loadRules(rulesPath);
  }
}