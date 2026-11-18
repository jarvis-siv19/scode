import test from 'node:test';
import assert from 'node:assert/strict';
import { computePriors, rankByScore, scoreBackend, selectEffort, type Priors } from '../dist/core/scoring.js';
import type { JoinedRun } from '../dist/core/learn.js';
import type { BackendSnapshot } from '../dist/core/types.js';

function run(overrides: Partial<JoinedRun>): JoinedRun {
  return {
    taskId: 't', backend: 'codex-a', classType: 'backend' as never, effort: 'medium',
    brief: 'task', success: true, errorClass: null, durationMs: 1000,
    cavemanWrapped: false, finishedAt: '2026-11-18T12:00:00.000Z', stdoutTail: '',
    ...overrides,
  };
}

function snapshot(id: string, remaining: number | null, resetsAt: string | null): BackendSnapshot {
  return {
    id: id as never, status: 'available',
    quota: { source: 'probe', remainingFraction: remaining, resetsAt, windowMinutes: 300 },
  };
}

function manyRuns(backend: string, classType: string, n: number, successes: number, tokens: number): JoinedRun[] {
  return Array.from({ length: n }, (_, i) => run({
    taskId: `${backend}-${classType}-${i}`,
    backend: backend as never,
    classType: classType as never,
    success: i < successes,
    inputTokens: tokens,
    outputTokens: 0,
  }));
}

test('scoring: Beta prior keeps small samples near 0.5', () => {
  const priors = computePriors(manyRuns('codex-a', 'aws', 2, 2, 1000));
  const prior = priors.get('codex-a:aws');
  assert.ok(prior);
  assert.equal(prior.runs, 2);
  assert.equal(prior.measured, false);
  // (2 + 2) / (2 + 4) = 0.667 — not 1.0.
  assert.ok(Math.abs(prior.pSuccess - 2 / 3) < 0.001);
});

test('scoring: 20 runs marks a pair measured', () => {
  const priors = computePriors(manyRuns('codex-a', 'aws', 20, 18, 1000));
  const prior = priors.get('codex-a:aws');
  assert.equal(prior?.measured, true);
  assert.ok(Math.abs(prior!.pSuccess - 20 / 24) < 0.001);
});

test('scoring: rankByScore returns null when nothing is measured', () => {
  const priors = computePriors(manyRuns('codex-a', 'aws', 5, 5, 1000));
  const ranked = rankByScore('aws' as never, [
    snapshot('codex-a', 0.8, null),
    snapshot('kiro', 0.8, null),
  ], priors);
  assert.equal(ranked, null);
});

test('scoring: a soon-resetting cheap backend beats a far-resetting expensive one', () => {
  // Both measured, same success rate; codex costs 2x the tokens of kiro.
  const runs = [
    ...manyRuns('codex-a', 'aws', 20, 18, 20000),
    ...manyRuns('kiro', 'aws', 20, 18, 10000),
  ];
  const priors = computePriors(runs);
  const now = new Date('2026-11-18T12:00:00.000Z');
  const ranked = rankByScore('aws' as never, [
    // codex resets in 6 days (expensive to spend now), kiro in 6 hours.
    snapshot('codex-a', 0.8, '2026-11-24T12:00:00.000Z'),
    snapshot('kiro', 0.8, '2026-11-18T18:00:00.000Z'),
  ], priors, now);
  assert.ok(ranked);
  assert.equal(ranked[0].backend, 'kiro');
});

test('scoring: high failure rate outweighs cheap tokens', () => {
  const runs = [
    ...manyRuns('codex-a', 'aws', 20, 19, 20000),
    ...manyRuns('kiro', 'aws', 20, 5, 1000),
  ];
  const priors = computePriors(runs);
  const ranked = rankByScore('aws' as never, [
    snapshot('codex-a', 0.8, null),
    snapshot('kiro', 0.8, null),
  ], priors);
  assert.ok(ranked);
  assert.equal(ranked[0].backend, 'codex-a');
});

test('scoring: scarcity raises the cost of a nearly-empty window', () => {
  const runs = manyRuns('codex-a', 'aws', 20, 18, 10000);
  const priors = computePriors(runs);
  const full = scoreBackend('codex-a', 'aws' as never, snapshot('codex-a', 0.9, null), priors);
  const empty = scoreBackend('codex-a', 'aws' as never, snapshot('codex-a', 0.1, null), priors);
  assert.ok(empty.score > full.score);
});

test('scoring: effort selection defaults low when low effort works', () => {
  const runs = [
    ...manyRuns('codex-a', 'review-tests', 20, 18, 1000).map((r) => ({ ...r, effort: 'low' })),
  ];
  const picked = selectEffort('review-tests' as never, runs);
  assert.ok(picked);
  assert.equal(picked.effort, 'low');
});

test('scoring: effort selection escalates when low effort fails and high works', () => {
  const runs = [
    ...manyRuns('codex-a', 'architecture', 20, 8, 1000).map((r) => ({ ...r, effort: 'low' })),
    ...manyRuns('codex-a', 'architecture', 20, 18, 1000).map((r) => ({ ...r, effort: 'high' })),
  ];
  const picked = selectEffort('architecture' as never, runs);
  assert.ok(picked);
  assert.equal(picked.effort, 'high');
});

test('scoring: effort selection stays silent below 20 runs', () => {
  const runs = manyRuns('codex-a', 'aws', 5, 5, 1000).map((r) => ({ ...r, effort: 'low' }));
  assert.equal(selectEffort('aws' as never, runs), null);
});
