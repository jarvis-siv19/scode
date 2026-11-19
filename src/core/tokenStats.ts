import type { BackendId } from './types.js';

/**
 * Token usage dashboard data, computed from the ledger (`run-finished`
 * records carry `usage` when the backend reported it). All windows are
 * LOCAL calendar days: today is this local day, the week is today plus the
 * previous six local days.
 *
 * Honesty rule: runs that reported no token data count in `runs` but add
 * zero tokens, and the dashboard says how many such runs there are — the
 * totals are "tokens we know about", never padded to look complete.
 */

export interface TokenTotals {
  input: number;
  output: number;
  total: number;
  costUsd: number;
  premiumRequests: number;
  runs: number;
  runsWithUsage: number;
}

export interface BackendTokens extends TokenTotals {
  backend: BackendId;
}

export interface DayTokens {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Short label, e.g. "Wed 18". */
  label: string;
  input: number;
  output: number;
  total: number;
}

export interface TokenStats {
  today: TokenTotals;
  week: TokenTotals;
  byBackendToday: BackendTokens[];
  byBackendWeek: BackendTokens[];
  /** Last 7 local days, oldest first (today last). */
  daily: DayTokens[];
  /** Caveman on-vs-off over the week window; null unless both sides ran. */
  caveman: { on: TokenTotals; off: TokenTotals } | null;
  /** Scheduled runs over the week window (subset of `week`). */
  scheduledWeek: TokenTotals;
}

type LedgerRecord = Record<string, unknown>;

function emptyTotals(): TokenTotals {
  return { input: 0, output: 0, total: 0, costUsd: 0, premiumRequests: 0, runs: 0, runsWithUsage: 0 };
}

function addRun(totals: TokenTotals, record: LedgerRecord): void {
  totals.runs += 1;
  const usage = record.usage as { inputTokens?: number; outputTokens?: number; totalCostUsd?: number; premiumRequests?: number } | undefined;
  if (!usage) return;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  if (usage.inputTokens === undefined && usage.outputTokens === undefined && usage.totalCostUsd === undefined && usage.premiumRequests === undefined) return;
  totals.runsWithUsage += 1;
  totals.input += input;
  totals.output += output;
  totals.total += input + output;
  totals.costUsd += usage.totalCostUsd ?? 0;
  totals.premiumRequests += usage.premiumRequests ?? 0;
}

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
}

function finishedRuns(records: LedgerRecord[]): Array<{ at: Date; record: LedgerRecord }> {
  const runs: Array<{ at: Date; record: LedgerRecord }> = [];
  for (const record of records) {
    if (record.event !== 'run-finished') continue;
    const at = new Date(String(record.finishedAt ?? record.timestamp ?? ''));
    if (Number.isNaN(at.getTime())) continue;
    runs.push({ at, record });
  }
  return runs;
}

