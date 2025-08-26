import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/validation/fail-fast.js', async () => {
  return {
    FailFastValidator: class {
      constructor(_l?: unknown) {}
      async validateOnly(_p: string) { return { valid: true, errors: [], warnings: [], config: { logging: { level: 'info' } } }; }
      async validateStartup(_opts: unknown) { return { valid: true, errors: [], warnings: [] }; }
    },
    runConfigDoctor: vi.fn(async () => {})
  };
});

vi.mock('../../src/utils/path-resolver.js', async () => {
  return { PathResolver: { getInstance: () => ({ getAbsoluteYamlConfigPath: () => '/tmp/config.yaml' }) } };
});

describe('config-doctor CLI (unit)', () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.join(' ')); });
  });

  it('check --json exits 0', async () => {
    const { run } = await import('../../src/cli/config-doctor.js');
    // The run function uses exitOverride, so it should complete without throwing
    await expect(run(['check', '--json'])).resolves.toBeUndefined();
    expect(logs.join('\n')).toContain('valid');
  });

  // Minimal coverage via check --json already ensures run wiring & exit override
});
