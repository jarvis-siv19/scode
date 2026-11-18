import { randomUUID } from 'node:crypto';
import { CodexAdapter } from '../adapters/codex.js';
import { ClaudeAdapter } from '../adapters/claude.js';
import { StubAdapter } from '../adapters/stub.js';
import type { BackendAdapter } from '../adapters/types.js';
import { loadConfig } from '../config.js';
import { appendLedger } from './ledger.js';
import type { BackendId, RunResult } from './types.js';

function adapterFor(backend: BackendId): BackendAdapter {
  if (backend === 'codex-a' || backend === 'codex-b') return new CodexAdapter();
  if (backend === 'claude') return new ClaudeAdapter();
  return new StubAdapter(backend);
}

export async function dispatch(options: {
  brief: string;
  backend: BackendId;
  cwd?: string;
  timeoutMs?: number;
  selectionReason: string;
  classification: Record<string, unknown>;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}): Promise<RunResult> {
  const config = await loadConfig();
  const request = {
    taskId: randomUUID(),
    brief: options.brief,
    backend: options.backend,
    cwd: options.cwd ?? process.cwd(),
    timeoutMs: options.timeoutMs ?? config.defaultTimeoutMs,
  };

  await appendLedger({
    event: 'run-started',
    taskId: request.taskId,
    timestamp: new Date().toISOString(),
    brief: request.brief,
    backend: request.backend,
    cwd: request.cwd,
    classification: options.classification,
    selectionReason: options.selectionReason,
  });

  try {
    const result = await adapterFor(request.backend).run(request, {
      onStdout: options.onStdout ?? ((chunk) => process.stdout.write(chunk)),
      onStderr: options.onStderr ?? ((chunk) => process.stderr.write(chunk)),
    });
    await appendLedger({ event: 'run-finished', ...result });
    return result;
  } catch (error) {
    await appendLedger({
      event: 'run-failed-to-start',
      taskId: request.taskId,
      timestamp: new Date().toISOString(),
      backend: request.backend,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
