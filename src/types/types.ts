// Strict TypeScript interfaces for type safety

export interface JSONRPCRequest {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly result?: unknown;
  readonly error?: JSONRPCError;
}

export interface JSONRPCNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface JSONRPCError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface FetchDocumentationParams {
  readonly owner: string;
  readonly repo: string;
  readonly branch?: string;
  readonly include_externals?: boolean;
}

export interface DocumentationFile {
  readonly path: string;
  readonly content: string;
  readonly error?: boolean;
}

export interface ExternalReference {
  readonly url: string;
  readonly content: string;
  readonly error?: boolean;
  readonly depth?: number; // For recursive tracking
}

export interface StreamProgress {
  readonly status: 'starting' | 'fetching_files' | 'fetching_external' | 'complete' | 'cache_hit';
  readonly owner?: string;
  readonly repo?: string;
  readonly branch?: string;
  readonly url?: string;
  readonly progress?: {
    readonly current: number;
    readonly total: number;
  };
}

export interface FetchOptions {
  readonly timeout?: number;
  readonly retries?: number;
  readonly retryDelay?: number;
  readonly maxDepth?: number;
}

export interface CachedData {
  readonly repo: string;
  readonly branch: string;
  readonly claude_md_files: Record<string, string>;
  readonly external_refs: Record<string, string>;
  readonly fetched_at: string;
}

export interface ExternalReferenceResult {
  readonly url: string;
  readonly content: string;
  readonly references: string[];
  readonly error?: string;
  readonly depth: number;
}

// HTTP fetch with timeout utility type
export interface TimeoutFetchOptions {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly timeout?: number;
  readonly retries?: number;
  readonly retryDelay?: number;
}