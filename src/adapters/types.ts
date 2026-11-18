import type { RunRequest, RunResult } from '../core/types.js';

export interface AdapterCallbacks {
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
}

export interface BackendAdapter {
  run(request: RunRequest, callbacks: AdapterCallbacks): Promise<RunResult>;
}
