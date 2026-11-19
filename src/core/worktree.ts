/**
 * One git worktree per job (handoff §5): parallel jobs never share a working
 * tree, and a failed job's worktree is kept for inspection and resume.
 * Falls back to running in cwd when cwd is not inside a git repo.
 */
import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 60_000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ stdout: stdout.toString(), stderr: stderr.toString(), exitCode: error ? (error as { code?: number }).code ?? 1 : 0 });
    });
  });
}

export async function gitRoot(cwd: string): Promise<string | null> {
  const { stdout, exitCode } = await execGit(['rev-parse', '--show-toplevel'], cwd);
  if (exitCode !== 0) return null;
  return stdout.trim() || null;
}

export interface Worktree {
  path: string;
  /** True when this is a real git worktree (vs a cwd fallback). */
  isWorktree: boolean;
}

/**
 * Create a worktree for `taskId` at <repo>/.git/jcode-worktrees/<taskId>,
 * branched off the current HEAD. Returns a cwd fallback when not in a repo.
 */
export async function createWorktree(taskId: string, cwd: string): Promise<Worktree> {
  const root = await gitRoot(cwd);
  if (!root) return { path: cwd, isWorktree: false };
  const base = join(root, '.git', 'jcode-worktrees');
  await mkdir(base, { recursive: true }).catch(() => undefined);
  const path = join(base, taskId);
  const { exitCode, stderr } = await execGit(['worktree', 'add', '--detach', path, 'HEAD'], root);
  if (exitCode !== 0) {
    // Worktree creation failed (e.g. dirty index edge cases) — run in cwd
    // rather than failing the job; the ledger records the fallback.
    console.error(`[scode] worktree create failed, running in cwd: ${stderr.trim().split('\n')[0] ?? ''}`);
    return { path: cwd, isWorktree: false };
  }
  return { path, isWorktree: true };
}

/** Remove a worktree. Kept jobs (failures) are removed only when asked. */
export async function removeWorktree(worktree: Worktree, repoCwd: string): Promise<void> {
  if (!worktree.isWorktree) return;
  const root = await gitRoot(repoCwd);
  if (root) {
    const { exitCode } = await execGit(['worktree', 'remove', '--force', worktree.path], root);
    if (exitCode === 0) return;
  }
  await rm(worktree.path, { recursive: true, force: true });
}

/** Scratch dir for smoke tests and other throwaway work. */
export function tempDir(label: string): string {
  return join(tmpdir(), `jcode-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}
