import test from 'node:test';
import assert from 'node:assert/strict';
import { displayQuotaWindows, formatQuotaReset } from '../dist/core/quotaDisplay.js';
import type { BackendSnapshot } from '../dist/core/types.js';

test('quota display: reset includes a local date and relative duration', () => {
  const now = new Date(2026, 10, 19, 2, 0, 0);
  assert.equal(formatQuotaReset(new Date(2026, 10, 19, 6, 30, 0).toISOString(), now), 'Nov 19 6:30a · 4h');
  assert.equal(formatQuotaReset(new Date(2026, 10, 24, 2, 0, 0).toISOString(), now), 'Nov 24 · 5d');
  assert.equal(formatQuotaReset(null, now), '—');
});

test('quota display: Codex primary and secondary windows become 5h and Weekly', () => {
  const now = new Date(2026, 10, 19, 2, 0, 0);
  const backend: BackendSnapshot = {
    id: 'codex-a', displayName: 'Codex', loginStatus: 'active', status: 'available', model: 'default', cliPresent: true,
    quota: {
      remainingFraction: 0.24, resetsAt: new Date(2026, 10, 24, 2).toISOString(), windowMinutes: 10_080,
      source: 'probe', observedAt: now.toISOString(),
      windows: [
        { name: 'primary', remainingFraction: 0.74, resetsAt: new Date(2026, 10, 19, 6, 30).toISOString(), windowMinutes: 300 },
        { name: 'secondary', remainingFraction: 0.24, resetsAt: new Date(2026, 10, 24, 2).toISOString(), windowMinutes: 10_080 },
      ],
    },
  };
  assert.deepEqual(displayQuotaWindows(backend, now), [
    { label: '5h', usage: '26% used', reset: 'Nov 19 6:30a · 4h' },
    { label: 'Weekly', usage: '76% used', reset: 'Nov 24 · 5d' },
  ]);
});
