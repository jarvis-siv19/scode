import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResetInput } from '../dist/tui/ManualEntry.js';

const now = new Date('2026-11-18T12:00:00.000Z');

test('parseResetInput: empty means unknown', () => {
  assert.equal(parseResetInput('', now), null);
  assert.equal(parseResetInput('   ', now), null);
});

test('parseResetInput: relative hours and minutes', () => {
  assert.equal(parseResetInput('2h', now), '2026-11-18T14:00:00.000Z');
  assert.equal(parseResetInput('30m', now), '2026-11-18T12:30:00.000Z');
  assert.equal(parseResetInput('1d', now), '2026-11-19T12:00:00.000Z');
  assert.equal(parseResetInput('1.5h', now), '2026-11-18T13:30:00.000Z');
});

test('parseResetInput: ISO dates pass through', () => {
  assert.equal(parseResetInput('2026-11-19T20:00:00Z', now), '2026-11-19T20:00:00.000Z');
});

test('parseResetInput: garbage returns null', () => {
  assert.equal(parseResetInput('soonish', now), null);
  assert.equal(parseResetInput('2x', now), null);
});
