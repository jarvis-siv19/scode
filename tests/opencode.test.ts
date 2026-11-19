import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeAdapter } from '../dist/adapters/opencode.js';

test('opencode: isolates the server and pins the worktree through PWD', async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try {
    await new OpenCodeAdapter().run(
      { taskId: 't', brief: 'create a file', backend: 'opencode', cwd: '/tmp/scode-worktree', timeoutMs: 1000, dryRun: true },
      {},
    );
  } finally {
    console.log = originalLog;
  }
  const dry = lines.find((line) => line.startsWith('[dry-run]')) ?? '';
  assert.match(dry, /opencode --standalone run "create a file"/);
  assert.ok(lines.some((line) => /env: PWD/.test(line)));
});

test('opencode: resumes the exact session', async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try {
    await new OpenCodeAdapter().run(
      { taskId: 't', brief: 'continue', backend: 'opencode', cwd: '/tmp/scode-worktree', timeoutMs: 1000, dryRun: true, sessionId: 'ses_123' },
      {},
    );
  } finally {
    console.log = originalLog;
  }
  const dry = lines.find((line) => line.startsWith('[dry-run]')) ?? '';
  assert.match(dry, /--session ses_123/);
});
