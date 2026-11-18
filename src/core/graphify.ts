/**
 * Graphify integration — a local code knowledge graph per repo, so agents
 * query the map instead of grepping and re-reading whole files.
 *
 * What this uses: the open-source Graphify CLI (`graphifyy` on PyPI), code-only
 * mode only. `graphify update` parses code locally with tree-sitter — no LLM
 * calls, nothing leaves the machine. The hosted Graphify Cloud product is
 * deliberately NOT used: it sends code to third-party subprocessors and is
 * paid past 3 repos, which breaks jcode's local-first, no-paid-credits rules.
 *
 * Rules this module enforces:
 * - Never call `graphify extract` (the full pipeline needs an LLM backend).
 *   Only `update` (code-only), `query`/`path`/`explain`/`affected`/`god-nodes`,
 *   and `hook install` are ever run.
 * - The graph is always queried with a token budget, never pasted into
 *   context: a 1,500-node graph is ~400K tokens as raw JSON.
 * - A missing or failing graph never fails a job. Builds are best-effort and
 *   the dispatcher warns and continues.
 *
 * Layout: one graph per repo at `<repo>/graphify-out/graph.json` (or
 * $GRAPHIFY_OUT when set). Freshness is checked against graph.json's
 * `built_at_commit` field vs `git rev-parse HEAD` — verified live against
 * graphify 0.9.112, where the field matched HEAD exactly.
 *
 * Worktrees: jcode dispatches into per-job worktrees, but the graph lives in
 * the MAIN checkout (it describes the base commit, which is what navigation
 * needs). `resolveMainCheckout()` finds the main checkout from any cwd via
 * `git rev-parse --git-common-dir`, so the query tool works from a worktree.
 *
 * Known gap (verified Nov 18, 2026): Dart/Flutter code is NOT parsed — a
 * .dart file contributed only its import string as a node, no classes or
 * functions. Do not promise graph coverage for Flutter repos.
 */
import { spawn } from 'node:child_process';
import { access, appendFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { cliInfo } from './probes.js';

export const GRAPHIFY_OUT_DIRNAME = 'graphify-out';
export const GRAPHIFY_BUILD_TIMEOUT_MS = 5 * 60 * 1000;
export const GRAPHIFY_QUERY_TIMEOUT_MS = 60_000;
export const GRAPHIFY_DEFAULT_BUDGET = 2000;
export const GRAPHIFY_DEFAULT_DEPTH = 2;

export interface GraphMeta {
  builtAtCommit: string | null;
  nodeCount: number | null;
  graphifyVersion: string | null;
  schemaVersion: number | null;
}

export interface GraphStatus {
  /** Directory holding the graph (graphify-out/, or $GRAPHIFY_OUT). */
  outDir: string;
  present: boolean;
  builtAtCommit: string | null;
  headCommit: string | null;
  /** True only when both commits are known and differ. */
  stale: boolean;
  nodeCount: number | null;
  graphifyVersion: string | null;
  schemaVersion: number | null;
}

export interface GraphBuildResult {
  ok: boolean;
  durationMs: number;
  /** Last ~1000 chars of combined output on failure; summary line on success. */
  output: string;
  nodeCount: number | null;
}

export type GraphQueryKind = 'query' | 'explain' | 'path' | 'affected' | 'god-nodes';

export interface GraphQueryResult {
  ok: boolean;
  /** The graph's answer (or, on ok=false, why the query failed). */
  text: string;
}

export type EnsureGraphAction = 'built' | 'up-to-date' | 'skipped' | 'failed';

export interface EnsureGraphResult {
  action: EnsureGraphAction;
  status: GraphStatus;
  detail: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runCommand(command: string, args: string[], options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout: options.timeoutMs ?? 60_000,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => resolvePromise({ stdout, stderr: `${stderr}\n${err.message}`, code: null }));
    child.on('close', (code) => resolvePromise({ stdout, stderr, code }));
  });
}

/** Is the Graphify CLI installed? Only ENOENT means absent (cliInfo rule). */
export async function graphifyInfo(): Promise<{ present: boolean; version: string | null }> {
  const info = await cliInfo('graphify');
  return { present: info.present, version: info.version ?? null };
}

/** Is the graphify-mcp binary present (the [mcp] extra)? Informational only — jcode queries via the CLI, not the MCP server. */
export async function graphifyMcpPresent(): Promise<boolean> {
  return (await cliInfo('graphify-mcp')).present;
}

/** Python version, for the doctor check (Graphify needs Python 3.11+). */
export async function pythonInfo(): Promise<{ present: boolean; version: string | null }> {
  const binary = process.platform === 'win32' ? 'python' : 'python3';
  const info = await cliInfo(binary);
  return { present: info.present, version: info.version ?? null };
}

