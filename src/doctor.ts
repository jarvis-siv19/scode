/**
 * Phase 0 — machine smoke tests (`jcode doctor`).
 *
 * Verifies each backend's headless command works from THIS machine, plus the
 * quota probes, the Caveman wrap, and MCP config presence. Results are
 * written to ~/.jcode/smoke.json with a timestamp.
 *
 * Honesty rules (handoff §7): if a CLI is not installed on this machine,
 * record which one and move on — do not fake a pass. A missing CLI is a
 * SKIP with a reason, never a pass and never a failure. Live dispatches
 * consume a small amount of quota; --quick skips them.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AgyAdapter } from './adapters/agy.js';
import { CodexAdapter } from './adapters/codex.js';
import { CopilotAdapter } from './adapters/copilot.js';
import { KiroAdapter } from './adapters/kiro.js';
import { OpenCodeAdapter } from './adapters/opencode.js';
import type { BackendAdapter } from './adapters/types.js';
import { ensureStateHome, loadConfig, statePaths } from './config.js';
import { probeAgy, probeClaude, probeCodex, probeKiro, cliInfo } from './core/probes.js';
import type { BackendId } from './core/types.js';
import { tempDir } from './core/worktree.js';

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorOptions {
  quick?: boolean;
  full?: boolean;
}

const SMOKE_BRIEF =
  "Create a file named SMOKE.md in the current directory containing exactly the line 'jcode smoke ok' and nothing else. Do not modify any other file.";
const SMOKE_TIMEOUT_MS = 5 * 60 * 1000;

function parseVersion(text: string | undefined): [number, number, number] | null {
  if (!text) return null;
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionAtLeast(version: [number, number, number] | null, major: number, minor: number, patch: number): boolean {
  if (!version) return false;
  const [ma, mi, pa] = version;
  return ma > major || (ma === major && (mi > minor || (mi === minor && pa >= patch)));
}

async function runSmokeDispatch(backend: BackendId, adapter: BackendAdapter): Promise<CheckResult> {
  const dir = tempDir(`smoke-${backend}`);
  await mkdir(dir, { recursive: true });
  let tail = '';
  try {
    const result = await adapter.run(
      { taskId: `smoke-${backend}`, brief: SMOKE_BRIEF, backend, cwd: dir, timeoutMs: SMOKE_TIMEOUT_MS },
      {
        onStdout: (chunk) => { tail = `${tail}${chunk}`.slice(-2000); },
        onStderr: (chunk) => { tail = `${tail}${chunk}`.slice(-2000); },
      },
    );
    const marker = join(dir, 'SMOKE.md');
    let content = '';
    try {
      content = await readFile(marker, 'utf8');
    } catch {
      // Marker missing — the agent ran but did not do the job.
    }
    if (result.success && content.trim() === 'jcode smoke ok') {
      return { id: `dispatch-${backend}`, label: `headless dispatch (${backend})`, status: 'pass', detail: `SMOKE.md created in ${Math.round(result.durationMs / 1000)}s` };
    }
    if (result.success) {
      return { id: `dispatch-${backend}`, label: `headless dispatch (${backend})`, status: 'fail', detail: `exit 0 but SMOKE.md missing or wrong content` };
    }
    return {
      id: `dispatch-${backend}`,
      label: `headless dispatch (${backend})`,
      status: 'fail',
      detail: `exit ${result.exitCode ?? 'null'} (${result.errorClass ?? 'unknown'}): ${(result.stdoutTail ?? tail).trim().split('\n').slice(-2).join(' ') || 'no output'}`,
    };
  } catch (error) {
    return {
      id: `dispatch-${backend}`,
      label: `headless dispatch (${backend})`,
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runDoctor(options: DoctorOptions = {}): Promise<{ results: CheckResult[]; exitCode: number }> {
  const results: CheckResult[] = [];
  const config = await loadConfig();
  const push = (result: CheckResult) => {
    results.push(result);
    const mark = result.status === 'pass' ? 'PASS' : result.status === 'fail' ? 'FAIL' : 'SKIP';
    console.log(`[${mark}] ${result.label}: ${result.detail}`);
  };

  // ── Environment ──────────────────────────────────────────────────────
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  push({
    id: 'node',
    label: 'Node.js >= 20',
    status: nodeMajor >= 20 ? 'pass' : 'fail',
    detail: process.versions.node,
  });

  const git = await cliInfo('git');
  push({
    id: 'git',
    label: 'git (worktrees need it)',
    status: git.present ? 'pass' : 'fail',
    detail: git.version ?? 'not found on PATH',
  });

  // ── CLI presence + versions ──────────────────────────────────────────
  const binaries: Array<{ id: BackendId; binary: string; label: string }> = [
    { id: 'codex-a', binary: 'codex', label: 'codex' },
    { id: 'kiro', binary: 'kiro-cli', label: 'kiro-cli' },
    { id: 'agy', binary: 'agy', label: 'agy (Antigravity)' },
    { id: 'copilot', binary: 'copilot', label: 'copilot' },
    { id: 'opencode', binary: 'opencode', label: 'opencode' },
    { id: 'claude', binary: 'claude', label: 'claude' },
  ];
  const present = new Map<BackendId, boolean>();
  const versions = new Map<BackendId, string | undefined>();
  for (const { id, binary, label } of binaries) {
    const info = await cliInfo(binary);
    present.set(id, info.present);
    versions.set(id, info.version);
    push({
      id: `cli-${id}`,
      label: `CLI present: ${label}`,
      status: info.present ? 'pass' : 'skip',
      detail: info.present ? (info.version ?? 'installed') : `not installed — ${id} unavailable on this machine`,
    });
  }

  // Copilot >= 1.0.28 for reliable JSONL.
  if (present.get('copilot')) {
    const version = parseVersion(versions.get('copilot'));
    push({
      id: 'copilot-version',
      label: 'copilot >= 1.0.28 (reliable JSONL)',
      status: versionAtLeast(version, 1, 0, 28) ? 'pass' : 'fail',
      detail: versions.get('copilot') ?? 'version unknown',
    });
  } else {
    push({ id: 'copilot-version', label: 'copilot >= 1.0.28 (reliable JSONL)', status: 'skip', detail: 'copilot not installed' });
  }

  // OpenCode v2 only.
  if (present.get('opencode')) {
    const version = parseVersion(versions.get('opencode'));
    push({
      id: 'opencode-version',
      label: 'opencode v2',
      status: version && version[0] >= 2 ? 'pass' : 'fail',
      detail: versions.get('opencode') ?? 'version unknown',
    });
  } else {
    push({ id: 'opencode-version', label: 'opencode v2', status: 'skip', detail: 'opencode not installed' });
  }

  // ── Headless dispatch smoke tests (live — consumes a little quota) ───
  if (options.quick) {
    push({ id: 'dispatch', label: 'headless dispatch smoke tests', status: 'skip', detail: '--quick: presence + probes only' });
  } else {
    const adapters: Array<{ id: BackendId; adapter: BackendAdapter }> = [
      { id: 'codex-a', adapter: new CodexAdapter() },
      { id: 'kiro', adapter: new KiroAdapter() },
      { id: 'agy', adapter: new AgyAdapter() },
      { id: 'copilot', adapter: new CopilotAdapter() },
      { id: 'opencode', adapter: new OpenCodeAdapter() },
    ];
    for (const { id, adapter } of adapters) {
      if (!present.get(id)) {
        push({ id: `dispatch-${id}`, label: `headless dispatch (${id})`, status: 'skip', detail: 'CLI not installed' });
        continue;
      }
      push(await runSmokeDispatch(id, adapter));
    }
    // Claude: only after Pro arrives (~Nov 30) — never fake it.
    push({
      id: 'dispatch-claude',
      label: 'headless dispatch (claude)',
      status: 'skip',
      detail: config.claudeEnabled
        ? 'Pro enabled in config but smoke not run yet — run `jcode doctor` again after confirming Pro'
        : 'Claude Pro not confirmed live; skipped by design',
    });
  }

  // ── Quota probes ─────────────────────────────────────────────────────
  if (present.get('codex-a')) {
    for (const account of ['a', 'b'] as const) {
      const home = account === 'a' ? config.codexHomes.a : config.codexHomes.b;
      if (account === 'b' && !home) {
        push({ id: `probe-codex-b`, label: 'quota probe: codex-b app-server', status: 'skip', detail: 'no second CODEX_HOME configured (JCODE_CODEX_B_HOME)' });
        continue;
      }
      const probed = await probeCodex(config, account).catch(() => null);
      push({
        id: `probe-codex-${account}`,
        label: `quota probe: codex-${account} app-server`,
        status: probed ? 'pass' : 'fail',
        detail: probed
          ? `${Math.round((probed.remainingFraction ?? 0) * 100)}% remaining, reset ${probed.resetsAt ?? 'unknown'}`
          : 'app-server probe returned no windows — check CODEX_HOME auth',
      });
    }
  } else {
    push({ id: 'probe-codex', label: 'quota probe: codex app-server', status: 'skip', detail: 'codex not installed' });
  }

  if (present.get('kiro')) {
    const probed = await probeKiro().catch(() => null);
    push({
      id: 'probe-kiro',
      label: 'quota probe: kiro /usage',
      status: probed ? 'pass' : 'fail',
      detail: probed ? `${Math.round((probed.remainingFraction ?? 0) * 100)}% remaining` : '/usage output unparseable or command failed',
    });
  } else {
    push({ id: 'probe-kiro', label: 'quota probe: kiro /usage', status: 'skip', detail: 'kiro-cli not installed' });
  }

  const agyReader = await cliInfo('agy-cli-usage');
  if (!agyReader.present) {
    push({ id: 'probe-agy', label: 'quota probe: agy reader', status: 'skip', detail: 'agy-cli-usage not installed — reactive mode (per-run usage + 429s) is the design, not a bug' });
  } else {
    const probed = await probeAgy().catch(() => null);
    push({
      id: 'probe-agy',
      label: 'quota probe: agy reader',
      status: probed ? 'pass' : 'fail',
      detail: probed ? `${Math.round((probed.remainingFraction ?? 0) * 100)}% remaining` : 'reader ran but returned no usable quota',
    });
  }

  push({
    id: 'probe-copilot',
    label: 'quota probe: copilot',
    status: 'skip',
    detail: 'no account-level quota via the CLI by design — per-run premiumRequests accounting + exit code 3 signal instead',
  });
  push({
    id: 'probe-opencode',
    label: 'quota probe: opencode',
    status: 'skip',
    detail: 'no native quota (bring-your-own-provider) — usage logs only',
  });

  const claudeProbe = await probeClaude().catch(() => null);
  push({
    id: 'probe-claude',
    label: 'quota probe: claude status-line file',
    status: claudeProbe ? 'pass' : 'skip',
    detail: claudeProbe
      ? `${Math.round((claudeProbe.remainingFraction ?? 0) * 100)}% remaining`
      : 'no status-line rate_limits file yet — written only when Claude Code runs (JCODE_CLAUDE_RATE_LIMITS_FILE)',
  });

  // ── Caveman ──────────────────────────────────────────────────────────
  const caveman = await cliInfo('caveman');
  push({
    id: 'caveman-present',
    label: 'caveman installed',
    status: caveman.present ? 'pass' : 'skip',
    detail: caveman.present ? (caveman.version ?? 'installed') : 'not installed — Phase 3; install with `npx @caveman-ai/cli@latest`, telemetry off, Auto off',
  });
  if (options.full && caveman.present && present.get('codex-a')) {
    // Wrap test: does `caveman codex exec` keep the JSON stream intact?
    const dir = tempDir('smoke-caveman');
    await mkdir(dir, { recursive: true });
    try {
      const result = await new Promise<{ exitCode: number | null; stdout: string }>((resolve) => {
        execFile(
          'caveman',
          ['codex', 'exec', '--json', '--sandbox', 'workspace-write', '-C', dir, SMOKE_BRIEF],
          { timeout: SMOKE_TIMEOUT_MS, windowsHide: true },
          (error, stdout) => resolve({ exitCode: error ? 1 : 0, stdout: stdout.toString() }),
        );
      });
      const hasJson = result.stdout.split('\n').some((line) => line.trim().startsWith('{'));
      push({
        id: 'caveman-wrap',
        label: 'caveman wraps codex exec (JSON stream intact)',
        status: result.exitCode === 0 && hasJson ? 'pass' : 'fail',
        detail: result.exitCode === 0 && hasJson ? 'JSON events survived the proxy' : 'wrap broke the stream or the run failed — fall back to skill-only install',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } else {
    push({
      id: 'caveman-wrap',
      label: 'caveman wraps codex exec (JSON stream intact)',
      status: 'skip',
      detail: options.full ? 'needs caveman + codex installed' : 'run `jcode doctor --full` for the live wrap test',
    });
  }

  // ── MCP config presence (full load test needs the Phase 4 server) ────
  const home = homedir();
  const mcpPaths: Array<{ id: string; label: string; path: string }> = [
    { id: 'mcp-codex', label: 'MCP config: codex config.toml', path: join(home, '.codex', 'config.toml') },
    { id: 'mcp-kiro', label: 'MCP config: kiro mcp.json', path: join(home, '.kiro', 'settings', 'mcp.json') },
    { id: 'mcp-claude', label: 'MCP config: claude .mcp.json', path: join(home, '.claude.json') },
  ];
  for (const { id, label, path } of mcpPaths) {
    let exists = false;
    try {
      await readFile(path, 'utf8');
      exists = true;
    } catch {
      exists = false;
    }
    push({
      id,
      label,
      status: 'skip',
      detail: exists
        ? 'config file exists — full load test needs the Phase 4 MCP server'
        : 'no config file yet — the Phase 4 server will add one',
    });
  }

  // ── Record + summary ─────────────────────────────────────────────────
  const summary = {
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    skip: results.filter((r) => r.status === 'skip').length,
  };
  await ensureStateHome();
  await writeFile(
    statePaths().smoke,
    `${JSON.stringify({ timestamp: new Date().toISOString(), host: process.platform, node: process.versions.node, summary, checks: results }, null, 2)}\n`,
  );
  console.log(`\nDoctor: ${summary.pass} passed, ${summary.fail} failed, ${summary.skip} skipped. Record: ${statePaths().smoke}`);
  if (summary.fail > 0) {
    console.log('Phase 0 is NOT green. Fix the failures above; do not start Phase 1 work that depends on them.');
  } else {
    console.log('Phase 0 gate: no failures. Skipped checks are recorded, not passed — rerun after installing the missing CLIs.');
  }
  return { results, exitCode: summary.fail > 0 ? 1 : 0 };
}
