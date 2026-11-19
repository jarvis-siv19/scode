import { resolve } from 'node:path';
import { dispatch } from './core/dispatcher.js';
import { buildGraph, ensureGitignored, graphStatus, graphifyInfo, installGraphHooks } from './core/graphify.js';
import { readLedgerTail } from './core/ledger.js';
import { routeTask } from './core/router.js';
import { computeTokenStats, renderTokenDashboard } from './core/tokenStats.js';
import { backendSnapshots } from './core/quota.js';
import {
  addSchedule,
  installHint,
  loadSchedules,
  parseDuration,
  removeSchedule,
  runDueSchedules,
  setScheduleEnabled,
  validateCron,
} from './core/schedules.js';
import { getPriors } from './core/scoring.js';
import { BACKEND_IDS, THEME_IDS, type BackendId, type ThemeId } from './core/types.js';
import { loadConfig, setTheme } from './config.js';
import { THEMES } from './tui/theme.js';
import { runDoctor } from './doctor.js';
import { runLearn } from './core/learn.js';
import { installForBackend, toolsStatus } from './mcp/install.js';

export type Command =
  | { name: 'tui' }
  | { name: 'run'; brief: string; backend?: BackendId; cwd?: string; dryRun?: boolean }
  | { name: 'status' }
  | { name: 'doctor'; quick?: boolean; full?: boolean }
  | { name: 'learn' }
  | { name: 'tokens' }
  | { name: 'theme'; action: 'list' | 'set'; theme?: ThemeId }
  | { name: 'tools'; action: 'install' | 'status' }
  | { name: 'graph'; action: 'init' | 'status' | 'refresh'; path: string; force?: boolean }
  | {
      name: 'schedule';
      action: 'add' | 'list' | 'remove' | 'enable' | 'disable' | 'tick' | 'install';
      brief?: string;
      cron?: string;
      at?: string;
      inMs?: number;
      backend?: BackendId;
      cwd?: string;
      id?: string;
      dryRun?: boolean;
    }
  | { name: 'help' };

function isBackend(value: string): value is BackendId {
  return BACKEND_IDS.includes(value as BackendId);
}

function isTheme(value: string): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

export function parseArgs(argv: string[]): Command {
  if (argv.length === 0) return { name: 'tui' };
  const [name, ...rest] = argv;
  if (name === '--help' || name === '-h' || name === 'help') return { name: 'help' };
  if (name === 'status') return { name: 'status' };
  if (name === 'learn') return { name: 'learn' };
  if (name === 'tokens') return { name: 'tokens' };
  if (name === 'theme') {
    if (rest.length === 0 || (rest.length === 1 && rest[0] === 'list')) {
      return { name: 'theme', action: 'list' };
    }
    if (rest.length === 2 && rest[0] === 'set' && isTheme(rest[1])) {
      return { name: 'theme', action: 'set', theme: rest[1] };
    }
    throw new Error(`Usage: scode theme [list | set <${THEME_IDS.join('|')}>]`);
  }
  if (name === 'doctor') {
    return {
      name: 'doctor',
      quick: rest.includes('--quick'),
      full: rest.includes('--full'),
    };
  }
  if (name === 'tools') {
    const action = rest[0];
    if (action !== 'install' && action !== 'status') throw new Error('Usage: jcode tools <install|status>');
    return { name: 'tools', action };
  }
  if (name === 'schedule') return parseScheduleArgs(rest);
  if (name === 'graph') return parseGraphArgs(rest);
  if (name !== 'run') throw new Error(`Unknown command: ${name}`);

  let backend: BackendId | undefined;
  let cwd: string | undefined;
  let dryRun = false;
  const briefParts: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--backend') {
      const value = rest[++index];
      if (!value || !isBackend(value)) throw new Error(`Invalid backend. Choose: ${BACKEND_IDS.join(', ')}`);
      backend = value;
    } else if (rest[index] === '--cwd') {
      const value = rest[++index];
      if (!value) throw new Error('--cwd requires a path');
      cwd = resolve(value);
    } else if (rest[index] === '--dry-run') {
      dryRun = true;
    } else {
      briefParts.push(rest[index]);
    }
  }
  const brief = briefParts.join(' ').trim();
  if (!brief) throw new Error('jcode run requires a task brief');
  return { name: 'run', brief, backend, cwd, dryRun };
}

