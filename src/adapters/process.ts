import { spawn } from 'node:child_process';
import type { RunRequest, RunResult } from '../core/types.js';
import type { AdapterCallbacks } from './types.js';

export interface SpawnSpec {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export function runProcess(spec: SpawnSpec, request: RunRequest, callbacks: AdapterCallbacks): Promise<RunResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: request.cwd,
      env: { ...process.env, ...spec.env },
      shell: false,
      windowsHide: true,
    });
    // Headless vendor CLIs may interpret an open pipe as more prompt input.
    // jcode passes the complete brief in argv, so close stdin immediately.
    child.stdin.end();

    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => callbacks.onStdout(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => callbacks.onStderr(chunk.toString()));
    child.on('error', reject);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, request.timeoutMs);
    timer.unref();

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      const finished = Date.now();
      resolve({
        taskId: request.taskId,
        backend: request.backend,
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        durationMs: finished - started,
        exitCode,
        signal,
        success: exitCode === 0 && !timedOut,
        errorClass: timedOut ? 'timeout' : exitCode === 0 ? null : 'backend-error',
      });
    });
  });
}
