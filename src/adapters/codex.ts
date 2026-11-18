import { loadConfig } from '../config.js';
import { wrapSpawn } from '../core/caveman.js';
import type { RunRequest } from '../core/types.js';
import { runProcess } from './process.js';
import type { AdapterCallbacks, BackendAdapter } from './types.js';

/**
 * Codex: `CODEX_HOME=<account> codex exec --json --sandbox workspace-write
 * -C <worktree> "<brief>"` (handoff §5). Separate CODEX_HOME per account is
 * the clean official path — one login per CODEX_HOME.
 */
export class CodexAdapter implements BackendAdapter {
  async run(request: RunRequest, callbacks: AdapterCallbacks) {
    const config = await loadConfig();
    const account = request.backend === 'codex-b' ? config.codexHomes.b : config.codexHomes.a;
    const { spec, wrapped } = await wrapSpawn({
      command: 'codex',
      args: ['exec', '--json', '--sandbox', 'workspace-write', '-C', request.cwd, request.brief],
      env: account ? { CODEX_HOME: account } : {},
    }, request.backend, config);
    const result = await runProcess(spec, request, callbacks);
    return { ...result, cavemanWrapped: wrapped };
  }
}
