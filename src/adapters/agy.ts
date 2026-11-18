import { loadConfig } from '../config.js';
import { wrapSpawn } from '../core/caveman.js';
import type { RunRequest } from '../core/types.js';
import { runProcess } from './process.js';
import type { AdapterCallbacks, BackendAdapter } from './types.js';

/**
 * agy is Google's Antigravity CLI (binary `agy`) — NOT Auggie, NOT Aider.
 * `agy -p "<brief>" --output-format json` (handoff §5).
 * `--conversation <id>` reuses sessions; fresh headless calls re-initialize
 * the whole session and burn quota, so the dispatcher always passes a stored
 * conversation id when one exists for the task.
 */
export class AgyAdapter implements BackendAdapter {
  async run(request: RunRequest, callbacks: AdapterCallbacks) {
    const config = await loadConfig();
    const args = ['-p', request.brief, '--output-format', 'json'];
    if (request.sessionId) args.push('--conversation', request.sessionId);
    const { spec, wrapped } = await wrapSpawn({ command: 'agy', args }, request.backend, config);
    const result = await runProcess(spec, request, callbacks);
    return { ...result, cavemanWrapped: wrapped };
  }
}