function parseGraphArgs(rest: string[]): Extract<Command, { name: 'graph' }> {
  const [action, ...args] = rest;
  if (action !== 'init' && action !== 'status' && action !== 'refresh') {
    throw new Error('Usage: jcode graph <init|status|refresh> [path] [--force]');
  }
  const force = args.includes('--force');
  const pathArg = args.find((arg) => !arg.startsWith('--'));
  return { name: 'graph', action, path: resolve(pathArg ?? process.cwd()), force };
}

function parseScheduleArgs(rest: string[]): Extract<Command, { name: 'schedule' }> {
  const [action, ...args] = rest;
  if (action === 'list') return { name: 'schedule', action: 'list' };
  if (action === 'install') return { name: 'schedule', action: 'install' };
  if (action === 'tick') {
    return { name: 'schedule', action: 'tick', dryRun: args.includes('--dry-run') };
  }
  if (action === 'remove' || action === 'enable' || action === 'disable') {
    if (!args[0]) throw new Error(`Usage: jcode schedule ${action} <id>`);
    return { name: 'schedule', action, id: args[0] };
  }
  if (action !== 'add') {
    throw new Error('Usage: jcode schedule <add|list|remove|enable|disable|tick|install>');
  }
  let backend: BackendId | undefined;
  let cwd: string | undefined;
  let cron: string | undefined;
  let at: string | undefined;
  let inMs: number | undefined;
  const briefParts: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--backend') {
      const value = args[++index];
      if (!value || !isBackend(value)) throw new Error(`Invalid backend. Choose: ${BACKEND_IDS.join(', ')}`);
      backend = value;
    } else if (args[index] === '--cwd') {
      const value = args[++index];
      if (!value) throw new Error('--cwd requires a path');
      cwd = resolve(value);
    } else if (args[index] === '--cron') {
      const value = args[++index];
      if (!value) throw new Error('--cron requires a 5-field expression, e.g. "0 9 * * 1-5"');
      try {
        validateCron(value);
      } catch (error) {
        throw new Error(`Invalid cron expression "${value}": ${error instanceof Error ? error.message : String(error)}`);
      }
      cron = value;
    } else if (args[index] === '--at') {
      const value = args[++index];
      if (!value || Number.isNaN(new Date(value).getTime())) {
        throw new Error('--at requires a valid date, e.g. "2026-11-20T09:00" (local time)');
      }
      at = new Date(value).toISOString();
    } else if (args[index] === '--in') {
      const value = args[++index];
      const parsed = value ? parseDuration(value) : null;
      if (parsed === null) throw new Error('--in requires a duration like "30m", "2h", or "1d"');
      inMs = parsed;
    } else {
      briefParts.push(args[index]);
    }
  }
  const brief = briefParts.join(' ').trim();
  if (!brief) throw new Error('jcode schedule add requires a task brief');
  const kinds = [cron !== undefined, at !== undefined, inMs !== undefined].filter(Boolean).length;
  if (kinds !== 1) throw new Error('jcode schedule add needs exactly one of --cron, --at, or --in');
  return { name: 'schedule', action: 'add', brief, cron, at, inMs, backend, cwd };
}

