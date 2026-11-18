import type { RunRequest } from '../core/types.js';
import { runProcess } from './process.js';
import type { AdapterCallbacks, BackendAdapter } from './types.js';

/**
 * Kiro: `kiro-cli chat --no-interactive --trust-all-tools
 * --output-format stream-json "<brief>"` (handoff §5).
 * Auth: KIRO_API_KEY (Pro+) from the environment — jcode never stores it.
 * Exit codes 0/1/3/4 per the vendor; resume via --resume-id.
 */
export class KiroAdapter implements BackendAdapter {
  async run(request: RunRequest, callbacks: AdapterCallbacks) {
    const args = ['chat', '--no-interactive', '--trust-all-tools', '--output-format', 'stream-json'];
    if (request.sessionId) args.push('--resume-id', request.sessionId);
    args.push(request.brief);
    return runProcess({ command: 'kiro-cli', args }, request, callbacks);
  }
}
