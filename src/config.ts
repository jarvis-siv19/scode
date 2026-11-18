import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';

export interface JcodeConfig {
  quotaFloor: number;
  defaultTimeoutMs: number;
  claudeEnabled: boolean;
  codexHomes: { a?: string; b?: string };
  opencodeModel: string;
  /** Attach to a warm `opencode serve` to avoid MCP cold-boot. */
  opencodeAttachUrl?: string;
  /** Cap Copilot autonomous steps per run (premium-request budget). */
  copilotMaxContinues?: number;
  /** Claude `-p` turn cap (default 25). Only used when claude is enabled. */
  claudeMaxTurns?: number;
  /** Optional extra spend cap per run, passed as `--max-budget-usd`. */
  claudeMaxBudgetUsd?: number;
  /** Optional hermetic MCP config for claude (`--mcp-config`). */
  claudeMcpConfig?: string;
  /** Caveman token-efficiency layer (Phase 3). Off by default. */
  caveman?: {
    enabled?: boolean;
    mode?: 'proxy' | 'skill-only';
    perBackend?: Partial<Record<import('./core/types.js').BackendId, boolean>>;
  };
  /**
   * Graphify code graph. enabled: build/query the per-repo graph (default
   * true; set JCODE_GRAPHIFY=false or enabled: false to turn it off).
   * autoBuild: build the graph before dispatch when it is missing or stale
   * (default true). No-op when the graphify binary is not installed.
   */
  graphify?: {
    enabled?: boolean;
    autoBuild?: boolean;
  };
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
  /** Per-task session ids, keyed by task id then backend (handoff §5). */
  sessions: join(stateHome(), 'sessions.json'),
  /** Last `jcode doctor` result (Phase 0 gate record). */
  smoke: join(stateHome(), 'smoke.json'),
  /** Last `jcode learn` report (Phase 5). */
  learnReport: join(stateHome(), 'learn-report.md'),
  /** MCP tool-call log, for the Phase 5 dead-tool check. */
  toolCalls: join(stateHome(), 'tool-calls.jsonl'),
  /** Scheduled jobs (cron + one-shot). */
  schedules: join(stateHome(), 'schedules.json'),
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
    // Missing config means defaults. Do not create it while reading: multiple
    // concurrent CLI/test processes could otherwise observe a partially
    // written JSON file on first launch.
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
    opencodeAttachUrl: process.env.JCODE_OPENCODE_ATTACH || fromDisk.opencodeAttachUrl,
    caveman: {
      ...fromDisk.caveman,
      enabled: process.env.JCODE_CAVEMAN === 'true' ? true : (fromDisk.caveman?.enabled ?? false),
    },
    graphify: {
      ...fromDisk.graphify,
      enabled: process.env.JCODE_GRAPHIFY === 'false' ? false : (fromDisk.graphify?.enabled ?? true),
      autoBuild: fromDisk.graphify?.autoBuild ?? true,
    },
  };
}
