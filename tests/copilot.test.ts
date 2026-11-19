import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotAdapter } from '../dist/adapters/copilot.js';

test('copilot: grants the narrow write permission in prompt mode', async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try {
    await new CopilotAdapter().run(
      { taskId: 't', brief: 'create a file', backend: 'copilot', cwd: '/tmp', timeoutMs: 1000, dryRun: true },
      {},
    );
  } finally {
    console.log = originalLog;
  }
  const dry = lines.find((line) => line.startsWith('[dry-run]')) ?? '';
  assert.match(dry, /copilot -p "create a file" --output-format json --allow-tool write/);
  assert.doesNotMatch(dry, /--allow-all/);
});

test('copilot: resumes an exact session when available', async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try {
    await new CopilotAdapter().run(
      { taskId: 't', brief: 'continue', backend: 'copilot', cwd: '/tmp', timeoutMs: 1000, dryRun: true, sessionId: 'copilot-123' },
      {},
    );
  } finally {
    console.log = originalLog;
  }
  const dry = lines.find((line) => line.startsWith('[dry-run]')) ?? '';
  assert.match(dry, /--resume=copilot-123/);
});
