/**
 * Phase 6 — measured policy refinement (handoff §10).
 *
 * Expected-cost scoring with measured success rates as priors:
 *   score = (1 − P(success | backend, class)) × fallbackPenalty
 *         + expectedTokens(backend, class) × quotaScarcity × resetFactor
 *
 * The guardrails from the handoff, enforced here, not just documented:
 * - Reset time is part of the cost. A cheap backend resetting in 6 hours
 *   beats an expensive one resetting in 6 days — resetFactor scales the
 *   token cost from ~0 (resetting now) to 1 (reset 72h+ away, or unknown→0.5).
 * - Nothing is tuned on fewer than 20 runs per (backend, class) pair.
 *   Below that, the Beta(2,2) prior dominates and the pair is "unmeasured".
 * - Scoring never auto-applies policy changes: it only ranks at dispatch
 *   time, and the learn report still proposes the durable edits.
 * - No data at all → plain rule-based preference order (Phase 1 behavior).
 */
import { readFile } from 'node:fs/promises';
import { statePaths } from '../config.js';
import type { TaskClass } from './classifier.js';
import { joinRuns, type JoinedRun } from './learn.js';
import type { BackendId, BackendSnapshot } from './types.js';

/** Minimum runs per (backend, class) before the pair counts as measured. */
export const MIN_MEASURED_RUNS = 20;
/** Token-equivalent cost of a failed run plus its retry. */
export const FALLBACK_PENALTY_TOKENS = 50_000;
/** Neutral token estimate when a pair is unmeasured. */
const DEFAULT_EXPECTED_TOKENS = 20_000;
/** Beta(2,2) prior: 0.5 with the weight of 4 pseudo-runs. */
const PRIOR_ALPHA = 2;
const PRIOR_BETA = 2;

export interface Prior {
  backend: BackendId;
  classType: TaskClass;
  runs: number;
  successes: number;
  /** Beta-smoothed success probability. */
  pSuccess: number;
  meanTokens: number | null;
  measured: boolean;
}

export type Priors = Map<string, Prior>;

export function priorKey(backend: BackendId, classType: TaskClass): string {
  return `${backend}:${classType}`;
}

