import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBackend } from '../dist/core/policy.js';
import type { BackendSnapshot } from '../dist/core/types.js';

function snapshot(
  id: BackendSnapshot['id'],
  status: BackendSnapshot['status'],
  remaining: number | null = null,
  resetsAt: string | null = null,
): BackendSnapshot {
  return {
    id,
    status,
    model: 'test',
    cliPresent: status !== 'unavailable',
    quota: { remainingFraction: remaining, resetsAt, windowMinutes: null, source: 'probe', observedAt: new Date().toISOString() },
  };
}

const general = { taskClass: 'general' as const, difficulty: 'medium' as const, reason: 'default rule' };
const aws = { taskClass: 'aws' as const, difficulty: 'medium' as const, reason: 'AWS-native keywords' };

test('policy: override picks the requested backend when available', () => {
  const snapshots = [snapshot('codex-a', 'available'), snapshot('kiro', 'available')];
  assert.equal(selectBackend(general, snapshots, 'kiro').backend, 'kiro');
});

test('policy: override refuses a disabled backend', () => {
  const snapshots = [snapshot('codex-a', 'available'), snapshot('claude', 'disabled')];
  assert.throws(() => selectBackend(general, snapshots, 'claude'), /disabled/);
});

test('policy: override refuses an unavailable backend', () => {
  const snapshots = [snapshot('codex-a', 'available'), snapshot('kiro', 'unavailable')];
  assert.throws(() => selectBackend(general, snapshots, 'kiro'), /unavailable/);
});

test('policy: override refuses a cooling-down backend', () => {
  const snapshots = [snapshot('codex-a', 'available'), snapshot('kiro', 'cooling-down')];
  assert.throws(() => selectBackend(general, snapshots, 'kiro'), /cooling down/);
});

test('policy: AWS tasks prefer kiro when available', () => {
  const snapshots = [snapshot('codex-a', 'available'), snapshot('kiro', 'available')];
  assert.equal(selectBackend(aws, snapshots).backend, 'kiro');
});

test('policy: soonest-expiring quota wins among eligible backends', () => {
  const snapshots = [
    snapshot('codex-a', 'available', 0.9, '2026-12-01T00:00:00.000Z'),
    snapshot('codex-b', 'available', 0.9, '2026-11-19T00:00:00.000Z'),
  ];
  assert.equal(selectBackend(general, snapshots).backend, 'codex-b');
});

test('policy: accounts below the floor are skipped when headroom exists', () => {
  const snapshots = [
    snapshot('codex-a', 'available', 0.05, '2026-11-19T00:00:00.000Z'),
    snapshot('codex-b', 'available', 0.8, '2026-12-01T00:00:00.000Z'),
  ];
  assert.equal(selectBackend(general, snapshots).backend, 'codex-b');
});

test('policy: a below-floor account is used only when it is the only option', () => {
  const snapshots = [snapshot('codex-a', 'available', 0.05, '2026-11-19T00:00:00.000Z')];
  const selection = selectBackend(general, snapshots);
  assert.equal(selection.backend, 'codex-a');
  assert.match(selection.reason, /below quota floor/);
});

test('policy: cooling-down backends are never selected', () => {
  const snapshots = [
    snapshot('codex-a', 'cooling-down', 0.9),
    snapshot('codex-b', 'available', 0.5),
  ];
  assert.equal(selectBackend(general, snapshots).backend, 'codex-b');
});

test('policy: throws when nothing is available', () => {
  const snapshots = [snapshot('codex-a', 'unavailable'), snapshot('claude', 'disabled')];
  assert.throws(() => selectBackend(general, snapshots), /No backend is available/);
});
