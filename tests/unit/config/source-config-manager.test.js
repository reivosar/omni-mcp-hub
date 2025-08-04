"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const source_config_manager_1 = require("../../../src/config/source-config-manager");
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
describe('SourceConfigManager', () => {
    let configManager;
    let testConfigDir;
    let testConfigPath;
    let originalEnv;
    beforeEach(() => {
        configManager = new source_config_manager_1.SourceConfigManager();
        testConfigDir = path_1.default.join('/tmp', 'test-config-' + Date.now());
        testConfigPath = path_1.default.join(testConfigDir, 'test-config.yaml');
        originalEnv = { ...process.env };
        fs_extra_1.default.ensureDirSync(testConfigDir);
    });
    afterEach(() => {
        fs_extra_1.default.removeSync(testConfigDir);
        Object.keys(process.env).forEach(key => {
            if (!(key in originalEnv)) {
                delete process.env[key];
            }
        });
        Object.assign(process.env, originalEnv);
    });
    describe('Config Loading', () => {
        it('should load valid configuration from YAML', () => {
            const config = {
                server: { port: 3000 },
                files: {
                    patterns: ['*.md', '*.txt'],
                    max_size: 2097152
                },
                fetch: {
                    timeout: 60000,
                    retries: 3,
                    retry_delay: 1000,
                    max_depth: 3
                }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const loadedConfig = configManager.getConfig();
            expect(loadedConfig.server.port).toBe(3000);
            expect(loadedConfig.files.patterns).toEqual(['*.md', '*.txt']);
            expect(loadedConfig.fetch.timeout).toBe(60000);
        });
        it('should use default configuration when no config file exists', () => {
            process.env.CONFIG_PATH = '/nonexistent/path.yaml';
            const config = configManager.getConfig();
            expect(config).toBeDefined();
            expect(config.files).toBeDefined();
            expect(config.fetch).toBeDefined();
        });
        it('should load minimal configuration successfully', () => {
            const minimalConfig = {
                server: { port: 3000 },
                files: { patterns: ['*.md'], max_size: 1048576 },
                fetch: { timeout: 30000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(minimalConfig));
            process.env.CONFIG_PATH = testConfigPath;
            const config = configManager.getConfig();
            expect(config.server.port).toBe(3000);
            expect(config.files).toBeDefined();
            expect(config.fetch).toBeDefined();
        });
    });
    describe('Environment Variable Substitution', () => {
        it('should substitute environment variables in config', () => {
            process.env.TEST_PORT = '4000';
            process.env.TEST_TOKEN = 'secret-token';
            const config = {
                server: { port: '${TEST_PORT}' },
                github_sources: [{
                        url: 'github:user/repo',
                        token: '${TEST_TOKEN}'
                    }],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const loadedConfig = configManager.getConfig();
            expect(loadedConfig.server.port).toBe('4000');
            expect(loadedConfig.github_sources[0].token).toBe('secret-token');
        });
        it('should substitute missing environment variables with empty string', () => {
            const config = {
                server: { port: 3000 },
                github_sources: [{
                        url: 'github:user/repo',
                        token: '${MISSING_TOKEN}'
                    }],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const loadedConfig = configManager.getConfig();
            expect(loadedConfig.github_sources[0].token).toBe('');
        });
        it('should handle nested environment variable substitution', () => {
            process.env.BASE_URL = 'https://api.github.com';
            process.env.API_VERSION = 'v3';
            const config = {
                server: { port: 3000 },
                api: {
                    endpoint: '${BASE_URL}/${API_VERSION}'
                },
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const loadedConfig = configManager.getConfig();
            expect(loadedConfig.api.endpoint).toBe('https://api.github.com/v3');
        });
    });
    describe('Source Parsing', () => {
        it('should parse GitHub sources correctly', () => {
            const config = {
                github_sources: [
                    {
                        url: 'github:microsoft/vscode',
                        branch: 'main',
                        token: 'token1',
                        patterns: ['docs/*.md']
                    },
                    {
                        url: 'github:facebook/react',
                        branch: 'develop',
                        token: 'token2'
                    }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources).toHaveLength(2);
            expect(sources[0]).toMatchObject({
                type: 'github',
                url: 'github:microsoft/vscode',
                branch: 'main',
                token: 'token1'
            });
        });
        it('should parse local sources correctly', () => {
            const config = {
                local_sources: [
                    { url: './src' },
                    { url: '/absolute/path' },
                    { url: '~/home/path' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources).toHaveLength(3);
            expect(sources[0]).toMatchObject({ type: 'local', url: './src' });
            expect(sources[1]).toMatchObject({ type: 'local', url: '/absolute/path' });
        });
        it('should handle sources as provided without auto-parsing when type is github', () => {
            const config = {
                github_sources: [
                    { url: 'invalid-format' },
                    { url: 'github:' },
                    { url: 'github:user/' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources).toHaveLength(3);
            expect(sources[0]).toMatchObject({ type: 'github', url: 'invalid-format' });
        });
    });
    describe('Security Validation', () => {
        it('should validate dangerous patterns in configuration', () => {
            const config = {
                files: {
                    patterns: ['*.md'],
                    max_size: 2097152
                },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 },
                security: {
                    content_validation: {
                        enabled: true,
                        reject_patterns: [
                            'rm -rf /',
                            'eval(',
                            '$(curl'
                        ]
                    }
                }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const loadedConfig = configManager.getConfig();
            expect(loadedConfig.security?.content_validation?.reject_patterns).toContain('rm -rf /');
        });
        it('should accept negative file size limits without validation', () => {
            const config = {
                files: {
                    patterns: ['*.md'],
                    max_size: -1
                },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const loadedConfig = configManager.getConfig();
            expect(loadedConfig.files.max_size).toBe(-1);
        });
    });
    describe('Edge Cases', () => {
        it('should handle empty configuration file', () => {
            fs_extra_1.default.writeFileSync(testConfigPath, '');
            process.env.CONFIG_PATH = testConfigPath;
            expect(() => configManager.getConfig()).toThrow();
        });
        it('should handle malformed YAML', () => {
            fs_extra_1.default.writeFileSync(testConfigPath, 'invalid: yaml: content: [unclosed');
            process.env.CONFIG_PATH = testConfigPath;
            expect(() => configManager.getConfig()).toThrow(/yaml|parse/i);
        });
        it('should handle circular environment variable references by leaving them as-is', () => {
            process.env.VAR1 = '${VAR2}';
            process.env.VAR2 = '${VAR1}';
            const config = {
                server: { port: '${VAR1}' },
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const loadedConfig = configManager.getConfig();
            expect(typeof loadedConfig.server.port).toBe('string');
        });
        it('should handle deeply nested configuration', () => {
            const config = {
                server: { port: 3000 },
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 },
                deep: {
                    level1: {
                        level2: {
                            level3: {
                                value: 'deep-value'
                            }
                        }
                    }
                }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const loadedConfig = configManager.getConfig();
            expect(loadedConfig.deep.level1.level2.level3.value).toBe('deep-value');
        });
    });
    describe('Configuration Caching', () => {
        it('should cache configuration after first load', () => {
            const config = {
                server: { port: 3000 },
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const config1 = configManager.getConfig();
            config.server.port = 4000;
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            const config2 = configManager.getConfig();
            expect(config2.server.port).toBe(3000);
        });
        it('should clear cache when clearCache is called', () => {
            const config = {
                server: { port: 3000 },
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const config1 = configManager.getConfig();
            expect(config1.server.port).toBe(3000);
            config.server.port = 4000;
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            configManager.clearCache();
            const config2 = configManager.getConfig();
            expect(config2.server.port).toBe(4000);
        });
    });
    describe('Real-world Scenarios', () => {
        it('should handle production-like configuration', () => {
            const prodConfig = {
                server: {
                    port: '${PORT}',
                    host: '${HOST}'
                },
                github_sources: [
                    {
                        url: 'github:microsoft/vscode',
                        branch: '${VSCODE_BRANCH}',
                        token: '${GITHUB_TOKEN}',
                        patterns: ['docs/**/*.md', 'README.md', 'CONTRIBUTING.md']
                    }
                ],
                local_sources: [
                    { url: '${LOCAL_DOCS_PATH}' }
                ],
                files: {
                    patterns: ['*.md', '*.mdx', 'docs/**/*.md'],
                    max_size: '${MAX_FILE_SIZE}',
                    ignore_patterns: ['node_modules/**', 'dist/**', '.git/**']
                },
                fetch: {
                    timeout: '${FETCH_TIMEOUT}',
                    retries: '${FETCH_RETRIES}',
                    retry_delay: 1000,
                    max_depth: 5,
                    concurrent_requests: '${MAX_CONCURRENT}'
                },
                security: {
                    content_validation: {
                        enabled: '${ENABLE_VALIDATION}',
                        max_file_size: 5242880,
                        reject_patterns: [
                            'eval(',
                            'exec(',
                            'rm -rf',
                            '__proto__',
                            'constructor.constructor'
                        ]
                    },
                    rate_limiting: {
                        enabled: true,
                        max_requests_per_minute: 60
                    }
                },
                cache: {
                    type: '${CACHE_TYPE}',
                    ttl: '${CACHE_TTL}',
                    max_size: '${CACHE_MAX_SIZE}'
                }
            };
            process.env.PORT = '8080';
            process.env.HOST = '0.0.0.0';
            process.env.GITHUB_TOKEN = 'prod-token';
            process.env.VSCODE_BRANCH = 'main';
            process.env.LOCAL_DOCS_PATH = './docs';
            process.env.MAX_FILE_SIZE = '2097152';
            process.env.FETCH_TIMEOUT = '60000';
            process.env.FETCH_RETRIES = '3';
            process.env.MAX_CONCURRENT = '10';
            process.env.ENABLE_VALIDATION = 'true';
            process.env.CACHE_TYPE = 'memory';
            process.env.CACHE_TTL = '3600';
            process.env.CACHE_MAX_SIZE = '1073741824';
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(prodConfig));
            process.env.CONFIG_PATH = testConfigPath;
            const loadedConfig = configManager.getConfig();
            expect(loadedConfig.server.port).toBe('8080');
            expect(loadedConfig.github_sources[0].token).toBe('prod-token');
            expect(loadedConfig.security?.content_validation?.enabled).toBe('true');
        });
    });
    describe('Auto-detection and URL Parsing', () => {
        it('should auto-detect GitHub URLs with various formats', () => {
            const config = {
                sources: [
                    { url: 'https://github.com/microsoft/vscode' },
                    { url: 'https://github.com/facebook/react/tree/main' },
                    { url: 'github:google/tensorflow@v2.0' },
                    { url: 'owner/repo@branch' },
                    { url: 'simple/repo' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources).toHaveLength(5);
            expect(sources[0]).toMatchObject({
                type: 'github',
                owner: 'microsoft',
                repo: 'vscode',
                branch: 'main'
            });
            expect(sources[1]).toMatchObject({
                type: 'github',
                owner: 'facebook',
                repo: 'react',
                branch: 'main'
            });
            expect(sources[2]).toMatchObject({
                type: 'github',
                owner: 'google',
                repo: 'tensorflow',
                branch: 'v2.0'
            });
            expect(sources[3]).toMatchObject({
                type: 'github',
                owner: 'owner',
                repo: 'repo',
                branch: 'branch'
            });
            expect(sources[4]).toMatchObject({
                type: 'github',
                owner: 'simple',
                repo: 'repo',
                branch: 'main'
            });
        });
        it('should auto-detect local paths with various formats', () => {
            const config = {
                sources: [
                    { url: '/absolute/path' },
                    { url: './relative/path' },
                    { url: '../parent/path' },
                    { url: 'file:///file/protocol/path' },
                    { url: 'C:\\Windows\\Path' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources).toHaveLength(5);
            expect(sources[0]).toMatchObject({
                type: 'local',
                path: '/absolute/path'
            });
            expect(sources[1]).toMatchObject({
                type: 'local',
                path: './relative/path'
            });
            expect(sources[2]).toMatchObject({
                type: 'local',
                path: '../parent/path'
            });
            expect(sources[3]).toMatchObject({
                type: 'local',
                path: '/file/protocol/path'
            });
            expect(sources[4]).toMatchObject({
                type: 'local',
                path: 'C:\\Windows\\Path'
            });
        });
        it('should handle auto-detection errors gracefully', () => {
            const config = {
                sources: [
                    { url: 'invalid-format-not-matching-any-pattern' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            expect(() => configManager.getConfig()).toThrow(/Unable to auto-detect/);
        });
        it('should preserve existing config values when auto-detecting', () => {
            const config = {
                sources: [
                    {
                        url: 'github:owner/repo',
                        token: 'existing-token',
                        custom_field: 'custom-value'
                    }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources[0]).toMatchObject({
                type: 'github',
                owner: 'owner',
                repo: 'repo',
                branch: 'main',
                token: 'existing-token',
                custom_field: 'custom-value'
            });
        });
        it('should handle sources with type but no URL', () => {
            const config = {
                sources: [
                    { type: 'github', owner: 'manual', repo: 'config' },
                    { type: 'local', path: '/manual/path' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources).toHaveLength(2);
            expect(sources[0]).toMatchObject({ type: 'github', owner: 'manual', repo: 'config' });
            expect(sources[1]).toMatchObject({ type: 'local', path: '/manual/path' });
        });
    });
    describe('Sources Environment Variable Parsing', () => {
        it('should parse sources from SOURCES environment variable', () => {
            process.env.SOURCES = 'github:owner/repo@branch,/local/path,./relative/path';
            process.env.CONFIG_PATH = '/nonexistent/config.yaml';
            const config = configManager.getConfig();
            expect(config.github_sources).toHaveLength(0);
            expect(config.local_sources).toHaveLength(3);
        });
        it('should handle empty SOURCES environment variable', () => {
            delete process.env.SOURCES;
            process.env.CONFIG_PATH = '/nonexistent/config.yaml';
            const config = configManager.getConfig();
            expect(config.github_sources).toEqual([]);
            expect(config.local_sources).toEqual([]);
        });
        it('should handle malformed sources in environment variable', () => {
            process.env.SOURCES = 'invalid-url';
            process.env.CONFIG_PATH = '/nonexistent/config.yaml';
            const config = configManager.getConfig();
            expect(config.github_sources).toEqual([]);
            expect(config.local_sources).toEqual([{ type: 'local', path: 'invalid-url' }]);
        });
    });
    describe('Default Configuration', () => {
        it('should generate default config with environment variables', () => {
            process.env.MCP_PORT = '8080';
            process.env.FILE_PATTERNS = '*.md,*.txt,docs/*.md';
            process.env.MAX_FILE_SIZE = '2097152';
            process.env.FETCH_TIMEOUT = '45000';
            process.env.FETCH_RETRIES = '5';
            process.env.FETCH_RETRY_DELAY = '2000';
            process.env.FETCH_MAX_DEPTH = '4';
            process.env.CONTENT_VALIDATION_ENABLED = 'false';
            process.env.CONTENT_REJECT_PATTERNS = 'eval,exec';
            process.env.CONTENT_REJECT_KEYWORDS = 'dangerous,harmful';
            process.env.CONFIG_PATH = '/nonexistent/config.yaml';
            const config = configManager.getConfig();
            expect(config.server.port).toBe(8080);
            expect(config.files.patterns).toEqual(['*.md', '*.txt', 'docs/*.md']);
            expect(config.files.max_size).toBe(2097152);
            expect(config.fetch.timeout).toBe(45000);
            expect(config.fetch.retries).toBe(5);
            expect(config.fetch.retry_delay).toBe(2000);
            expect(config.fetch.max_depth).toBe(4);
            expect(config.security?.content_validation?.enabled).toBe(false);
            expect(config.security?.content_validation?.reject_patterns).toEqual(['eval', 'exec']);
            expect(config.security?.content_validation?.additional_keywords).toEqual(['dangerous', 'harmful']);
        });
        it('should use default values when environment variables are missing', () => {
            delete process.env.MCP_PORT;
            delete process.env.PORT;
            delete process.env.FILE_PATTERNS;
            process.env.CONFIG_PATH = '/nonexistent/config.yaml';
            const config = configManager.getConfig();
            expect(config.server.port).toBe(3000);
            expect(config.files.patterns).toEqual(['CLAUDE.md']);
            expect(config.fetch.timeout).toBe(30000);
            expect(config.fetch.retries).toBe(3);
        });
    });
    describe('getSources Method', () => {
        it('should return legacy sources when they exist', () => {
            const config = {
                sources: [
                    { type: 'github', owner: 'legacy', repo: 'repo1' },
                    { type: 'local', path: '/legacy/path' }
                ],
                github_sources: [
                    { url: 'github:new/repo' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources).toHaveLength(2);
            expect(sources[0]).toMatchObject({ type: 'github', owner: 'legacy', repo: 'repo1' });
            expect(sources[1]).toMatchObject({ type: 'local', path: '/legacy/path' });
        });
        it('should combine github_sources and local_sources when legacy sources absent', () => {
            const config = {
                github_sources: [
                    { url: 'github:owner1/repo1' },
                    { url: 'github:owner2/repo2' }
                ],
                local_sources: [
                    { url: '/path1' },
                    { url: '/path2' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources).toHaveLength(4);
            expect(sources.filter(s => s.type === 'github')).toHaveLength(2);
            expect(sources.filter(s => s.type === 'local')).toHaveLength(2);
        });
        it('should return empty array when no sources exist', () => {
            const config = {
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const sources = configManager.getSources();
            expect(sources).toEqual([]);
        });
    });
    describe('getSourcesAsEnvFormat Method', () => {
        it('should format sources as environment variable string', () => {
            const config = {
                github_sources: [
                    { url: 'github:owner1/repo1', owner: 'owner1', repo: 'repo1' },
                    { url: 'github:owner2/repo2', owner: 'owner2', repo: 'repo2' }
                ],
                local_sources: [
                    { url: '/path1', path: '/path1' },
                    { url: '/path2', path: '/path2' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const envFormat = configManager.getSourcesAsEnvFormat();
            expect(envFormat).toBe('github:owner1/repo1,github:owner2/repo2,local:/path1,local:/path2');
        });
        it('should handle empty sources list', () => {
            const config = {
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const envFormat = configManager.getSourcesAsEnvFormat();
            expect(envFormat).toBe('');
        });
        it('should filter out invalid source types', () => {
            const config = {
                sources: [
                    { type: 'github', owner: 'valid', repo: 'repo' },
                    { type: 'local', path: '/valid/path' },
                    { type: 'invalid' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            const envFormat = configManager.getSourcesAsEnvFormat();
            expect(envFormat.split(',').filter(s => s)).toHaveLength(2);
            expect(envFormat).toContain('github:valid/repo');
            expect(envFormat).toContain('local:/valid/path');
        });
    });
    describe('Static Methods', () => {
        it('should return config examples', () => {
            const examples = source_config_manager_1.SourceConfigManager.getConfigExamples();
            expect(examples).toContain('sources:');
            expect(examples).toContain('github:');
            expect(examples).toContain('https://github.com/');
            expect(examples).toContain('type: github');
            expect(examples).toContain('type: local');
            expect(examples).toContain('Auto-detection');
        });
    });
    describe('Error Handling', () => {
        it('should handle invalid source objects', () => {
            const config = {
                sources: [
                    null,
                    'invalid-string',
                    123,
                    { url: 'github:valid/repo' }
                ],
                files: { patterns: ['*.md'], max_size: 2097152 },
                fetch: { timeout: 60000, retries: 3, retry_delay: 1000, max_depth: 3 }
            };
            fs_extra_1.default.writeFileSync(testConfigPath, js_yaml_1.default.dump(config));
            process.env.CONFIG_PATH = testConfigPath;
            expect(() => configManager.getConfig()).toThrow(/Invalid source configuration/);
        });
        it('should handle file read errors gracefully', () => {
            fs_extra_1.default.ensureDirSync(testConfigPath);
            process.env.CONFIG_PATH = testConfigPath;
            expect(() => configManager.getConfig()).toThrow();
        });
        it('should handle YAML parsing errors', () => {
            fs_extra_1.default.writeFileSync(testConfigPath, 'invalid: yaml: [unclosed');
            process.env.CONFIG_PATH = testConfigPath;
            expect(() => configManager.getConfig()).toThrow();
        });
    });
});
