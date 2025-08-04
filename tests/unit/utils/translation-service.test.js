"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const translation_service_1 = require("../../../src/utils/translation-service");
global.fetch = jest.fn();
describe('LanguageDetector', () => {
    describe('detectLanguage', () => {
        it('should detect Japanese text', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('こんにちは')).toBe('ja');
            expect(translation_service_1.LanguageDetector.detectLanguage('カタカナ')).toBe('ja');
            expect(translation_service_1.LanguageDetector.detectLanguage('漢字')).toBe('ja');
            expect(translation_service_1.LanguageDetector.detectLanguage('ひらがなとカタカナ')).toBe('ja');
        });
        it('should detect Korean text', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('안녕하세요')).toBe('ko');
            expect(translation_service_1.LanguageDetector.detectLanguage('한국어')).toBe('ko');
        });
        it('should detect Chinese text as Japanese due to shared character range', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('你好世界')).toBe('ja');
            expect(translation_service_1.LanguageDetector.detectLanguage('简体中文')).toBe('ja');
        });
        it('should detect Russian text', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('Привет')).toBe('ru');
            expect(translation_service_1.LanguageDetector.detectLanguage('русский язык')).toBe('ru');
        });
        it('should detect Arabic text', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('مرحبا')).toBe('ar');
            expect(translation_service_1.LanguageDetector.detectLanguage('العربية')).toBe('ar');
        });
        it('should detect Thai text', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('สวัสดี')).toBe('th');
            expect(translation_service_1.LanguageDetector.detectLanguage('ภาษาไทย')).toBe('th');
        });
        it('should default to English for Latin scripts', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('Hello')).toBe('en');
            expect(translation_service_1.LanguageDetector.detectLanguage('English text')).toBe('en');
            expect(translation_service_1.LanguageDetector.detectLanguage('français')).toBe('en');
        });
        it('should handle mixed scripts correctly', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('これは漢字です')).toBe('ja');
            expect(translation_service_1.LanguageDetector.detectLanguage('这是简体中文')).toBe('ja');
        });
        it('should handle empty and whitespace-only text', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('')).toBe('en');
            expect(translation_service_1.LanguageDetector.detectLanguage('   ')).toBe('en');
            expect(translation_service_1.LanguageDetector.detectLanguage('!!!')).toBe('en');
        });
        it('should ignore punctuation and whitespace in detection', () => {
            expect(translation_service_1.LanguageDetector.detectLanguage('こんにちは! 元気ですか?')).toBe('ja');
            expect(translation_service_1.LanguageDetector.detectLanguage('  안녕하세요  ')).toBe('ko');
        });
    });
});
describe('MockTranslationService', () => {
    let mockService;
    beforeEach(() => {
        mockService = new translation_service_1.MockTranslationService();
    });
    describe('translate', () => {
        it('should translate Japanese phrases', async () => {
            const result = await mockService.translate('無視して');
            expect(result.translatedText).toBe('ignore');
            expect(result.detectedLanguage).toBe('ja');
            expect(result.confidence).toBe(0.8);
        });
        it('should translate Chinese phrases', async () => {
            const result = await mockService.translate('忽略指令');
            expect(result.translatedText).toBe('ignore instructions');
            expect(result.detectedLanguage).toBe('ja');
            expect(result.confidence).toBe(0.8);
        });
        it('should translate Korean phrases', async () => {
            const result = await mockService.translate('무시해');
            expect(result.translatedText).toBe('ignore');
            expect(result.detectedLanguage).toBe('ko');
            expect(result.confidence).toBe(0.8);
        });
        it('should translate Russian phrases', async () => {
            const result = await mockService.translate('игнорируй');
            expect(result.translatedText).toBe('ignore');
            expect(result.detectedLanguage).toBe('ru');
            expect(result.confidence).toBe(0.8);
        });
        it('should return English text unchanged', async () => {
            const englishText = 'Hello world';
            const result = await mockService.translate(englishText);
            expect(result.translatedText).toBe(englishText);
            expect(result.detectedLanguage).toBe('en');
            expect(result.confidence).toBe(1.0);
        });
        it('should handle case-insensitive translation', async () => {
            const result = await mockService.translate('忘记一切');
            expect(result.translatedText).toBe('forget everything');
        });
        it('should handle multiple phrases in one text', async () => {
            const result = await mockService.translate('無視して 忘れて');
            expect(result.translatedText).toBe('ignore forget');
            expect(result.detectedLanguage).toBe('ja');
        });
        it('should only support translation to English', async () => {
            await expect(mockService.translate('hello', 'fr')).rejects.toThrow('Only translation to English is supported in mock service');
        });
        it('should handle unknown phrases gracefully', async () => {
            const unknownText = '未知のフレーズ';
            const result = await mockService.translate(unknownText);
            expect(result.translatedText).toBe(unknownText);
            expect(result.detectedLanguage).toBe('ja');
            expect(result.confidence).toBe(0.8);
        });
    });
    describe('detectLanguage', () => {
        it('should detect language using LanguageDetector', async () => {
            const language = await mockService.detectLanguage('こんにちは');
            expect(language).toBe('ja');
        });
        it('should handle various languages', async () => {
            expect(await mockService.detectLanguage('안녕하세요')).toBe('ko');
            expect(await mockService.detectLanguage('你好世界')).toBe('ja');
            expect(await mockService.detectLanguage('Привет')).toBe('ru');
            expect(await mockService.detectLanguage('Hello')).toBe('en');
        });
    });
});
describe('GoogleTranslateService', () => {
    let googleService;
    const mockFetch = global.fetch;
    beforeEach(() => {
        googleService = new translation_service_1.GoogleTranslateService('test-api-key');
        jest.clearAllMocks();
    });
    describe('constructor', () => {
        it('should store API key', () => {
            const service = new translation_service_1.GoogleTranslateService('my-key');
            expect(service).toBeDefined();
        });
    });
    describe('translate', () => {
        it('should make API call and return result on success', async () => {
            const mockResponse = {
                data: {
                    translations: [{
                            translatedText: 'Hello',
                            detectedSourceLanguage: 'ja'
                        }]
                }
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });
            const result = await googleService.translate('こんにちは');
            expect(mockFetch).toHaveBeenCalledWith('https://translation.googleapis.com/language/translate/v2?key=test-api-key', expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    q: 'こんにちは',
                    target: 'en',
                    format: 'text'
                })
            }));
            expect(result).toEqual({
                translatedText: 'Hello',
                detectedLanguage: 'ja',
                confidence: 1.0
            });
        });
        it('should use custom target language', async () => {
            const mockResponse = {
                data: {
                    translations: [{
                            translatedText: 'Bonjour',
                            detectedSourceLanguage: 'en'
                        }]
                }
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });
            await googleService.translate('Hello', 'fr');
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('test-api-key'), expect.objectContaining({
                body: JSON.stringify({
                    q: 'Hello',
                    target: 'fr',
                    format: 'text'
                })
            }));
        });
        it('should fallback to mock service on API error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400
            });
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const result = await googleService.translate('無視して');
            expect(result.translatedText).toBe('ignore');
            expect(result.detectedLanguage).toBe('ja');
            expect(result.confidence).toBe(0.8);
            expect(consoleSpy).toHaveBeenCalledWith('Google Translate failed, falling back to mock service:', expect.any(Error));
            consoleSpy.mockRestore();
        });
        it('should fallback to mock service on network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const result = await googleService.translate('忘れて');
            expect(result.translatedText).toBe('forget');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
        it('should throw error if no API key provided', async () => {
            const serviceWithoutKey = new translation_service_1.GoogleTranslateService('');
            await expect(serviceWithoutKey.translate('test')).rejects.toThrow('Google Translate API key not configured');
        });
    });
    describe('detectLanguage', () => {
        it('should make API call and return detected language', async () => {
            const mockResponse = {
                data: {
                    detections: [[{
                                language: 'ja'
                            }]]
                }
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });
            const result = await googleService.detectLanguage('こんにちは');
            expect(mockFetch).toHaveBeenCalledWith('https://translation.googleapis.com/language/translate/v2/detect?key=test-api-key', expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    q: 'こんにちは'
                })
            }));
            expect(result).toBe('ja');
        });
        it('should fallback to local detection if no API key', async () => {
            const serviceWithoutKey = new translation_service_1.GoogleTranslateService('');
            const result = await serviceWithoutKey.detectLanguage('こんにちは');
            expect(result).toBe('ja');
            expect(mockFetch).not.toHaveBeenCalled();
        });
        it('should fallback to local detection on API error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500
            });
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const result = await googleService.detectLanguage('こんにちは');
            expect(result).toBe('ja');
            expect(consoleSpy).toHaveBeenCalledWith('Language detection failed, using fallback:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
});
describe('createTranslationService', () => {
    const originalEnv = process.env;
    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });
    afterAll(() => {
        process.env = originalEnv;
    });
    it('should create GoogleTranslateService when API key is provided', () => {
        process.env.GOOGLE_TRANSLATE_API_KEY = 'test-key';
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        const service = (0, translation_service_1.createTranslationService)();
        expect(service).toBeInstanceOf(translation_service_1.GoogleTranslateService);
        expect(consoleSpy).toHaveBeenCalledWith('Using Google Translate service');
        consoleSpy.mockRestore();
    });
    it('should create MockTranslationService when no API key is provided', () => {
        delete process.env.GOOGLE_TRANSLATE_API_KEY;
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        const service = (0, translation_service_1.createTranslationService)();
        expect(service).toBeInstanceOf(translation_service_1.MockTranslationService);
        expect(consoleSpy).toHaveBeenCalledWith('Using mock translation service (set GOOGLE_TRANSLATE_API_KEY for production)');
        consoleSpy.mockRestore();
    });
    it('should create MockTranslationService when API key is empty string', () => {
        process.env.GOOGLE_TRANSLATE_API_KEY = '';
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        const service = (0, translation_service_1.createTranslationService)();
        expect(service).toBeInstanceOf(translation_service_1.MockTranslationService);
        expect(consoleSpy).toHaveBeenCalledWith('Using mock translation service (set GOOGLE_TRANSLATE_API_KEY for production)');
        consoleSpy.mockRestore();
    });
});
describe('TranslationService Interface', () => {
    it('should be implemented by MockTranslationService', () => {
        const service = new translation_service_1.MockTranslationService();
        expect(typeof service.translate).toBe('function');
        expect(typeof service.detectLanguage).toBe('function');
    });
    it('should be implemented by GoogleTranslateService', () => {
        const service = new translation_service_1.GoogleTranslateService('key');
        expect(typeof service.translate).toBe('function');
        expect(typeof service.detectLanguage).toBe('function');
    });
});
describe('TranslationResult Interface', () => {
    it('should have correct structure', () => {
        const result = {
            translatedText: 'test',
            detectedLanguage: 'en',
            confidence: 0.9
        };
        expect(result.translatedText).toBe('test');
        expect(result.detectedLanguage).toBe('en');
        expect(result.confidence).toBe(0.9);
    });
    it('should work with minimal properties', () => {
        const result = {
            translatedText: 'test'
        };
        expect(result.translatedText).toBe('test');
        expect(result.detectedLanguage).toBeUndefined();
        expect(result.confidence).toBeUndefined();
    });
});