/**
 * The main checkout for a cwd: for a normal repo this is the repo itself; for
 * a jcode worktree it is the checkout the worktree was made from. Falls back
 * to the cwd itself when git cannot answer.
 */
export async function resolveMainCheckout(cwd: string): Promise<string> {
  const result = await runCommand('git', ['rev-parse', '--git-common-dir'], { cwd, timeoutMs: 10_000 });
  if (result.code !== 0) return resolve(cwd);
  const commonDir = result.stdout.trim();
  if (!commonDir) return resolve(cwd);
  return dirname(resolve(cwd, commonDir));
}

export function graphOutDir(repoPath: string): string {
  const override = process.env.GRAPHIFY_OUT;
  if (override) return isAbsolute(override) ? override : join(repoPath, override);
  return join(repoPath, GRAPHIFY_OUT_DIRNAME);
}

export function graphJsonPath(repoPath: string): string {
  return join(graphOutDir(repoPath), 'graph.json');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Read graph.json's header fields. Returns null when the graph is missing or unparseable. */
export async function readGraphMeta(repoPath: string): Promise<GraphMeta | null> {
  try {
    const raw = await readFile(graphJsonPath(repoPath), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const graph = (parsed.graph ?? {}) as Record<string, unknown>;
    return {
      builtAtCommit: typeof parsed.built_at_commit === 'string' ? parsed.built_at_commit : null,
      nodeCount: Array.isArray(parsed.nodes) ? parsed.nodes.length : null,
      graphifyVersion: typeof graph.graphify_version === 'string' ? graph.graphify_version : null,
      schemaVersion: typeof graph.schema_version === 'number' ? graph.schema_version : null,
    };
  } catch {
    return null;
  }
}

export async function headCommit(repoPath: string): Promise<string | null> {
  const result = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: repoPath, timeoutMs: 10_000 });
  if (result.code !== 0) return null;
  const sha = result.stdout.trim();
  return sha || null;
}

export async function graphStatus(repoPath: string): Promise<GraphStatus> {
  const outDir = graphOutDir(repoPath);
  const meta = await readGraphMeta(repoPath);
  const head = await headCommit(repoPath);
  const stale = meta !== null && meta.builtAtCommit !== null && head !== null && meta.builtAtCommit !== head;
  return {
    outDir,
    present: meta !== null,
    builtAtCommit: meta?.builtAtCommit ?? null,
    headCommit: head,
    stale,
    nodeCount: meta?.nodeCount ?? null,
    graphifyVersion: meta?.graphifyVersion ?? null,
    schemaVersion: meta?.schemaVersion ?? null,
  };
}

/**
 * Build (or rebuild) the graph for a repo. Code-only: `graphify update` needs
 * no LLM and no API key. Never throws — failures come back as { ok: false }.
 */
export async function buildGraph(
  repoPath: string,
  options: { force?: boolean; timeoutMs?: number; binary?: string } = {},
): Promise<GraphBuildResult> {
  const started = Date.now();
  const args = ['update', repoPath];
  if (options.force) args.push('--force');
  const result = await runCommand(options.binary ?? 'graphify', args, { cwd: repoPath, timeoutMs: options.timeoutMs ?? GRAPHIFY_BUILD_TIMEOUT_MS });
  const durationMs = Date.now() - started;
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0) {
    return { ok: false, durationMs, output: combined.slice(-1000) || `graphify update exited ${result.code ?? 'null'} with no output`, nodeCount: null };
  }
  const meta = await readGraphMeta(repoPath);
  const summary = combined.split('\n').find((line) => /nodes?,\s*\d+\s*edges?/.test(line))?.trim();
  return {
    ok: true,
    durationMs,
    output: summary ?? `graph updated (${meta?.nodeCount ?? '?'} nodes)`,
    nodeCount: meta?.nodeCount ?? null,
  };
}

/**
 * Run one graph query. Exit codes are part of the CLI's contract (verified
 * against 0.9.112): 0 = answer, 3 = ambiguous name (candidates listed in the
 * output), 4 = no node matches. 3 and 4 are answers the agent can act on,
 * not errors — only a spawn failure or any other exit code is ok: false.
 */
