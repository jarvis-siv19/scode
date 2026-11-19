import { spawn } from 'node:child_process';
import type { ErrorClass, RunRequest, RunResult, RunUsage } from '../core/types.js';
import type { AdapterCallbacks } from './types.js';

export interface SpawnSpec {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

/** One parsed JSON event from a vendor CLI's stream-json output. */
export interface StreamEvent {
  raw: Record<string, unknown>;
}

/** Extended callbacks: adapters may listen to parsed JSON events. */
export interface ProcessCallbacks extends AdapterCallbacks {
  onEvent?: (event: StreamEvent) => void;
}

const TAIL_BYTES = 8192;
const KILL_GRACE_MS = 10_000;

/** Strings that mean "quota/rate limit" in vendor output (checked case-insensitively). */
const QUOTA_PATTERNS = [
  'rate limit',
  'rate_limit',
  'ratelimit',
  'insufficient_quota',
  'quota exceeded',
  'quota_exceeded',
  'usage limit',
  'weekly limit',
  'you have hit',
  'too many requests',
  '429',
];

const AVAILABILITY_PATTERNS = [
  '500 internal server error',
  '502 bad gateway',
  '503 service unavailable',
  '504 gateway timeout',
  'econnrefused',
  'econnreset',
  'enotfound',
  'socket hang up',
  'network error',
];

/** Classify a failure from exit code + output tail. Pure — unit-tested. */
export function classifyFailure(exitCode: number | null, tail: string, timedOut: boolean, cancelled = false): ErrorClass | null {
  if (timedOut) return 'timeout';
  if (cancelled) return 'cancelled';
  if (exitCode === 0 || exitCode === null) return null;
  const text = tail.toLowerCase();
  if (QUOTA_PATTERNS.some((pattern) => text.includes(pattern))) return 'quota';
  if (AVAILABILITY_PATTERNS.some((pattern) => text.includes(pattern))) return 'availability';
  if (text.includes('unauthorized') || text.includes('401') || text.includes('authentication') || text.includes('not logged in')) return 'auth';
  return 'backend-error';
}

/** Pull a session id out of parsed events (vendor key names differ). */
export function extractSessionId(events: StreamEvent[]): string | undefined {
  for (const { raw } of events) {
    for (const key of ['session_id', 'sessionId', 'sessionID', 'thread_id', 'threadId', 'conversation_id', 'conversationId', 'resume_id']) {
      const value = raw[key];
      if (typeof value === 'string' && value) return value;
    }
    // Some CLIs nest it: { result: { session_id } } or { payload: {...} }.
    for (const nest of ['result', 'payload', 'data']) {
      const inner = raw[nest];
      if (typeof inner === 'object' && inner !== null) {
        for (const key of ['session_id', 'sessionId', 'thread_id', 'threadId']) {
          const value = (inner as Record<string, unknown>)[key];
          if (typeof value === 'string' && value) return value;
        }
      }
    }
  }
  return undefined;
}

/** Pull token/cost usage out of parsed events (best-effort, vendor shapes differ). */
export function extractUsage(events: StreamEvent[]): RunUsage | undefined {
  let usage: RunUsage | undefined;
  for (const { raw } of events) {
    const part = raw.part as Record<string, unknown> | undefined;
    const candidates = [raw, raw.usage, part?.tokens, (raw.result as Record<string, unknown> | undefined)?.usage];
    for (const candidate of candidates) {
      if (typeof candidate !== 'object' || candidate === null) continue;
      const u = candidate as Record<string, unknown>;
      const found: RunUsage = {};
      if (typeof u.input_tokens === 'number') found.inputTokens = u.input_tokens;
      if (typeof u.output_tokens === 'number') found.outputTokens = u.output_tokens;
      if (typeof u.inputTokens === 'number') found.inputTokens = u.inputTokens;
      if (typeof u.outputTokens === 'number') found.outputTokens = u.outputTokens;
      if (typeof u.input === 'number') found.inputTokens = u.input;
      if (typeof u.output === 'number') found.outputTokens = u.output;
      if (typeof u.total_cost_usd === 'number') found.totalCostUsd = u.total_cost_usd;
      if (typeof u.premiumRequests === 'number') found.premiumRequests = u.premiumRequests;
      if (typeof u.premium_requests === 'number') found.premiumRequests = u.premium_requests;
      if (Object.keys(found).length > 0) usage = { ...usage, ...found };
    }
  }
  return usage;
}

function textFromContent(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!Array.isArray(value)) return undefined;
  const parts = value.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    return typeof record.text === 'string' ? [record.text] : [];
  }).filter((part) => part.trim());
  return parts.length > 0 ? parts.join('\n').trim() : undefined;
}

