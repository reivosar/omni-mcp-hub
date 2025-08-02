export interface TranslationResult {
  translatedText: string;
  detectedLanguage?: string;
  confidence?: number;
}

export interface TranslationService {
  translate(text: string, targetLanguage?: string): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<string>;
}

// Simple language detection based on character sets
export class LanguageDetector {
  static detectLanguage(text: string): string {
    // Remove whitespace and punctuation for analysis
    const cleanText = text.replace(/[\s\p{P}]/gu, '');
    
    // Japanese detection (Hiragana, Katakana, Kanji)
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(cleanText)) {
      return 'ja';
    }
    
    // Korean detection (Hangul)
    if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(cleanText)) {
      return 'ko';
    }
    
    // Chinese detection (Chinese characters, but not Japanese context)
    if (/[\u4E00-\u9FAF]/.test(cleanText) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(cleanText)) {
      return 'zh';
    }
    
    // Cyrillic (Russian, etc.)
    if (/[\u0400-\u04FF]/.test(cleanText)) {
      return 'ru';
    }
    
    // Arabic
    if (/[\u0600-\u06FF]/.test(cleanText)) {
      return 'ar';
    }
    
    // Thai
    if (/[\u0E00-\u0E7F]/.test(cleanText)) {
      return 'th';
    }
    
    // Default to English for Latin scripts
    return 'en';
  }
}

// Mock translation service for demonstration
// In production, you would integrate with Google Translate, DeepL, Azure Translator, etc.
export class MockTranslationService implements TranslationService {
  private readonly translations: Record<string, string> = {
    // Japanese examples
    '無視して': 'ignore',
    '忘れて': 'forget',
    '前の指示': 'previous instructions',
    '新しい指示': 'new instructions',
    '今から君は': 'now you are',
    'なりきって': 'act as',
    
    // Chinese examples
    '忽略指令': 'ignore instructions',
    '忘记一切': 'forget everything',
    '新指令': 'new instructions',
    '现在你是': 'now you are',
    '扮演': 'act as',
    
    // Korean examples
    '무시해': 'ignore',
    '잊어버려': 'forget',
    '이전 지시': 'previous instructions',
    '새로운 지시': 'new instructions',
    '지금부터 너는': 'now you are',
    
    // Russian examples
    'игнорируй': 'ignore',
    'забудь всё': 'forget everything',
    'новые инструкции': 'new instructions',
    'теперь ты': 'now you are',
    'притворись': 'pretend'
  };

  async translate(text: string, targetLanguage: string = 'en'): Promise<TranslationResult> {
    if (targetLanguage !== 'en') {
      throw new Error('Only translation to English is supported in mock service');
    }

    const detectedLanguage = LanguageDetector.detectLanguage(text);
    
    // If already English, return as-is
    if (detectedLanguage === 'en') {
      return {
        translatedText: text,
        detectedLanguage: 'en',
        confidence: 1.0
      };
    }

    // Simple word-by-word translation for demo
    let translatedText = text;
    for (const [original, translation] of Object.entries(this.translations)) {
      const regex = new RegExp(original, 'gi');
      translatedText = translatedText.replace(regex, translation);
    }

    return {
      translatedText,
      detectedLanguage,
      confidence: 0.8
    };
  }

  async detectLanguage(text: string): Promise<string> {
    return LanguageDetector.detectLanguage(text);
  }
}

// Google Translate integration (requires API key)
export class GoogleTranslateService implements TranslationService {
  constructor(private apiKey: string) {}

  async translate(text: string, targetLanguage: string = 'en'): Promise<TranslationResult> {
    if (!this.apiKey) {
      throw new Error('Google Translate API key not configured');
    }

    try {
      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: text,
            target: targetLanguage,
            format: 'text'
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Google Translate API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const translation = data.data.translations[0];

      return {
        translatedText: translation.translatedText,
        detectedLanguage: translation.detectedSourceLanguage,
        confidence: 1.0
      };
    } catch (error) {
      console.warn('Google Translate failed, falling back to mock service:', error);
      // Fallback to mock service
      const mockService = new MockTranslationService();
      return await mockService.translate(text, targetLanguage);
    }
  }

  async detectLanguage(text: string): Promise<string> {
    if (!this.apiKey) {
      return LanguageDetector.detectLanguage(text);
    }

    try {
      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2/detect?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: text
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Google Translate API error: ${response.status}`);
      }

      const data = await response.json() as any;
      return data.data.detections[0][0].language;
    } catch (error) {
      console.warn('Language detection failed, using fallback:', error);
      return LanguageDetector.detectLanguage(text);
    }
  }
}

// Factory function to create appropriate translation service
export function createTranslationService(): TranslationService {
  const googleApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  
  if (googleApiKey) {
    console.log('Using Google Translate service');
    return new GoogleTranslateService(googleApiKey);
  } else {
    console.log('Using mock translation service (set GOOGLE_TRANSLATE_API_KEY for production)');
    return new MockTranslationService();
  }
}