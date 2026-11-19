import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClaudeRateLimits, parseCodexRateLimits, parseKiroUsage } from '../dist/core/probes.js';

test('codex probe: parses windows and picks the tightest as binding', () => {
  const parsed = parseCodexRateLimits({
    jsonrpc: '2.0',
    id: 1,
    result: {
      rateLimits: {
        '5h': { usedPercent: 80, windowMinutes: 300, resetsAt: '2026-11-18T20:00:00.000Z' },
        weekly: { usedPercent: 10, windowMinutes: 10080, resetsAt: '2026-11-24T00:00:00.000Z' },
      },
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.remainingFraction, 0.2);
  assert.equal(parsed.windowMinutes, 300);
  assert.equal(parsed.resetsAt, '2026-11-18T20:00:00.000Z');
  assert.equal(parsed.windows?.length, 2);
});

test('codex probe: handles a missing 5h window (suspended for many accounts)', () => {
  const parsed = parseCodexRateLimits({
    result: { rateLimits: { weekly: { usedPercent: 40, windowMinutes: 10080, resetsAt: null } } },
  });
  assert.ok(parsed);
  assert.equal(parsed.remainingFraction, 0.6);
  assert.equal(parsed.windowMinutes, 10080);
});

test('codex probe: parses current primary/secondary windows and Unix reset seconds', () => {
  const parsed = parseCodexRateLimits({
    id: 2,
    result: {
      rateLimits: {
        primary: { usedPercent: 3, windowDurationMins: 300, resetsAt: 1795061920 },
        secondary: { usedPercent: 35, windowDurationMins: 10080, resetsAt: 1795509096 },
      },
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.remainingFraction, 0.65);
  assert.equal(parsed.windowMinutes, 10080);
  assert.equal(parsed.resetsAt, new Date(1795509096 * 1000).toISOString());
});

test('codex probe: returns null on garbage', () => {
  assert.equal(parseCodexRateLimits({ result: {} }), null);
  assert.equal(parseCodexRateLimits(null), null);
  assert.equal(parseCodexRateLimits('not json'), null);
});

test('kiro probe: parses used percent', () => {
  const parsed = parseKiroUsage('Usage this month\nUsed: 35%\nResets 2026-12-01T00:00:00Z');
  assert.ok(parsed);
  assert.equal(parsed.remainingFraction, 0.65);
  assert.equal(parsed.resetsAt, '2026-12-01T00:00:00.000Z');
});

test('kiro probe: parses remaining percent directly', () => {
  const parsed = parseKiroUsage('Remaining: 42% of your quota');
  assert.ok(parsed);
  assert.equal(parsed.remainingFraction, 0.42);
});

test('kiro probe: returns null when nothing parses', () => {
  assert.equal(parseKiroUsage('hello world, no numbers here'), null);
});

test('kiro probe: monthly limit reached is an honest zero quota', () => {
  const parsed = parseKiroUsage("You've reached your monthly usage limit.");
  assert.ok(parsed);
  assert.equal(parsed.remainingFraction, 0);
});

test('claude probe: parses status-line rate_limits', () => {
  const parsed = parseClaudeRateLimits({
    rate_limits: {
      five_hour: { used_percentage: 60, resets_at: '2026-11-18T19:00:00.000Z' },
      seven_day: { used_percentage: 20, resets_at: '2026-11-25T00:00:00.000Z' },
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.remainingFraction, 0.4);
  assert.equal(parsed.windowMinutes, 300);
});

test('claude probe: returns null on garbage', () => {
  assert.equal(parseClaudeRateLimits({}), null);
  assert.equal(parseClaudeRateLimits(null), null);
});
