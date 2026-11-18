import type { Classification } from './classifier.js';
import type { BackendId, BackendSnapshot } from './types.js';

export interface Selection {
  backend: BackendId;
  reason: string;
}

export function selectBackend(
  classification: Classification,
  snapshots: BackendSnapshot[],
  override?: BackendId,
): Selection {
  if (override) {
    const target = snapshots.find((item) => item.id === override);
    if (!target) throw new Error(`Unknown backend: ${override}`);
    if (target.status === 'disabled') throw new Error(`${override} is disabled: ${target.note ?? 'not enabled'}`);
    return { backend: override, reason: 'explicit override' };
  }

  const preferred: BackendId[] =
    classification.taskClass === 'aws' ? ['kiro', 'codex-a']
      : classification.taskClass === 'exploration' ? ['agy', 'codex-a']
        : classification.taskClass === 'github' ? ['copilot', 'codex-a']
          : ['codex-a', 'codex-b'];

  const backend = preferred.find((id) => snapshots.find((item) => item.id === id)?.status === 'available') ?? 'codex-a';
  return { backend, reason: `${classification.reason}; first eligible rule preference` };
}