export function computePriors(runs: JoinedRun[]): Priors {
  const groups = new Map<string, JoinedRun[]>();
  for (const run of runs) {
    const key = priorKey(run.backend, run.classType);
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  const priors: Priors = new Map();
  for (const [key, group] of groups) {
    const successes = group.filter((run) => run.success).length;
    const tokenTotals = group
      .map((run) => (run.inputTokens ?? 0) + (run.outputTokens ?? 0))
      .filter((total) => total > 0);
    priors.set(key, {
      backend: group[0].backend,
      classType: group[0].classType,
      runs: group.length,
      successes,
      pSuccess: (successes + PRIOR_ALPHA) / (group.length + PRIOR_ALPHA + PRIOR_BETA),
      meanTokens: tokenTotals.length > 0
        ? tokenTotals.reduce((sum, value) => sum + value, 0) / tokenTotals.length
        : null,
      measured: group.length >= MIN_MEASURED_RUNS,
    });
  }
  return priors;
}

export async function loadPriors(): Promise<Priors> {
  try {
    const text = await readFile(statePaths().ledger, 'utf-8');
    const records = text.split('\n').filter((line) => line.trim() !== '').map((line) => {
      try {
        return JSON.parse(line) as Parameters<typeof joinRuns>[0][number];
      } catch {
        return {};
      }
    });
    return computePriors(joinRuns(records as never));
  } catch {
    return new Map();
  }
}

let cachedPriors: Priors | null = null;
let cachedAt = 0;
const PRIORS_TTL_MS = 5 * 60 * 1000;

/** Cached priors for the dispatch path — the ledger is re-read at most every 5 minutes. */
export async function getPriors(): Promise<Priors> {
  if (cachedPriors !== null && Date.now() - cachedAt < PRIORS_TTL_MS) return cachedPriors;
  cachedPriors = await loadPriors();
  cachedAt = Date.now();
  return cachedPriors;
}

export interface BackendScore {
  backend: BackendId;
  score: number;
  pSuccess: number;
  meanTokens: number;
  measured: boolean;
  breakdown: string;
}

function resetFactor(resetsAt: string | null, now: Date): number {
  if (!resetsAt) return 0.5;
  const parsed = Date.parse(resetsAt);
  if (Number.isNaN(parsed)) return 0.5;
  const hours = (parsed - now.getTime()) / 3_600_000;
  if (hours <= 0) return 0.05;
  return Math.min(hours / 72, 1);
}

export function scoreBackend(
  backend: BackendId,
  classType: TaskClass,
  snapshot: BackendSnapshot,
  priors: Priors,
  now: Date = new Date(),
): BackendScore {
  const prior = priors.get(priorKey(backend, classType));
  const pSuccess = prior?.pSuccess ?? 0.5;
  const meanTokens = prior?.meanTokens ?? DEFAULT_EXPECTED_TOKENS;
  const remaining = snapshot.quota.remainingFraction ?? 0.5;
  const scarcity = 1 / Math.max(remaining, 0.05);
  const factor = resetFactor(snapshot.quota.resetsAt, now);
  const failureCost = (1 - pSuccess) * FALLBACK_PENALTY_TOKENS;
  const tokenCost = meanTokens * scarcity * factor;
  return {
    backend,
    score: failureCost + tokenCost,
    pSuccess,
    meanTokens,
    measured: prior?.measured ?? false,
    breakdown: `P(success)=${Math.round(pSuccess * 100)}%${prior ? ` (n=${prior.runs})` : ' (no data)'}; ` +
      `expected ${Math.round(meanTokens).toLocaleString('en-US')} tok; ` +
      `scarcity ${scarcity.toFixed(1)}x; reset factor ${factor.toFixed(2)}`,
  };
}

/**
 * Rank eligible snapshots by expected cost. Returns null when no eligible
 * candidate has measured priors for this class — the caller then falls back
 * to the rule-based preference order.
 */
export function rankByScore(
  classType: TaskClass,
  snapshots: BackendSnapshot[],
  priors: Priors,
  now: Date = new Date(),
): BackendScore[] | null {
  const scored = snapshots.map((snapshot) => scoreBackend(snapshot.id, classType, snapshot, priors, now));
  if (!scored.some((item) => item.measured)) return null;
  return scored.sort((a, b) => a.score - b.score);
}

/**
 * Effort selection from measured data (handoff §10): which effort to default
 * to for a class, based on the success rate of low vs high effort.
 * Returns null when the data does not support a default (caller keeps the
 * classifier's difficulty).
 */
export function selectEffort(classType: TaskClass, runs: JoinedRun[]): { effort: 'low' | 'high'; reason: string } | null {
  const byDifficulty = new Map<string, JoinedRun[]>();
  for (const run of runs) {
    if (run.classType !== classType) continue;
    byDifficulty.set(run.effort, [...(byDifficulty.get(run.effort) ?? []), run]);
  }
  const low = byDifficulty.get('low') ?? [];
  const high = byDifficulty.get('high') ?? [];
  const rate = (group: JoinedRun[]) => group.length > 0 ? group.filter((run) => run.success).length / group.length : null;
  const lowRate = rate(low);
  const highRate = rate(high);
  if (low.length >= MIN_MEASURED_RUNS && lowRate !== null && lowRate >= 0.8) {
    return { effort: 'low', reason: `low effort succeeds ${Math.round(lowRate * 100)}% on ${classType} (n=${low.length}) — default low` };
  }
  if (low.length >= MIN_MEASURED_RUNS && high.length >= MIN_MEASURED_RUNS
    && lowRate !== null && highRate !== null && lowRate < 0.5 && highRate >= 0.8) {
    return { effort: 'high', reason: `low effort succeeds only ${Math.round(lowRate * 100)}% on ${classType} (n=${low.length}) vs high ${Math.round(highRate * 100)}% (n=${high.length}) — default high` };
  }
  return null;
}
