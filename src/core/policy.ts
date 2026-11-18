import type { Classification } from './classifier.js';
import type { BackendId, BackendSnapshot } from './types.js';

export interface Selection {
  backend: BackendId;
  reason: string;
}

/** Rule preferences per task class (handoff §5). Claude is the best-tier
 * default for deep reasoning once Pro is live; until then codex-a covers it. */
const PREFERENCES: Record<Classification['taskClass'], BackendId[]> = {
  aws: ['kiro', 'codex-a', 'codex-b'],
  exploration: ['agy', 'codex-a', 'codex-b'],
  github: ['copilot', 'codex-a', 'codex-b'],
  'free-model': ['opencode', 'codex-a', 'codex-b'],
  'deep-reasoning': ['claude', 'codex-a', 'codex-b'],
  architecture: ['codex-a', 'codex-b', 'claude'],
  'review-tests': ['codex-a', 'codex-b', 'opencode'],
  general: ['codex-a', 'codex-b', 'opencode'],
};

export interface PolicyOptions {
  /** Never pick an account below this remaining fraction unless it is the only option. */
  quotaFloor?: number;
}

/**
 * Pick a backend: rule preference order, filtered to eligible snapshots,
 * then soonest-expiring quota first among the eligible (handoff §5).
 * Subscription quota has ~$0 marginal cost but a hard window — price it by
 * scarcity (remaining fraction / time-to-reset), not $0.
 */
export function selectBackend(
  classification: Classification,
  snapshots: BackendSnapshot[],
  override?: BackendId,
  options?: PolicyOptions,
): Selection {
  const floor = options?.quotaFloor ?? 0.1;
  const byId = new Map(snapshots.map((item) => [item.id, item]));

  if (override) {
    const target = byId.get(override);
    if (!target) throw new Error(`Unknown backend: ${override}`);
    if (target.status === 'disabled') throw new Error(`${override} is disabled: ${target.note ?? 'not enabled'}`);
    if (target.status === 'unavailable') throw new Error(`${override} is unavailable: ${target.note ?? 'CLI not installed'}`);
    if (target.status === 'cooling-down') throw new Error(`${override} is cooling down: ${target.note ?? 'rate-limited'}`);
    return { backend: override, reason: 'explicit override' };
  }

  const preferred = PREFERENCES[classification.taskClass];
  const eligible = (ids: BackendId[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((item): item is BackendSnapshot => !!item && item.status === 'available');

  // Above-floor candidates first; below-floor only as a last resort.
  const aboveFloor = (items: BackendSnapshot[]) =>
    items.filter((item) => item.quota.remainingFraction === null || item.quota.remainingFraction >= floor);

  const orderByExpiry = (items: BackendSnapshot[]) =>
    [...items].sort((a, b) => {
      const aReset = a.quota.resetsAt ? Date.parse(a.quota.resetsAt) : Number.POSITIVE_INFINITY;
      const bReset = b.quota.resetsAt ? Date.parse(b.quota.resetsAt) : Number.POSITIVE_INFINITY;
      if (aReset !== bReset) return aReset - bReset;
      // Tie-break: lower remaining fraction first (use the scarcest window).
      const aRem = a.quota.remainingFraction ?? 1;
      const bRem = b.quota.remainingFraction ?? 1;
      return aRem - bRem;
    });

  const candidates = eligible(preferred);
  const withHeadroom = aboveFloor(candidates);
  const ordered = orderByExpiry(withHeadroom.length > 0 ? withHeadroom : candidates);
  // Prefer the rule's first choice when its quota is healthy; otherwise the
  // soonest-expiring eligible backend. (A preferred backend with a distant
  // reset beats a non-preferred one expiring sooner only when the task class
  // genuinely needs it — aws/github/exploration keep their first pick.)
  const classNeedsPreference = ['aws', 'github', 'exploration'].includes(classification.taskClass);
  const first = classNeedsPreference
    ? (ordered.find((item) => item.id === preferred[0]) ?? ordered[0])
    : ordered[0];
  if (first) {
    const belowFloor = first.quota.remainingFraction !== null && first.quota.remainingFraction < floor;
    return {
      backend: first.id,
      reason: `${classification.reason}; ${belowFloor ? 'only option, below quota floor' : 'eligible with headroom'}`
        + (first.quota.resetsAt ? `, reset ${first.quota.resetsAt}` : ''),
    };
  }

  // Nothing eligible among the preferred list — fall back to any available backend.
  const anyAvailable = orderByExpiry(snapshots.filter((item) => item.status === 'available'));
  if (anyAvailable.length > 0) {
    return { backend: anyAvailable[0].id, reason: `${classification.reason}; no preferred backend available, using ${anyAvailable[0].id}` };
  }
  throw new Error('No backend is available (all disabled, unavailable, or cooling down). Run `jcode doctor` to check this machine.');
}
