import type { Classification, TaskClass } from './classifier.js';
import { classifyAsync } from './classifier.js';
import { biviaRouteDecision } from './bivia.js';
import { backendCandidatePool, backendPreferenceClasses, selectBackend, type PolicyOptions, type Selection } from './policy.js';
import type { BackendId, BackendSnapshot } from './types.js';

export interface RoutingDecision {
  classification: Classification;
  selection: Selection;
}

const DIFFICULTY_BY_CLASS: Record<TaskClass, Classification['difficulty']> = {
  'review-tests': 'low',
  architecture: 'high',
  aws: 'medium',
  exploration: 'medium',
  github: 'medium',
  'free-model': 'low',
  'deep-reasoning': 'high',
  general: 'medium',
};

function backendDescription(snapshot: BackendSnapshot): string {
  const remaining = snapshot.quota.remainingFraction === null
    ? 'quota unknown'
    : `${Math.round(snapshot.quota.remainingFraction * 100)}% quota remaining`;
  const reset = snapshot.quota.resetsAt ? `, resets ${snapshot.quota.resetsAt}` : '';
  const preferredFor = backendPreferenceClasses(snapshot.id).join(', ');
  return `${snapshot.model}; preferred for ${preferredFor || 'general work'}; ${remaining}${reset}.`;
}

export async function routeTask(
  brief: string,
  snapshots: BackendSnapshot[],
  override?: BackendId,
  options?: PolicyOptions,
): Promise<RoutingDecision> {
  const backendOptions = override
    ? []
    : snapshots
      .filter((snapshot) => snapshot.status === 'available')
      .map((snapshot) => ({ id: snapshot.id, description: backendDescription(snapshot) }));

  const bivia = await biviaRouteDecision(brief, backendOptions);
  const classification: Classification = bivia?.taskClass
    ? {
      taskClass: bivia.taskClass,
      difficulty: DIFFICULTY_BY_CLASS[bivia.taskClass],
      reason: `Bivia${bivia.taskClassConfidence === null ? '' : ` (${Math.round(bivia.taskClassConfidence * 100)}% confidence)`}`,
    }
    : await classifyAsync(brief);

  const localSelection = selectBackend(classification, snapshots, override, options);
  if (override || !bivia?.backend) return { classification, selection: localSelection };

  const candidates = backendCandidatePool(classification, snapshots, options?.quotaFloor);
  const allowed = candidates.length > 0
    ? candidates
    : snapshots.filter((snapshot) => snapshot.status === 'available');
  if (!allowed.some((snapshot) => snapshot.id === bivia.backend)) {
    console.warn('[scode] Bivia selected a backend outside the local eligibility policy; using the local choice.');
    return { classification, selection: localSelection };
  }

  return {
    classification,
    selection: {
      backend: bivia.backend,
      reason: `Bivia selected ${bivia.backend}${bivia.backendConfidence === null ? '' : ` (${Math.round(bivia.backendConfidence * 100)}% confidence)`}`,
    },
  };
}