function byBackend(runs: Array<{ record: LedgerRecord }>): BackendTokens[] {
  const map = new Map<BackendId, BackendTokens>();
  for (const { record } of runs) {
    const backend = record.backend as BackendId;
    if (!map.has(backend)) map.set(backend, { backend, ...emptyTotals() });
    addRun(map.get(backend) as BackendTokens, record);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function computeTokenStats(records: LedgerRecord[], now: Date): TokenStats {
  const todayKey = localDayKey(now);
  const weekKeys = new Set<string>();
  const daily: DayTokens[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = localDayKey(day);
    weekKeys.add(key);
    daily.push({ date: key, label: dayLabel(day), input: 0, output: 0, total: 0 });
  }
  const dayIndex = new Map(daily.map((day, index) => [day.date, index]));

  const runs = finishedRuns(records);
  const today: TokenTotals = emptyTotals();
  const week: TokenTotals = emptyTotals();
  const scheduledWeek: TokenTotals = emptyTotals();
  const cavemanOn: TokenTotals = emptyTotals();
  const cavemanOff: TokenTotals = emptyTotals();
  const todayRuns: Array<{ record: LedgerRecord }> = [];
  const weekRuns: Array<{ record: LedgerRecord }> = [];

  for (const { at, record } of runs) {
    const key = localDayKey(at);
    if (!weekKeys.has(key)) continue;
    weekRuns.push({ record });
    addRun(week, record);
    const usage = record.usage as { inputTokens?: number; outputTokens?: number } | undefined;
    const day = daily[dayIndex.get(key) as number];
    day.input += usage?.inputTokens ?? 0;
    day.output += usage?.outputTokens ?? 0;
    day.total += (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    if (record.scheduleId) addRun(scheduledWeek, record);
    if (record.cavemanWrapped === true) addRun(cavemanOn, record);
    else if (record.cavemanWrapped === false) addRun(cavemanOff, record);
    if (key === todayKey) {
      todayRuns.push({ record });
      addRun(today, record);
    }
  }

  return {
    today,
    week,
    byBackendToday: byBackend(todayRuns),
    byBackendWeek: byBackend(weekRuns),
    daily,
    caveman: cavemanOn.runs > 0 && cavemanOff.runs > 0 ? { on: cavemanOn, off: cavemanOff } : null,
    scheduledWeek,
  };
}

/** A block bar of `width` cells, filled in proportion to value/max. */
export function bar(value: number, max: number, width: number): string {
  if (max <= 0 || value <= 0) return '░'.repeat(width);
  const filled = Math.max(1, Math.round((value / max) * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function formatTokens(value: number): string {
  return value.toLocaleString('en-US');
}

/** Compact headline value for the home-screen footer (e.g. 59.1K). */
export function formatCompactTokens(value: number): string {
  return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
}

function totalsLine(label: string, totals: TokenTotals): string {
  const unknown = totals.runs - totals.runsWithUsage;
  const parts = [
    `${label}: ${formatTokens(totals.total)} tokens`,
    `(${formatTokens(totals.input)} in / ${formatTokens(totals.output)} out)`,
  ];
  if (totals.costUsd > 0) parts.push(`$${totals.costUsd.toFixed(2)}`);
  if (totals.premiumRequests > 0) parts.push(`${totals.premiumRequests} premium req`);
  parts.push(`${totals.runs} run${totals.runs === 1 ? '' : 's'}`);
  if (unknown > 0) parts.push(`${unknown} without usage data`);
  return parts.join(' · ');
}

/** Plain-text dashboard lines, shared by `scode tokens` and the TUI. */
export function renderTokenDashboard(stats: TokenStats): string[] {
  const lines: string[] = [];
  lines.push(totalsLine('Today', stats.today));
  lines.push(totalsLine('Last 7 days', stats.week));
  if (stats.scheduledWeek.runs > 0) {
    lines.push(`  of which scheduled: ${formatTokens(stats.scheduledWeek.total)} tokens · ${stats.scheduledWeek.runs} run${stats.scheduledWeek.runs === 1 ? '' : 's'}`);
  }
  lines.push('');
  if (stats.byBackendWeek.length > 0) {
    lines.push('Per backend (7 days)');
    const max = Math.max(...stats.byBackendWeek.map((item) => item.total));
    for (const item of stats.byBackendWeek) {
      lines.push(`  ${item.backend.padEnd(9)} ${bar(item.total, max, 14)} ${formatTokens(item.total).padStart(9)}  (${item.runs} runs)`);
    }
    lines.push('');
  }
  lines.push('Daily (7 days)');
  const maxDay = Math.max(...stats.daily.map((day) => day.total), 0);
  for (const day of stats.daily) {
    lines.push(`  ${day.label.padEnd(8)} ${bar(day.total, maxDay, 14)} ${formatTokens(day.total).padStart(9)}`);
  }
  if (stats.caveman) {
    lines.push('');
    const on = stats.caveman.on;
    const off = stats.caveman.off;
    const onAvg = on.runsWithUsage > 0 ? on.total / on.runsWithUsage : 0;
    const offAvg = off.runsWithUsage > 0 ? off.total / off.runsWithUsage : 0;
    const saved = offAvg > 0 ? Math.round((1 - onAvg / offAvg) * 100) : 0;
    lines.push(`Caveman: ${formatTokens(Math.round(onAvg))} tokens/run on (${on.runs} runs) vs ${formatTokens(Math.round(offAvg))} off (${off.runs} runs) — ${saved >= 0 ? `${saved}% fewer` : `${-saved}% more`} per run`);
  }
  return lines;
}
