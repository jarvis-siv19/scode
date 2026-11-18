import { loadConfig } from '../config.js';
import { wrapSpawn } from '../core/caveman.js';
import type { RunRequest } from '../core/types.js';
import { runProcess } from './process.js';
import type { AdapterCallbacks, BackendAdapter } from './types.js';

/**
 * GitHub Copilot CLI: `copilot -p "<brief>" --output-format json
 * --allow-tool write` (handoff §5). Prompt mode cannot ask for tool approval,
 * so the narrow write permission is required for coding tasks; URL and path
 * access remain subject to Copilot's normal checks.
 * Requires CLI >= v1.0.28 for reliable JSONL. `--model` / COPILOT_MODEL picks
 * the model (default `auto`). `--max-autopilot-continues` caps autonomous
 * steps — Copilot bills in premium requests, and a complex task can consume
 * dozens per run.
 *
 * Exit code 3 = premium request limit reached. HARD STOP: never retry that
 * account; the dispatcher marks it cooling-down and routes elsewhere.
 */
export class CopilotAdapter implements BackendAdapter {
  async run(request: RunRequest, callbacks: AdapterCallbacks) {
    const config = await loadConfig();
    const args = ['-p', request.brief, '--output-format', 'json', '--allow-tool', 'write'];
    if (config.copilotMaxContinues !== undefined) {
      args.push('--max-autopilot-continues', String(config.copilotMaxContinues));
    }
    const { spec, wrapped } = await wrapSpawn({ command: 'copilot', args }, request.backend, config);
    const result = await runProcess(spec, request, callbacks);
    if (result.exitCode === 3) {
      return { ...result, success: false, errorClass: 'quota' as const, cavemanWrapped: wrapped };
    }
    return { ...result, cavemanWrapped: wrapped };
  }
}
