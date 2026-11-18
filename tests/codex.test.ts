import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexAdapter } from '../dist/adapters/codex.js';

test('codex: allows dispatch outside a git repository', async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try {
    await new CodexAdapter().run(
      { taskId: 't', brief: 'create a file', backend: 'codex-a', cwd: '/tmp', timeoutMs: 1000, dryRun: true },
      {},
    );
  } finally {
    console.log = originalLog;
  }
  const dry = lines.find((line) => line.startsWith('[dry-run]')) ?? '';
  assert.match(dry, /codex exec --json --sandbox workspace-write --skip-git-repo-check -C \/tmp/);
});
