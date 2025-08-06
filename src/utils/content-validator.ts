import { createTranslationService, TranslationService, LanguageDetector } from './translation-service';
import { SecurityRulesLoader } from './security-rules-loader';

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  flaggedPatterns?: string[];
}

export class ContentValidator {
  private static customPatterns: RegExp[] = [];
  private static customKeywords: string[] = [];
  private static translationService: TranslationService = createTranslationService();
  private static securityRules = SecurityRulesLoader.getInstance();
  
  // Keep legacy patterns for backward compatibility during transition
  private static readonly LEGACY_DANGEROUS_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+(instructions?|prompts?)/i,
    /disregard\s+(all\s+)?above/i,
    /forget\s+everything/i,
    /new\s+instructions?:/i,
    /you\s+are\s+now\s+a/i,
    /act\s+as\s+(if\s+you\s+are\s+)?a/i,
    /pretend\s+to\s+be/i,
    /roleplay\s+as/i,
    /system\s*\(\s*['"]/i,
    /execute\s+command/i,
    /run\s+script/i,
    /eval\s*\(/i,
    /base64\s*[:=]/i,
    /\\x[0-9a-f]{2}/i,
    /\\u[0-9a-f]{4}/i,
    // Security patterns from mcp_servers config
    /password\s*[=:]\s*['""][^'""]{3,}['"]/i,
    /api[_-]?key\s*[=:]\s*['""][^'""]{10,}['"]/i,
    /secret\s*[=:]\s*['""][^'""]{8,}['"]/i,
    /token\s*[=:]\s*['""][^'""]{20,}['"]/i,
    /\$\([^)]*\)/,
    /`[^`]*`/,
    /;\s*(rm|del|format|sudo)/i,
    /<script[^>]*>/i,
    /javascript:/i,
    /eval\s*\(/i
  ];

  private static readonly LEGACY_SUSPICIOUS_KEYWORDS = [
    'jailbreak',
    'bypass',
    'exploit',
    'backdoor',
    'override',
    'admin',
    'root',
    'sudo',
    'password',
    'token',
    'secret',
    'api_key',
    'apikey'
  ];

  private static readonly MAX_REPETITION_RATIO = 0.3;
  private static readonly MAX_CAPS_RATIO = 0.7;
  private static readonly MAX_SPECIAL_CHAR_RATIO = 0.4;

  static setCustomPatterns(patterns: string[]): void {
    this.customPatterns = patterns.map(p => new RegExp(p, 'i'));
  }

  static setCustomKeywords(keywords: string[]): void {
    this.customKeywords = keywords.map(k => k.toLowerCase());
  }

  static async validate(content: string): Promise<ValidationResult> {
    if (!content || content.trim().length === 0) {
      return { isValid: true };
    }

    // Check file size limit (10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (content.length > MAX_FILE_SIZE) {
      return {
        isValid: false,
        reason: `Content exceeds maximum file size limit (${content.length} bytes > ${MAX_FILE_SIZE} bytes)`
      };
    }

    // Use hybrid approach: legacy patterns + new security rules
    const flaggedPatterns: string[] = [];
    
    // Check legacy patterns first (for backward compatibility)
    const allLegacyPatterns = [...this.LEGACY_DANGEROUS_PATTERNS, ...this.customPatterns];
    for (const pattern of allLegacyPatterns) {
      if (pattern.test(content)) {
        flaggedPatterns.push(pattern.source);
      }
    }

    // Check legacy suspicious keywords
    const lowerContent = content.toLowerCase();
    const allLegacyKeywords = [...this.LEGACY_SUSPICIOUS_KEYWORDS, ...this.customKeywords];
    const foundKeywords = allLegacyKeywords.filter(keyword => 
      lowerContent.includes(keyword)
    );

    if (foundKeywords.length >= 3) {
      return {
        isValid: false,
        reason: 'Content contains multiple suspicious keywords',
        flaggedPatterns: foundKeywords
      };
    }

    // Also check new security rules
    const rules = this.securityRules.getRules();
    const riskScore = this.calculateRiskScore(content, rules);
    
    // Block if either legacy patterns found OR high risk score
    if (flaggedPatterns.length > 0 || riskScore.score >= rules.thresholds.block_content) {
      return {
        isValid: false,
        reason: flaggedPatterns.length > 0 ? 
          'Content contains potentially harmful patterns' : 
          `Content blocked due to high risk score (${riskScore.score}). Factors: ${riskScore.factors.join(', ')}`,
        flaggedPatterns: flaggedPatterns.length > 0 ? flaggedPatterns : riskScore.factors
      };
    }

    // Check for excessive repetition (use original content)
    if (this.hasExcessiveRepetition(content)) {
      return {
        isValid: false,
        reason: 'Content contains excessive character repetition'
      };
    }

    // Check for excessive caps (use original content)
    if (this.hasExcessiveCaps(content)) {
      return {
        isValid: false,
        reason: 'Content contains excessive capital letters'
      };
    }

    // Check for excessive special characters (use original content)
    if (this.hasExcessiveSpecialChars(content)) {
      return {
        isValid: false,
        reason: 'Content contains excessive special characters'
      };
    }

    // Check for hidden Unicode characters (use original content)
    if (this.hasHiddenUnicode(content)) {
      return {
        isValid: false,
        reason: 'Content contains suspicious Unicode characters'
      };
    }

    return { 
      isValid: true,
      reason: riskScore.score >= rules.thresholds.add_warning ? 
        `Warning: Content has elevated risk score (${riskScore.score})` : undefined
    };
  }

  private static calculateRiskScore(content: string, rules: any): { score: number; factors: string[] } {
    const detectedLanguage = LanguageDetector.detectLanguage(content);
    let totalScore = 0;
    const detectedFactors: string[] = [];

    // Check all risk patterns
    const allPatterns = [
      ...rules.risk_patterns.high_risk,
      ...rules.risk_patterns.medium_risk,
      ...rules.risk_patterns.low_risk
    ];

    for (const patternDef of allPatterns) {
      const regex = new RegExp(patternDef.pattern, 'i');
      if (regex.test(content)) {
        totalScore += patternDef.weight;
        detectedFactors.push(patternDef.factor);
      }
    }

    // Apply language-based risk multiplier
    const multiplier = rules.language_risk_multipliers[detectedLanguage] || 
                      rules.language_risk_multipliers.default || 1.0;
    totalScore = Math.round(totalScore * multiplier);

    return { score: totalScore, factors: detectedFactors };
  }

  static shouldAddSafetyNotice(content: string): boolean {
    // Check for any risk indicators that suggest caution
    const legacyRiskIndicators = [
      /ignore/i,
      /forget/i,
      /instruction/i,
      /system/i,
      /prompt/i,
      /override/i,
      /pretend/i,
      /act as/i
    ];

    let riskScore = 0;
    for (const pattern of legacyRiskIndicators) {
      if (pattern.test(content)) {
        riskScore++;
      }
    }

    // Also check new security rules
    try {
      const rules = this.securityRules.getRules();
      const securityRiskScore = this.calculateRiskScore(content, rules);
      return riskScore >= 2 || securityRiskScore.score >= rules.thresholds.add_warning;
    } catch (error) {
      // Fallback to legacy check if security rules fail
      return riskScore >= 2;
    }
  }

  private static hasExcessiveRepetition(content: string): boolean {
    const chars = content.split('');
    let maxRepeat = 0;
    let currentRepeat = 1;
    
    for (let i = 1; i < chars.length; i++) {
      if (chars[i] === chars[i - 1]) {
        currentRepeat++;
        maxRepeat = Math.max(maxRepeat, currentRepeat);
      } else {
        currentRepeat = 1;
      }
    }

    return maxRepeat > 20 || (maxRepeat / content.length) > this.MAX_REPETITION_RATIO;
  }

  private static hasExcessiveCaps(content: string): boolean {
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 10) return false;
    
    const capsCount = (content.match(/[A-Z]/g) || []).length;
    return capsCount / letters.length > this.MAX_CAPS_RATIO;
  }

  private static hasExcessiveSpecialChars(content: string): boolean {
    // Remove legitimate text characters including Unicode letters and common punctuation
    const legitimateChars = content.replace(/[\p{L}\p{N}\s\u3002\u3001\uFF0C\uFF0E\uFF1A\uFF1B\uFF1F\uFF01]/gu, '');
    return legitimateChars.length / content.length > this.MAX_SPECIAL_CHAR_RATIO;
  }

  private static hasHiddenUnicode(content: string): boolean {
    // Check for zero-width characters and other invisible Unicode
    const invisibleChars = [
      '\u200B', // Zero-width space
      '\u200C', // Zero-width non-joiner
      '\u200D', // Zero-width joiner
      '\uFEFF', // Zero-width non-breaking space
      '\u202E', // Right-to-left override
      '\u202D', // Left-to-right override
    ];

    return invisibleChars.some(char => content.includes(char));
  }

  static sanitize(content: string): string {
    // Remove dangerous patterns but keep the content readable
    let sanitized = content;

    // Remove hidden Unicode characters
    const invisibleChars = /[\u200B\u200C\u200D\uFEFF\u202E\u202D]/g;
    sanitized = sanitized.replace(invisibleChars, '');

    // Replace multiple consecutive spaces (but not newlines)
    sanitized = sanitized.replace(/ {4,}/g, '   ');
    // Replace multiple consecutive newlines
    sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');

    // Escape potential code injection
    sanitized = sanitized.replace(/\${/g, '\\${');
    
    return sanitized;
  }
}