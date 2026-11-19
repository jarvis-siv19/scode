import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bar,
  computeTokenStats,
  formatCompactTokens,
  formatTokens,
  renderTokenDashboard,
} from '../dist/core/tokenStats.js';

interface RunOpts {
  daysAgo?: number;
  backend?: string;
  input?: number;
  output?: number;
  cost?: number;
  premium?: number;
  caveman?: boolean;
  scheduleId?: string;
  noUsage?: boolean;
}

function makeRun(opts: RunOpts = {}): Record<string, unknown> {
  const at = new Date();
  at.setDate(at.getDate() - (opts.daysAgo ?? 0));
  at.setHours(12, 0, 0, 0);
  const record: Record<string, unknown> = {
    event: 'run-finished',
    taskId: `t-${Math.random()}`,
    backend: opts.backend ?? 'codex-a',
    finishedAt: at.toISOString(),
    success: true,
  };
  if (!opts.noUsage) {
    record.usage = {
      inputTokens: opts.input ?? 100,
      outputTokens: opts.output ?? 50,
      ...(opts.cost !== undefined ? { totalCostUsd: opts.cost } : {}),
      ...(opts.premium !== undefined ? { premiumRequests: opts.premium } : {}),
    };
  }
  if (opts.caveman !== undefined) record.cavemanWrapped = opts.caveman;
  if (opts.scheduleId) record.scheduleId = opts.scheduleId;
  return record;
}

test('tokens: today counts only this local day, week counts 7 local days', () => {
  const records = [
    makeRun({ daysAgo: 0, input: 100, output: 50 }),
    makeRun({ daysAgo: 0, input: 200, output: 100 }),
    makeRun({ daysAgo: 1, input: 1000, output: 500 }),
    makeRun({ daysAgo: 6, input: 10, output: 10 }),
    makeRun({ daysAgo: 7, input: 9999, output: 9999 }),
    makeRun({ daysAgo: 30, input: 9999, output: 9999 }),
    { event: 'run-started', taskId: 'x', backend: 'codex-a' }, // not a finish — ignored
  ];
  const stats = computeTokenStats(records, new Date());
  assert.equal(stats.today.total, 450);
  assert.equal(stats.today.runs, 2);
  assert.equal(stats.week.total, 450 + 1500 + 20);
  assert.equal(stats.week.runs, 4);
  assert.equal(stats.daily.length, 7);
  assert.equal(stats.daily[6].total, 450); // today is last
  assert.equal(stats.daily[0].total, 20); // 6 days ago is first
  assert.equal(stats.daily[5].total, 1500); // yesterday
});

test('tokens: per-backend totals sort by usage, cost and premium requests sum', () => {
  const records = [
    makeRun({ backend: 'codex-a', input: 100, output: 50, cost: 0.1 }),
    makeRun({ backend: 'copilot', input: 10, output: 10, premium: 3 }),
    makeRun({ backend: 'codex-a', input: 100, output: 50, cost: 0.2 }),
    makeRun({ backend: 'kiro', input: 500, output: 500 }),
  ];
  const stats = computeTokenStats(records, new Date());
  assert.deepEqual(stats.byBackendWeek.map((item) => item.backend), ['kiro', 'codex-a', 'copilot']);
  assert.equal(stats.byBackendWeek[1].total, 300);
  assert.equal(stats.week.costUsd, 0.30000000000000004); // float sum, kept exact here
  assert.equal(stats.week.premiumRequests, 3);
});

test('tokens: runs without usage data count as runs but add zero tokens', () => {
  const records = [makeRun({ input: 100, output: 50 }), makeRun({ noUsage: true }), makeRun({ noUsage: true })];
  const stats = computeTokenStats(records, new Date());
  assert.equal(stats.today.runs, 3);
  assert.equal(stats.today.runsWithUsage, 1);
  assert.equal(stats.today.total, 150);
  const lines = renderTokenDashboard(stats);
  assert.ok(lines.some((line) => line.includes('2 without usage data')));
});

test('tokens: caveman split appears only when both sides ran', () => {
  const onlyOn = computeTokenStats([makeRun({ caveman: true })], new Date());
  assert.equal(onlyOn.caveman, null);
  const both = computeTokenStats(
    [makeRun({ caveman: true, input: 50, output: 50 }), makeRun({ caveman: false, input: 200, output: 200 })],
    new Date(),
  );
  assert.ok(both.caveman);
  assert.equal(both.caveman?.on.total, 100);
  assert.equal(both.caveman?.off.total, 400);
  const lines = renderTokenDashboard(both);
  assert.ok(lines.some((line) => line.includes('Caveman:') && line.includes('75% fewer')));
});

test('tokens: scheduled runs are a subset of the week', () => {
  const records = [
    makeRun({ input: 100, output: 50 }),
    makeRun({ input: 1000, output: 1000, scheduleId: 'abc12345' }),
  ];
  const stats = computeTokenStats(records, new Date());
  assert.equal(stats.scheduledWeek.runs, 1);
  assert.equal(stats.scheduledWeek.total, 2000);
  assert.equal(stats.week.total, 2150);
});

test('tokens: bar fills in proportion, empty when nothing to show', () => {
  assert.equal(bar(50, 100, 10), '█████░░░░░');
  assert.equal(bar(100, 100, 10), '██████████');
  assert.equal(bar(0, 100, 10), '░░░░░░░░░░');
  assert.equal(bar(5, 0, 10), '░░░░░░░░░░');
  assert.equal(bar(1, 100, 10), '█░░░░░░░░░'); // at least one block when nonzero
});

test('tokens: format and dashboard lines', () => {
  assert.equal(formatTokens(1234567), '1,234,567');
  const stats = computeTokenStats([makeRun({ input: 100, output: 50 })], new Date());
  const lines = renderTokenDashboard(stats);
  assert.ok(lines[0].startsWith('Today: 150 tokens'));
  assert.ok(lines[1].startsWith('Last 7 days: 150 tokens'));
  assert.ok(lines.some((line) => line.includes('Per backend (7 days)')));
  assert.ok(lines.some((line) => line.includes('Daily (7 days)')));
});

test('tokens: compact home-screen totals stay readable', () => {
  assert.equal(formatCompactTokens(0), '0');
  assert.equal(formatCompactTokens(39_207), '39.2K');
  assert.equal(formatCompactTokens(1_250_000), '1.3M');
});