/** Extract only user-facing assistant prose, never JSON protocol/log events. */
export function extractDisplayText(raw: Record<string, unknown>): string | undefined {
  const item = typeof raw.item === 'object' && raw.item !== null ? raw.item as Record<string, unknown> : undefined;
  if (item && ['agent_message', 'assistant_message', 'message'].includes(String(item.type ?? ''))) {
    return textFromContent(item.text ?? item.content ?? item.message);
  }
  const part = typeof raw.part === 'object' && raw.part !== null ? raw.part as Record<string, unknown> : undefined;
  if (part && ['text', 'assistant', 'message'].includes(String(part.type ?? ''))) {
    return textFromContent(part.text ?? part.content);
  }
  const type = String(raw.type ?? '').toLowerCase();
  if (['result', 'assistant', 'assistant_message', 'message', 'text'].includes(type)) {
    const direct = textFromContent(raw.result ?? raw.text ?? raw.content ?? raw.message);
    if (direct) return direct;
  }
  const message = typeof raw.message === 'object' && raw.message !== null ? raw.message as Record<string, unknown> : undefined;
  if (message && String(message.role ?? '').toLowerCase() === 'assistant') {
    return textFromContent(message.content ?? message.text);
  }
  return undefined;
}

export function runProcess(spec: SpawnSpec, request: RunRequest, callbacks: ProcessCallbacks): Promise<RunResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  // Dry run: report the exact command, run nothing.
  if (request.dryRun) {
    const rendered = [spec.command, ...spec.args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg))].join(' ');
    console.log(`[dry-run] ${rendered}`);
    if (spec.env && Object.keys(spec.env).length > 0) {
      console.log(`[dry-run] env: ${Object.keys(spec.env).join(', ')}`);
    }
    const finished = Date.now();
    return Promise.resolve({
      taskId: request.taskId,
      backend: request.backend,
      startedAt,
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - started,
      exitCode: 0,
      signal: null,
      success: true,
      errorClass: null,
    });
  }

  if (request.signal?.aborted) {
    const finished = Date.now();
    return Promise.resolve({
      taskId: request.taskId,
      backend: request.backend,
      startedAt,
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - started,
      exitCode: null,
      signal: null,
      success: false,
      errorClass: 'cancelled',
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: request.cwd,
      env: { ...process.env, ...spec.env },
      shell: false,
      windowsHide: true,
    });
    // Headless vendor CLIs may interpret an open pipe as more prompt input.
    // scode passes the complete brief in argv, so close stdin immediately.
    child.stdin.end();

    let timedOut = false;
    let cancelled = false;
    let tail = '';
    let lineBuffer = '';
    const events: StreamEvent[] = [];
    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      request.signal?.removeEventListener('abort', onAbort);
    };
    const terminate = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, KILL_GRACE_MS);
      killTimer.unref();
    };
    const onAbort = () => {
      cancelled = true;
      terminate();
    };
    const pushTail = (chunk: string) => {
      tail = `${tail}${chunk}`.slice(-TAIL_BYTES);
    };
    const scanLines = (chunk: string) => {
      lineBuffer += chunk;
      let newline = lineBuffer.indexOf('\n');
      while (newline !== -1) {
        const line = lineBuffer.slice(0, newline).trim();
        lineBuffer = lineBuffer.slice(newline + 1);
        if (line.startsWith('{')) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            events.push({ raw: parsed });
            callbacks.onEvent?.({ raw: parsed });
            const display = extractDisplayText(parsed);
            if (display) callbacks.onDisplay?.(display);
          } catch {
            // Not JSON — plain output line, ignore for events.
          }
        }
        newline = lineBuffer.indexOf('\n');
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      callbacks.onStdout(text);
      pushTail(text);
      scanLines(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      callbacks.onStderr(text);
      pushTail(text);
    });
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });

    if (request.signal) {
      request.signal.addEventListener('abort', onAbort, { once: true });
      if (request.signal.aborted) onAbort();
    }

    timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, request.timeoutMs);
    timer.unref();

    child.on('close', (exitCode, signal) => {
      cleanup();
      const finished = Date.now();
      const errorClass = classifyFailure(exitCode, tail, timedOut, cancelled);
      resolve({
        taskId: request.taskId,
        backend: request.backend,
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        durationMs: finished - started,
        exitCode,
        signal,
        success: exitCode === 0 && !timedOut && !cancelled,
        errorClass,
        sessionId: extractSessionId(events),
        usage: extractUsage(events),
        stdoutTail: tail || undefined,
      });
    });
  });
}
