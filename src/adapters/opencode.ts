import { loadConfig } from '../config.js';
import { wrapSpawn } from '../core/caveman.js';
import type { RunRequest } from '../core/types.js';
import { runProcess } from './process.js';
import type { AdapterCallbacks, BackendAdapter } from './types.js';

/**
 * OpenCode v2 only (v1 and v2 are different packages/docs).
 * `opencode run "<brief>" --format json -m <provider/model>` (handoff §5).
 * `--attach http://localhost:4096` to a warm `opencode serve` avoids MCP
 * cold-boot; `--continue` resumes the last session.
 *
 * No paid API credits: the default model is a free model. If OpenCode is
 * pointed at the ChatGPT or Copilot subscription it draws on the SAME pool
 * as the codex/copilot adapters — the router must never treat that as free
 * capacity (see quota.ts / policy.ts notes).
 */
export class OpenCodeAdapter implements BackendAdapter {
  async run(request: RunRequest, callbacks: AdapterCallbacks) {
    const config = await loadConfig();
    const args = ['run', request.brief, '--format', 'json', '-m', config.opencodeModel];
    if (config.opencodeAttachUrl) args.push('--attach', config.opencodeAttachUrl);
    if (request.sessionId) args.push('--continue');
    const { spec, wrapped } = await wrapSpawn({ command: 'opencode', args }, request.backend, config);
    const result = await runProcess(spec, request, callbacks);
    return { ...result, cavemanWrapped: wrapped };
  }
}
