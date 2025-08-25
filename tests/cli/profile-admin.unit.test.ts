import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('fs', () => {
  return {
    existsSync: () => false,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  } as typeof fs;
});

describe('profile-admin CLI (unit)', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.join(' ')); });
  });

  it('runs list command without crashing and prints header', async () => {
    const { run } = await import('../../src/cli/profile-admin.ts');
    await run(['list']);
    const output = logs.join('\n');
    expect(output).toMatch(/Registered Profiles|No profiles/);
  });
});
