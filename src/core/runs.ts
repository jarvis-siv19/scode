import { spawn } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { ensureStateHome, loadConfig, statePaths } from '../config.js';
import type { BackendId, RunResult } from './types.js';

export interface RunRecord {
  taskId: string;
  backend: BackendId;
  brief: string;
  cwd: string;
  worktree?: string;
  sessionId?: string;
  hasChanges: boolean;
  success: boolean;
  updatedAt: string;
}

type RunStore = Record<string, RunRecord>;
let runWriteQueue: Promise<void> = Promise.resolve();

async function readRuns(): Promise<RunStore> {
  try {
    return JSON.parse(await readFile(statePaths().runs, 'utf8')) as RunStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function saveRunRecord(brief: string, cwd: string, result: RunResult): Promise<void> {
  runWriteQueue = runWriteQueue.catch(() => undefined).then(async () => {
    await ensureStateHome();
    const store = await readRuns();
    store[result.taskId] = {
      taskId: result.taskId,
      backend: result.backend,
      brief,
      cwd,
      worktree: result.worktree,
      sessionId: result.sessionId,
      hasChanges: result.hasChanges === true,
      success: result.success,
      updatedAt: result.finishedAt,
    };
    const path = statePaths().runs;
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  });
  return runWriteQueue;
}

export async function listRunRecords(): Promise<RunRecord[]> {
  return Object.values(await readRuns()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRunRecord(taskId: string): Promise<RunRecord | undefined> {
  return (await readRuns())[taskId];
}

function interactiveCommand(record: RunRecord): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const session = record.sessionId;
  switch (record.backend) {
    case 'codex-a':
    case 'codex-b':
      return { command: 'codex', args: ['resume', ...(session ? [session] : ['--last']), '-C', record.worktree ?? record.cwd] };
    case 'claude': return { command: 'claude', args: session ? ['--resume', session] : ['--continue'] };
    case 'kiro': return { command: 'kiro-cli', args: ['chat', ...(session ? ['--resume-id', session] : ['--resume-picker'])] };
    case 'agy': return { command: 'agy', args: session ? ['--conversation', session] : ['--continue'] };
    case 'copilot': return { command: 'copilot', args: session ? [`--resume=${session}`] : ['--continue'] };
    case 'opencode': return { command: 'opencode', args: ['--standalone', ...(session ? ['--session', session] : ['--continue'])] };
  }
}

/** Hand control to the vendor's unmodified interactive CLI. */
export async function attachRun(taskId: string): Promise<number> {
  const record = await getRunRecord(taskId);
  if (!record) throw new Error(`Unknown session: ${taskId}`);
  const config = await loadConfig();
  const spec = interactiveCommand(record);
  const codexHome = record.backend === 'codex-a' ? config.codexHomes.a
    : record.backend === 'codex-b' ? config.codexHomes.b : undefined;
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: record.worktree ?? record.cwd,
      env: { ...process.env, ...spec.env, ...(codexHome ? { CODEX_HOME: codexHome } : {}) },
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}
