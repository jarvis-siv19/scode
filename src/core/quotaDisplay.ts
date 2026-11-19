import type { BackendSnapshot } from './types.js';

export interface DisplayQuotaWindow {
  label: string;
  usage: string;
  reset: string;
}

function windowLabel(name: string | undefined, minutes: number | null | undefined): string {
  if (minutes === 300) return '5h';
  if (minutes === 10_080) return 'Weekly';
  if (minutes === 43_200 || minutes === 44_640) return 'Monthly';
  if (!name) return 'Usage';
  if (name.toLowerCase() === 'primary') return 'Primary';
  if (name.toLowerCase() === 'secondary') return 'Secondary';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Local date plus useful relative time: `Nov 23 · 5d` or `Nov 19 6:41a · 4h`. */
export function formatQuotaReset(resetsAt: string | null, now = new Date()): string {
  if (!resetsAt) return '—';
  const reset = new Date(resetsAt);
  const ms = reset.getTime() - now.getTime();
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'reset due';

  const date = reset.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(reset.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const relative = minutes < 60 ? `${minutes}m`
    : minutes < 1_440 ? `${Math.floor(minutes / 60)}h`
      : `${Math.ceil(minutes / 1_440)}d`;
  const time = reset.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'a')
    .replace(' PM', 'p');
  return `${date}${minutes < 1_440 ? ` ${time}` : ''} · ${relative}`;
}

function usageText(remainingFraction: number): string {
  return `${Math.round((1 - remainingFraction) * 100)}% used`;
}

/** Every real quota window for display; Codex normally returns 5h + weekly. */
export function displayQuotaWindows(backend: BackendSnapshot, now = new Date()): DisplayQuotaWindow[] {
  if (backend.quota.windows && backend.quota.windows.length > 0) {
    return [...backend.quota.windows]
      .sort((a, b) => a.windowMinutes - b.windowMinutes)
      .map((window) => ({
        label: windowLabel(window.name, window.windowMinutes),
        usage: usageText(window.remainingFraction),
        reset: formatQuotaReset(window.resetsAt, now),
      }));
  }
  if (backend.quota.remainingFraction !== null) {
    return [{
      label: windowLabel(undefined, backend.quota.windowMinutes),
      usage: usageText(backend.quota.remainingFraction),
      reset: formatQuotaReset(backend.quota.resetsAt, now),
    }];
  }
  return [];
}
