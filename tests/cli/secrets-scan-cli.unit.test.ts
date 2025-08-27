import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => {
  return { execSync: vi.fn(() => '') };
});

vi.mock('../../src/security/secrets-scanner.js', async (importOriginal) => {
  const mod = await importOriginal();
  class MockScanner {
    constructor(_opts?: unknown) {}
    async preCommitScan(_files: string[]) {
      return { findings: [], filesScanned: 0, timeElapsed: 1, blocked: false };
    }
    async scanDirectory(_path: string) {
      return { findings: [], filesScanned: 3, timeElapsed: 2, blocked: false };
    }
    async scanFile(_p: string) { return []; }
    generateReport(_findings: unknown[], _format: string) { return JSON.stringify({ findings: [] }); }
  }
  return { ...mod, SecretsScanner: MockScanner };
});

describe('secrets-scan CLI (unit)', () => {
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    logs = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args.join(' ')); });
  });

  it('runs with directory target and outputs JSON by default', async () => {
    const { run } = await import('../../src/cli/secrets-scan-cli.js');
    const mockExit = vi.fn();
    await run(['node', 'secrets-scan', process.cwd(), '--format', 'json', '--quiet'], { exit: mockExit as (code: number) => void });
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('handles --pre-commit with no staged files gracefully', async () => {
    const { run } = await import('../../src/cli/secrets-scan-cli.js');
    // The CLI just returns normally when no staged files, not calling process.exit
    await expect(run(['--pre-commit', '--quiet'])).resolves.toBeUndefined();
  });
});
