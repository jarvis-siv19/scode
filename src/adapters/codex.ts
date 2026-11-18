import { loadConfig } from '../config.js';
import type { RunRequest } from '../core/types.js';
import { runProcess } from './process.js';
import type { AdapterCallbacks, BackendAdapter } from './types.js';

export class CodexAdapter implements BackendAdapter {
  async run(request: RunRequest, callbacks: AdapterCallbacks) {
    const config = await loadConfig();
    const account = request.backend === 'codex-b' ? config.codexHomes.b : config.codexHomes.a;
    return runProcess({
      command: 'codex',
      args: ['exec', '--json', '--sandbox', 'workspace-write', '-C', request.cwd, request.brief],
      env: account ? { CODEX_HOME: account } : {},
    }, request, callbacks);
  }
}
