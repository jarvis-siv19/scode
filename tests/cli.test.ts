import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../dist/cli.js';

test('cli: theme command lists and selects supported themes', () => {
  assert.deepEqual(parseArgs(['theme']), { name: 'theme', action: 'list' });
  assert.deepEqual(parseArgs(['theme', 'list']), { name: 'theme', action: 'list' });
  assert.deepEqual(parseArgs(['theme', 'set', 'ember']), { name: 'theme', action: 'set', theme: 'ember' });
  assert.deepEqual(parseArgs(['theme', 'set', 'aurora']), { name: 'theme', action: 'set', theme: 'aurora' });
  assert.throws(() => parseArgs(['theme', 'set', 'neon']), /Usage: scode theme/);
});

test('cli: parses backend editing and native session commands', () => {
  assert.deepEqual(parseArgs(['session']), { name: 'session', action: 'list' });
  assert.deepEqual(parseArgs(['session', 'attach', 'task-1']), { name: 'session', action: 'attach', id: 'task-1' });
  assert.deepEqual(parseArgs(['backend', 'set', 'opencode', '--model', 'free', '--label', 'Free agent']), {
    name: 'backend', action: 'set', backend: 'opencode', model: 'free', label: 'Free agent',
  });
});
