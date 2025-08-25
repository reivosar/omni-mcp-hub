import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('admin-ui CLI (unit)', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.join(' ')); });
  });

  it('runs status command and prints System Status', async () => {
    const { run } = await import('../../src/cli/admin-ui.ts');
    await run(['status', '--config', '/nonexistent/config.json']);
    const output = logs.join('\n').toLowerCase();
    expect(output).toContain('system');
  });
});

