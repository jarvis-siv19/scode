/**
 * Per-backend session ids keyed by task id (handoff §5): codex thread id,
 * kiro --resume-id, agy --conversation id, claude --resume session id.
 * Follow-ups reuse sessions instead of cold-starting.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { ensureStateHome, statePaths } from '../config.js';
import type { BackendId } from './types.js';

type SessionStore = Partial<Record<string, Partial<Record<BackendId, string>>>>;
let sessionWriteQueue: Promise<void> = Promise.resolve();

async function readSessions(): Promise<SessionStore> {
  try {
    return JSON.parse(await readFile(statePaths().sessions, 'utf8')) as SessionStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function getSessionId(taskId: string, backend: BackendId): Promise<string | undefined> {
  return (await readSessions())[taskId]?.[backend];
}

export async function saveSessionId(taskId: string, backend: BackendId, sessionId: string): Promise<void> {
  sessionWriteQueue = sessionWriteQueue.catch(() => undefined).then(async () => {
    await ensureStateHome();
    const store = await readSessions();
    store[taskId] = { ...store[taskId], [backend]: sessionId };
    await writeFile(statePaths().sessions, `${JSON.stringify(store, null, 2)}\n`);
  });
  return sessionWriteQueue;
}
