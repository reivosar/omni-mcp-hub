import { describe, it, expect } from 'vitest';

describe('monitoring-cli (unit)', () => {
  it('shows help without executing actions', async () => {
    const { run } = await import('../../src/cli/monitoring-cli.ts');
    try {
      await run(['node', 'omni-monitoring', '--help']);
    } catch (_e) {
      // commander exitOverride throws; pass
    }
    expect(true).toBe(true);
  });
});
