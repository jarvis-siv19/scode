import type { BackendId, RunRequest } from '../core/types.js';
import type { AdapterCallbacks, BackendAdapter } from './types.js';

export class StubAdapter implements BackendAdapter {
  constructor(private readonly id: BackendId) {}

  async run(_request: RunRequest, _callbacks: AdapterCallbacks): Promise<never> {
    throw new Error(`${this.id} adapter is not implemented in the base scaffold; run Phase 0 smoke tests first`);
  }
}
