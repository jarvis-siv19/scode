import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, setTheme } from '../dist/config.js';

test('config: missing file uses defaults without a first-run write race', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jcode-config-test-'));
  const saved = process.env.JCODE_HOME;
  process.env.JCODE_HOME = dir;
  try {
    const config = await loadConfig();
    assert.equal(config.quotaFloor, 0.1);
    assert.equal(config.theme, 'ember');
    await assert.rejects(access(join(dir, 'config.json')), { code: 'ENOENT' });
  } finally {
    if (saved === undefined) delete process.env.JCODE_HOME;
    else process.env.JCODE_HOME = saved;
    await rm(dir, { recursive: true, force: true });
  }
});

test('config: setting a theme preserves existing settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jcode-theme-test-'));
  const saved = process.env.JCODE_HOME;
  process.env.JCODE_HOME = dir;
  try {
    await writeFile(join(dir, 'config.json'), JSON.stringify({ quotaFloor: 0.25, opencodeModel: 'test/model' }));
    await setTheme('aurora');
    const config = await loadConfig();
    const persisted = JSON.parse(await readFile(join(dir, 'config.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(config.theme, 'aurora');
    assert.equal(persisted.theme, 'aurora');
    assert.equal(persisted.quotaFloor, 0.25);
    assert.equal(persisted.opencodeModel, 'test/model');
  } finally {
    if (saved === undefined) delete process.env.JCODE_HOME;
    else process.env.JCODE_HOME = saved;
    await rm(dir, { recursive: true, force: true });
  }
});
