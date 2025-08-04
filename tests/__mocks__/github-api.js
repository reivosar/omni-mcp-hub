"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockGitHubAPI = void 0;
class MockGitHubAPI {
    constructor() {
        this.mockFiles = new Map();
        this.mockFileContent = new Map();
    }
    setMockFiles(owner, repo, branch, files) {
        const key = `${owner}/${repo}@${branch}`;
        this.mockFiles.set(key, files);
    }
    setMockFileContent(owner, repo, filePath, branch, content) {
        const key = `${owner}/${repo}/${filePath}@${branch}`;
        this.mockFileContent.set(key, content);
    }
    setMockError(owner, repo, error) {
        const key = `${owner}/${repo}@error`;
        this.mockFiles.set(key, []);
    }
    async listFiles(owner, repo, branch = 'main', pattern = 'CLAUDE.md') {
        const key = `${owner}/${repo}@${branch}`;
        if (owner === 'error' && repo === 'repo') {
            throw new Error('Repository not found');
        }
        const files = this.mockFiles.get(key) || [];
        return files.filter(file => {
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(file);
            }
            return file.endsWith(pattern) || file.includes(pattern);
        });
    }
    async getFileContent(owner, repo, filePath, branch = 'main') {
        const key = `${owner}/${repo}/${filePath}@${branch}`;
        if (owner === 'error' && repo === 'repo') {
            throw new Error('File not found');
        }
        const content = this.mockFileContent.get(key);
        if (content === undefined) {
            throw new Error(`File ${filePath} not found in ${owner}/${repo}@${branch}`);
        }
        return content;
    }
    async getRateLimit() {
        return {
            remaining: 5000,
            reset: Date.now() + 3600000
        };
    }
    clear() {
        this.mockFiles.clear();
        this.mockFileContent.clear();
    }
    getSetupInfo() {
        return {
            files: Array.from(this.mockFiles.entries()),
            content: Array.from(this.mockFileContent.entries())
        };
    }
}
exports.MockGitHubAPI = MockGitHubAPI;
