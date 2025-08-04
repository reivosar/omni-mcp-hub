"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
describe('JSON-RPC Types', () => {
    describe('JSONRPCRequest', () => {
        it('should create valid JSON-RPC request', () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'test',
                params: { key: 'value' }
            };
            expect(request.jsonrpc).toBe('2.0');
            expect(request.id).toBe(1);
            expect(request.method).toBe('test');
            expect(request.params).toEqual({ key: 'value' });
        });
        it('should work with string ID', () => {
            const request = {
                jsonrpc: '2.0',
                id: 'test-id',
                method: 'test'
            };
            expect(request.id).toBe('test-id');
        });
        it('should work without params', () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'test'
            };
            expect(request.params).toBeUndefined();
        });
        it('should have readonly properties enforced at compile time', () => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'test'
            };
            expect(request.jsonrpc).toBe('2.0');
            expect(request.id).toBe(1);
            expect(request.method).toBe('test');
        });
    });
    describe('JSONRPCResponse', () => {
        it('should create valid JSON-RPC response with result', () => {
            const response = {
                jsonrpc: '2.0',
                id: 1,
                result: { success: true }
            };
            expect(response.jsonrpc).toBe('2.0');
            expect(response.id).toBe(1);
            expect(response.result).toEqual({ success: true });
            expect(response.error).toBeUndefined();
        });
        it('should create valid JSON-RPC response with error', () => {
            const error = {
                code: -32600,
                message: 'Invalid Request'
            };
            const response = {
                jsonrpc: '2.0',
                id: 1,
                error
            };
            expect(response.jsonrpc).toBe('2.0');
            expect(response.id).toBe(1);
            expect(response.error).toEqual(error);
            expect(response.result).toBeUndefined();
        });
    });
    describe('JSONRPCNotification', () => {
        it('should create valid JSON-RPC notification', () => {
            const notification = {
                jsonrpc: '2.0',
                method: 'notify',
                params: { message: 'test' }
            };
            expect(notification.jsonrpc).toBe('2.0');
            expect(notification.method).toBe('notify');
            expect(notification.params).toEqual({ message: 'test' });
            expect('id' in notification).toBe(false);
        });
        it('should work without params', () => {
            const notification = {
                jsonrpc: '2.0',
                method: 'notify'
            };
            expect(notification.params).toBeUndefined();
        });
    });
    describe('JSONRPCError', () => {
        it('should create valid JSON-RPC error', () => {
            const error = {
                code: -32600,
                message: 'Invalid Request',
                data: { additional: 'info' }
            };
            expect(error.code).toBe(-32600);
            expect(error.message).toBe('Invalid Request');
            expect(error.data).toEqual({ additional: 'info' });
        });
        it('should work without data', () => {
            const error = {
                code: -32601,
                message: 'Method not found'
            };
            expect(error.data).toBeUndefined();
        });
    });
});
describe('Documentation Types', () => {
    describe('FetchDocumentationParams', () => {
        it('should create valid fetch params', () => {
            const params = {
                owner: 'test-owner',
                repo: 'test-repo',
                branch: 'main',
                include_externals: true
            };
            expect(params.owner).toBe('test-owner');
            expect(params.repo).toBe('test-repo');
            expect(params.branch).toBe('main');
            expect(params.include_externals).toBe(true);
        });
        it('should work with minimal params', () => {
            const params = {
                owner: 'test-owner',
                repo: 'test-repo'
            };
            expect(params.branch).toBeUndefined();
            expect(params.include_externals).toBeUndefined();
        });
    });
    describe('DocumentationFile', () => {
        it('should create valid documentation file', () => {
            const file = {
                path: 'README.md',
                content: '# Test README',
                error: false
            };
            expect(file.path).toBe('README.md');
            expect(file.content).toBe('# Test README');
            expect(file.error).toBe(false);
        });
        it('should work without error flag', () => {
            const file = {
                path: 'docs/guide.md',
                content: 'Guide content'
            };
            expect(file.error).toBeUndefined();
        });
        it('should handle error case', () => {
            const file = {
                path: 'missing.md',
                content: '',
                error: true
            };
            expect(file.error).toBe(true);
        });
    });
    describe('ExternalReference', () => {
        it('should create valid external reference', () => {
            const ref = {
                url: 'https://example.com/doc',
                content: 'External content',
                error: false,
                depth: 1
            };
            expect(ref.url).toBe('https://example.com/doc');
            expect(ref.content).toBe('External content');
            expect(ref.error).toBe(false);
            expect(ref.depth).toBe(1);
        });
        it('should work with minimal properties', () => {
            const ref = {
                url: 'https://example.com/doc',
                content: 'Content'
            };
            expect(ref.error).toBeUndefined();
            expect(ref.depth).toBeUndefined();
        });
    });
});
describe('Progress and Options Types', () => {
    describe('StreamProgress', () => {
        it('should create valid stream progress', () => {
            const progress = {
                status: 'fetching_files',
                owner: 'test-owner',
                repo: 'test-repo',
                branch: 'main',
                url: 'https://github.com/test-owner/test-repo',
                progress: {
                    current: 5,
                    total: 10
                }
            };
            expect(progress.status).toBe('fetching_files');
            expect(progress.owner).toBe('test-owner');
            expect(progress.repo).toBe('test-repo');
            expect(progress.branch).toBe('main');
            expect(progress.url).toBe('https://github.com/test-owner/test-repo');
            expect(progress.progress?.current).toBe(5);
            expect(progress.progress?.total).toBe(10);
        });
        it('should work with minimal properties', () => {
            const progress = {
                status: 'complete'
            };
            expect(progress.status).toBe('complete');
            expect(progress.owner).toBeUndefined();
            expect(progress.progress).toBeUndefined();
        });
        it('should validate status values', () => {
            const validStatuses = [
                'starting', 'fetching_files', 'fetching_external', 'complete', 'cache_hit'
            ];
            validStatuses.forEach(status => {
                const progress = { status };
                expect(progress.status).toBe(status);
            });
        });
    });
    describe('FetchOptions', () => {
        it('should create valid fetch options', () => {
            const options = {
                timeout: 5000,
                retries: 3,
                retryDelay: 1000,
                maxDepth: 2
            };
            expect(options.timeout).toBe(5000);
            expect(options.retries).toBe(3);
            expect(options.retryDelay).toBe(1000);
            expect(options.maxDepth).toBe(2);
        });
        it('should work with empty options', () => {
            const options = {};
            expect(options.timeout).toBeUndefined();
            expect(options.retries).toBeUndefined();
            expect(options.retryDelay).toBeUndefined();
            expect(options.maxDepth).toBeUndefined();
        });
    });
    describe('TimeoutFetchOptions', () => {
        it('should create valid timeout fetch options', () => {
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{"test": true}',
                timeout: 10000,
                retries: 2,
                retryDelay: 500
            };
            expect(options.method).toBe('POST');
            expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
            expect(options.body).toBe('{"test": true}');
            expect(options.timeout).toBe(10000);
            expect(options.retries).toBe(2);
            expect(options.retryDelay).toBe(500);
        });
        it('should work with minimal options', () => {
            const options = {};
            expect(options.method).toBeUndefined();
            expect(options.headers).toBeUndefined();
            expect(options.body).toBeUndefined();
            expect(options.timeout).toBeUndefined();
            expect(options.retries).toBeUndefined();
            expect(options.retryDelay).toBeUndefined();
        });
    });
});
describe('Cache and Result Types', () => {
    describe('CachedData', () => {
        it('should create valid cached data', () => {
            const cached = {
                repo: 'test-repo',
                branch: 'main',
                claude_md_files: {
                    'README.md': '# README content',
                    'docs/guide.md': '# Guide content'
                },
                external_refs: {
                    'https://example.com/doc': 'External content'
                },
                fetched_at: '2024-01-01T00:00:00Z'
            };
            expect(cached.repo).toBe('test-repo');
            expect(cached.branch).toBe('main');
            expect(cached.claude_md_files['README.md']).toBe('# README content');
            expect(cached.external_refs['https://example.com/doc']).toBe('External content');
            expect(cached.fetched_at).toBe('2024-01-01T00:00:00Z');
        });
        it('should handle empty collections', () => {
            const cached = {
                repo: 'empty-repo',
                branch: 'main',
                claude_md_files: {},
                external_refs: {},
                fetched_at: '2024-01-01T00:00:00Z'
            };
            expect(Object.keys(cached.claude_md_files)).toHaveLength(0);
            expect(Object.keys(cached.external_refs)).toHaveLength(0);
        });
    });
    describe('ExternalReferenceResult', () => {
        it('should create valid external reference result', () => {
            const result = {
                url: 'https://example.com/doc',
                content: 'Document content',
                references: ['https://example.com/ref1', 'https://example.com/ref2'],
                error: undefined,
                depth: 1
            };
            expect(result.url).toBe('https://example.com/doc');
            expect(result.content).toBe('Document content');
            expect(result.references).toEqual(['https://example.com/ref1', 'https://example.com/ref2']);
            expect(result.error).toBeUndefined();
            expect(result.depth).toBe(1);
        });
        it('should handle error case', () => {
            const result = {
                url: 'https://example.com/missing',
                content: '',
                references: [],
                error: 'Not found',
                depth: 0
            };
            expect(result.error).toBe('Not found');
            expect(result.references).toHaveLength(0);
        });
        it('should handle empty references', () => {
            const result = {
                url: 'https://example.com/standalone',
                content: 'Standalone content',
                references: [],
                depth: 0
            };
            expect(result.references).toEqual([]);
        });
    });
});
describe('Type Safety', () => {
    it('should enforce readonly properties at compile time', () => {
        const request = {
            jsonrpc: '2.0',
            id: 1,
            method: 'test'
        };
        expect(request.jsonrpc).toBe('2.0');
        expect(request.id).toBe(1);
        expect(request.method).toBe('test');
    });
    it('should maintain type safety for nested objects', () => {
        const progress = {
            status: 'fetching_files',
            progress: {
                current: 1,
                total: 10
            }
        };
        expect(progress.progress?.current).toBe(1);
        expect(progress.progress?.total).toBe(10);
        expect(progress.status).toBe('fetching_files');
    });
});
