import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export interface JcodeConfig {
  quotaFloor: number;
  defaultTimeoutMs: number;
  claudeEnabled: boolean;
  codexHomes: { a?: string; b?: string };
  opencodeModel: string;
}

const defaults: JcodeConfig = {
  quotaFloor: 0.1,
  defaultTimeoutMs: 30 * 60 * 1000,
  claudeEnabled: false,
  codexHomes: {},
  opencodeModel: 'opencode/big-pickle',
};

export function stateHome(): string {
  return resolve(process.env.JCODE_HOME || join(homedir(), '.jcode'));
}

export const statePaths = () => ({
  home: stateHome(),
  config: join(stateHome(), 'config.json'),
  quota: join(stateHome(), 'quota.json'),
  ledger: join(stateHome(), 'ledger.jsonl'),
  lessons: join(stateHome(), 'lessons.md'),
});

export async function ensureStateHome(): Promise<void> {
  await mkdir(stateHome(), { recursive: true });
}

export async function loadConfig(): Promise<JcodeConfig> {
  await ensureStateHome();
  const paths = statePaths();
  let fromDisk: Partial<JcodeConfig> = {};
  try {
    fromDisk = JSON.parse(await readFile(paths.config, 'utf8')) as Partial<JcodeConfig>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeFile(paths.config, `${JSON.stringify(defaults, null, 2)}\n`, { flag: 'wx' }).catch(() => undefined);
  }

  return {
    ...defaults,
    ...fromDisk,
    claudeEnabled: process.env.JCODE_CLAUDE_ENABLED === 'true' && fromDisk.claudeEnabled === true,
    codexHomes: {
      ...defaults.codexHomes,
      ...fromDisk.codexHomes,
      a: process.env.JCODE_CODEX_A_HOME || fromDisk.codexHomes?.a,
      b: process.env.JCODE_CODEX_B_HOME || fromDisk.codexHomes?.b,
    },
  };
}
