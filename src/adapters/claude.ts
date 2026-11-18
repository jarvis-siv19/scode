import type { RunRequest } from '../core/types.js';
import type { AdapterCallbacks, BackendAdapter } from './types.js';

export class ClaudeAdapter implements BackendAdapter {
  async run(_request: RunRequest, _callbacks: AdapterCallbacks): Promise<never> {
    throw new Error('claude is disabled until Claude Pro is confirmed and its smoke test passes');
  }
}
