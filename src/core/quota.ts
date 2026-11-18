import { readFile, writeFile } from 'node:fs/promises';
import { loadConfig, statePaths } from '../config.js';
import { BACKEND_IDS, type BackendId, type BackendSnapshot, type QuotaWindow } from './types.js';

type QuotaState = Partial<Record<BackendId, QuotaWindow>>;

const models: Record<BackendId, string> = {
  'codex-a': 'vendor default',
  'codex-b': 'vendor default',
  kiro: 'vendor default',
  agy: 'vendor default',
  copilot: 'auto',
  opencode: 'free model',
  claude: 'disabled pending Pro',
};

export async function readQuotaState(): Promise<QuotaState> {
  try {
    return JSON.parse(await readFile(statePaths().quota, 'utf8')) as QuotaState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeQuotaState(state: QuotaState): Promise<void> {
  await writeFile(statePaths().quota, `${JSON.stringify(state, null, 2)}\n`);
}

export async function backendSnapshots(): Promise<BackendSnapshot[]> {
  const [state, config] = await Promise.all([readQuotaState(), loadConfig()]);
  const now = new Date().toISOString();
  return BACKEND_IDS.map((id) => {
    const quota = state[id] ?? {
      remainingFraction: null,
      resetsAt: null,
      windowMinutes: null,
      source: 'placeholder' as const,
      observedAt: now,
    };
    const disabled = id === 'claude' && !config.claudeEnabled;
    return {
      id,
      model: models[id],
      status: disabled ? 'disabled' : 'available',
      quota,
      note: disabled ? 'Claude Pro not confirmed' : quota.source === 'placeholder' ? 'quota unknown' : undefined,
    };
  });
}
