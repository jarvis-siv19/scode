export const BACKEND_IDS = [
  'codex-a',
  'codex-b',
  'kiro',
  'agy',
  'copilot',
  'opencode',
  'claude',
] as const;

export type BackendId = (typeof BACKEND_IDS)[number];

export type BackendStatus = 'available' | 'unavailable' | 'cooling-down' | 'disabled';

export interface QuotaWindow {
  remainingFraction: number | null;
  resetsAt: string | null;
  windowMinutes: number | null;
  source: 'probe' | 'manual' | 'placeholder';
  observedAt: string;
}

export interface BackendSnapshot {
  id: BackendId;
  status: BackendStatus;
  model: string;
  quota: QuotaWindow;
  note?: string;
}

export interface RunRequest {
  taskId: string;
  brief: string;
  backend: BackendId;
  cwd: string;
  timeoutMs: number;
}

export interface RunResult {
  taskId: string;
  backend: BackendId;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  success: boolean;
  errorClass: string | null;
}
