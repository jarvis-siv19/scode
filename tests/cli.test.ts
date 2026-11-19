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