export async function runHeadless(command: Exclude<Command, { name: 'tui' }>): Promise<number> {
  if (command.name === 'help') {
    console.log([
      'Usage:',
      '  jcode                                    open the terminal UI',
      '  jcode run [--backend ID] [--cwd PATH] [--dry-run] "<task>"',
      '  jcode status                             per-backend headroom (runs probes)',
      '  jcode doctor [--quick] [--full]          Phase 0 machine smoke tests',
      '  jcode learn                              learning fold (Phase 5)',
      '  jcode tokens                             token usage dashboard (today + last 7 days)',
      `  scode theme [list | set <${THEME_IDS.join('|')}>]  choose a TUI color theme`,
      '  jcode tools <install|status>             wire the jcode-tools MCP server into backends',
      '  jcode graph <init|status|refresh> [path] code graph for a repo (Graphify, local only)',
      '  jcode schedule add "<task>" --cron "0 9 * * 1-5"  recurring job (local time)',
      '  jcode schedule add "<task>" --at 2026-11-20T09:00  one-shot job',
      '  jcode schedule add "<task>" --in 2h       one-shot job, relative',
      '  jcode schedule <list|remove|enable|disable|tick|install>',
      '',
      `Backends: ${BACKEND_IDS.join(', ')}`,
    ].join('\n'));
    return 0;
  }
  if (command.name === 'learn') {
    return runLearn();
  }
  if (command.name === 'theme') {
    if (command.action === 'set') {
      const theme = command.theme;
      if (!theme) throw new Error('A theme is required when using `scode theme set`.');
      await setTheme(theme);
      console.log(`Theme set to ${THEMES[theme].name}. Restart the TUI to apply it.`);
    } else {
      const config = await loadConfig();
      console.log(`Current theme: ${THEMES[config.theme].name} (${config.theme})`);
      console.log('Available themes: ember (red/black), classic (cyan/purple), aurora (green/blue), violet (lavender/pink)');
    }
    return 0;
  }
  if (command.name === 'tokens') {
    // 2000 records ≈ 1000 runs — comfortably covers a heavy week.
    const records = await readLedgerTail(2000);
    const stats = computeTokenStats(records, new Date());
    for (const line of renderTokenDashboard(stats)) console.log(line);
    return 0;
  }
  if (command.name === 'doctor') {
    const { exitCode } = await runDoctor({ quick: command.quick, full: command.full });
    return exitCode;
  }
  if (command.name === 'tools') {
    if (command.action === 'status') {
      const rows = await toolsStatus();
      for (const row of rows) {
        console.log(`${row.backend.padEnd(10)} ${row.configured ? 'configured' : 'not configured'}  ${row.path}`);
      }
      console.log('agy        skipped (config path unconfirmed — see `jcode tools install`)');
      return 0;
    }
    // codex-a and codex-b share one config file — install once.
    const targets: BackendId[] = ['codex-a', 'claude', 'kiro', 'copilot', 'opencode', 'agy'];
    let errors = 0;
    for (const backend of targets) {
      const outcome = await installForBackend(backend);
      if (outcome.status === 'error') errors++;
      console.log(`${backend.padEnd(10)} ${outcome.status.padEnd(16)} ${outcome.detail}`);
    }
    return errors > 0 ? 1 : 0;
  }
  if (command.name === 'schedule') {
    if (command.action === 'install') {
      console.log(installHint());
      return 0;
    }
    if (command.action === 'list') {
      const schedules = await loadSchedules();
      if (schedules.length === 0) {
        console.log('No schedules. Add one with: jcode schedule add "<task>" --cron "0 9 * * 1-5"');
        return 0;
      }
      for (const item of schedules) {
        const state = item.enabled ? 'on ' : 'off';
        const when = item.nextRunAt ?? '—';
        const via = item.backend ?? 'auto';
        console.log(`${item.id}  ${state}  ${when}  ${item.kind.padEnd(4)} ${via.padEnd(9)} ${item.brief.slice(0, 60)}`);
      }
      return 0;
    }
    if (command.action === 'add') {
      const created = await addSchedule({
        brief: command.brief as string,
        cron: command.cron,
        at: command.at,
        inMs: command.inMs,
        backend: command.backend,
        cwd: command.cwd,
      });
      console.log(`Scheduled ${created.id} — next run ${created.nextRunAt} (${created.kind}, ${created.backend ?? 'auto'}).`);
      console.log('It fires when `jcode schedule tick` runs — see `jcode schedule install`, or keep the TUI open.');
      return 0;
    }
    if (command.action === 'remove') {
      const removed = await removeSchedule(command.id as string);
      console.log(`Removed ${removed.id} ("${removed.brief.slice(0, 60)}").`);
      return 0;
    }
    if (command.action === 'enable' || command.action === 'disable') {
      const updated = await setScheduleEnabled(command.id as string, command.action === 'enable');
      console.log(`${updated.id} is now ${updated.enabled ? 'enabled' : 'disabled'}.`);
      return 0;
    }
    // tick
    const result = await runDueSchedules({
      dryRun: command.dryRun,
      onStart: ({ schedule }) => console.log(`[jcode] firing ${schedule.id}: ${schedule.brief.slice(0, 60)}`),
      onFinish: ({ schedule }, runResult) => {
        console.log(`[jcode] ${schedule.id} ${runResult.success ? 'succeeded' : `failed (${runResult.errorClass ?? 'unknown'})`} on ${runResult.backend}`);
      },
    });
    if (result.dryRun) {
      if (result.fired.length === 0) console.log('Nothing due right now.');
      for (const item of result.fired) console.log(`Would fire ${item.scheduleId}.`);
      return 0;
    }
    if (result.fired.length === 0) console.log('Nothing due right now.');
    if (result.skippedRunning.length > 0) {
      console.log(`Skipped mid-run: ${result.skippedRunning.join(', ')}.`);
    }
    return result.fired.some((item) => !item.success) ? 1 : 0;
  }
  if (command.name === 'graph') {
    const repoPath = command.path;
    if (command.action === 'status') {
      const status = await graphStatus(repoPath);
      if (!status.present) {
        console.log(`No code graph at ${status.outDir}. Build one with: jcode graph init ${repoPath}`);
        return 0;
      }
      console.log(`Graph: ${status.outDir}`);
      console.log(`  nodes: ${status.nodeCount ?? '?'} · built at ${status.builtAtCommit?.slice(0, 7) ?? 'unknown'} · graphify ${status.graphifyVersion ?? 'unknown'}`);
      console.log(`  HEAD: ${status.headCommit?.slice(0, 7) ?? 'not a git repo'}`);
      console.log(`  state: ${status.stale ? 'STALE — run `jcode graph refresh`' : 'current'}`);
      return 0;
    }
    const info = await graphifyInfo();
    if (!info.present) {
      console.log('graphify is not installed. Install it first: uv tool install "graphifyy[mcp]" (needs Python 3.11+).');
      console.log('See docs/graphify.md for the Windows setup.');
      return 1;
    }
    if (command.action === 'init') {
      const existing = await graphStatus(repoPath);
      if (existing.present && !existing.stale) {
        console.log(`Graph already current (${existing.nodeCount ?? '?'} nodes, built at ${existing.builtAtCommit?.slice(0, 7)}).`);
      } else {
        const build = await buildGraph(repoPath, { force: command.force });
        if (!build.ok) {
          console.log(`Graph build failed: ${build.output}`);
          return 1;
        }
        console.log(`Graph ${existing.present ? 'rebuilt' : 'built'}: ${build.nodeCount ?? '?'} nodes in ${(build.durationMs / 1000).toFixed(1)}s.`);
      }
      const ignored = await ensureGitignored(repoPath);
      if (ignored === 'added') console.log('Added graphify-out/ to .gitignore.');
      const hooks = await installGraphHooks(repoPath);
      console.log(hooks.ok ? 'Git hooks installed — the graph refreshes on commit.' : `Hook install failed (the graph still works; refreshes happen on dispatch): ${hooks.output}`);
      return 0;
    }
    // refresh
    const build = await buildGraph(repoPath, { force: command.force });
    if (!build.ok) {
      console.log(`Graph refresh failed: ${build.output}`);
      return 1;
    }
    console.log(`Graph refreshed: ${build.nodeCount ?? '?'} nodes in ${(build.durationMs / 1000).toFixed(1)}s.`);
    return 0;
  }
  // status runs probes (cached 5 min); run reuses cached state for speed.
  const snapshots = await backendSnapshots({ refresh: command.name === 'status' });
  if (command.name === 'status') {
    for (const item of snapshots) {
      const remaining = item.quota.remainingFraction === null ? 'unknown' : `${Math.round(item.quota.remainingFraction * 100)}%`;
      const reset = item.quota.resetsAt ?? 'unknown';
      const version = item.cliVersion ? ` (${item.cliVersion})` : '';
      const note = item.note ? ` — ${item.note}` : '';
      console.log(`${item.id.padEnd(10)} ${item.status.padEnd(13)} remaining=${remaining.padEnd(8)} reset=${reset} source=${item.quota.source}${version}${note}`);
    }
    return 0;
  }

  const priors = await getPriors();
  const { classification, selection } = await routeTask(command.brief, snapshots, command.backend, { priors });
  console.error(`[jcode] ${selection.backend}: ${selection.reason}`);
  const result = await dispatch({
    brief: command.brief,
    backend: selection.backend,
    cwd: command.cwd,
    dryRun: command.dryRun,
    allowFallback: true,
    selectionReason: selection.reason,
    classification: { ...classification },
  });
  return result.success ? 0 : result.exitCode ?? 1;
}
