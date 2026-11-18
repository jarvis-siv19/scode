import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../dist/config.js';

test('config: missing file uses defaults without a first-run write race', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jcode-config-test-'));
  const saved = process.env.JCODE_HOME;
  process.env.JCODE_HOME = dir;
  try {
    const config = await loadConfig();
    assert.equal(config.quotaFloor, 0.1);
    await assert.rejects(access(join(dir, 'config.json')), { code: 'ENOENT' });
  } finally {
    if (saved === undefined) delete process.env.JCODE_HOME;
    else process.env.JCODE_HOME = saved;
    await rm(dir, { recursive: true, force: true });
  }
});