export async function runGraphQuery(
  repoPath: string,
  kind: GraphQueryKind,
  options: { question?: string; target?: string; budget?: number; depth?: number; binary?: string } = {},
): Promise<GraphQueryResult> {
  const graphPath = graphJsonPath(repoPath);
  const budget = options.budget ?? GRAPHIFY_DEFAULT_BUDGET;
  const depth = options.depth ?? GRAPHIFY_DEFAULT_DEPTH;
  let args: string[];
  switch (kind) {
    case 'query':
      if (!options.question) return { ok: false, text: 'graph-query: kind "query" needs a question.' };
      args = ['query', options.question, '--graph', graphPath, '--budget', String(budget), '--depth', String(depth)];
      break;
    case 'explain':
      if (!options.question) return { ok: false, text: 'graph-query: kind "explain" needs a symbol name as the question.' };
      args = ['explain', options.question, '--graph', graphPath];
      break;
    case 'path':
      if (!options.question || !options.target) return { ok: false, text: 'graph-query: kind "path" needs a question (start node) and a target (end node).' };
      args = ['path', options.question, options.target, '--graph', graphPath];
      break;
    case 'affected':
      if (!options.question) return { ok: false, text: 'graph-query: kind "affected" needs a symbol name as the question.' };
      args = ['affected', options.question, '--graph', graphPath, '--depth', String(depth)];
      break;
    case 'god-nodes':
      args = ['god-nodes', '--top', '10', '--graph', graphPath, '--json'];
      break;
  }
  const result = await runCommand(options.binary ?? 'graphify', args, { cwd: repoPath, timeoutMs: GRAPHIFY_QUERY_TIMEOUT_MS });
  const text = result.stdout.trim() || result.stderr.trim();
  if (result.code === 0 || result.code === 3 || result.code === 4) {
    return { ok: true, text: text || '[graph-query: the graph returned no output]' };
  }
  return { ok: false, text: `graph-query: graphify ${kind} failed (exit ${result.code ?? 'null'}): ${text.slice(-500) || 'no output'}` };
}

/** Install graphify's git hooks (post-commit/post-checkout/post-merge/post-rewrite) so the graph refreshes on commit. */
export async function installGraphHooks(repoPath: string, options: { binary?: string } = {}): Promise<{ ok: boolean; output: string }> {
  const result = await runCommand(options.binary ?? 'graphify', ['hook', 'install'], { cwd: repoPath, timeoutMs: 30_000 });
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  return { ok: result.code === 0, output: combined.slice(-500) || (result.code === 0 ? 'hooks installed' : 'hook install failed with no output') };
}

/** Make sure .gitignore excludes the graph output dir. Returns what happened. */
export async function ensureGitignored(repoPath: string): Promise<'added' | 'present' | 'error'> {
  const ignorePath = join(repoPath, '.gitignore');
  try {
    let content = '';
    try {
      content = await readFile(ignorePath, 'utf8');
    } catch {
      content = '';
    }
    const lines = content.split('\n').map((line) => line.trim());
    if (lines.includes(GRAPHIFY_OUT_DIRNAME) || lines.includes(`${GRAPHIFY_OUT_DIRNAME}/`)) return 'present';
    const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    await appendFile(ignorePath, `${suffix}${GRAPHIFY_OUT_DIRNAME}/\n`);
    return 'added';
  } catch {
    return 'error';
  }
}

/**
 * The dispatcher's pre-flight: build the graph when it is missing or stale,
 * leave it alone when it is current. Never throws and never fails a job —
 * every failure path returns 'skipped' or 'failed' with a detail string.
 */
export async function ensureGraph(repoPath: string, options: { binary?: string } = {}): Promise<EnsureGraphResult> {
  try {
    const info = options.binary ? { present: true, version: null } : await graphifyInfo();
    if (!info.present) {
      return { action: 'skipped', status: await graphStatus(repoPath), detail: 'graphify is not installed — skipping graph build (install with uv tool install "graphifyy[mcp]" to enable it)' };
    }
    const status = await graphStatus(repoPath);
    if (status.present && !status.stale) {
      return { action: 'up-to-date', status, detail: `graph current (${status.nodeCount ?? '?'} nodes, built at ${status.builtAtCommit?.slice(0, 7) ?? 'unknown'})` };
    }
    const build = await buildGraph(repoPath, { binary: options.binary });
    if (!build.ok) {
      return { action: 'failed', status, detail: `graph build failed, continuing without it: ${build.output}` };
    }
    const after = await graphStatus(repoPath);
    return {
      action: 'built',
      status: after,
      detail: `graph ${status.present ? 'rebuilt (was stale)' : 'built'}: ${build.nodeCount ?? '?'} nodes in ${(build.durationMs / 1000).toFixed(1)}s`,
    };
  } catch (error) {
    return { action: 'failed', status: await graphStatus(repoPath).catch(() => ({ outDir: graphOutDir(repoPath), present: false, builtAtCommit: null, headCommit: null, stale: false, nodeCount: null, graphifyVersion: null, schemaVersion: null })), detail: `graph check failed, continuing without it: ${error instanceof Error ? error.message : String(error)}` };
  }
}
