import { resolve } from 'node:path';
import { classify } from './core/classifier.js';
import { dispatch } from './core/dispatcher.js';
import { selectBackend } from './core/policy.js';
import { backendSnapshots } from './core/quota.js';
import { BACKEND_IDS, type BackendId } from './core/types.js';

export type Command =
  | { name: 'tui' }
  | { name: 'run'; brief: string; backend?: BackendId; cwd?: string }
  | { name: 'status' }
  | { name: 'learn' }
  | { name: 'help' };

function isBackend(value: string): value is BackendId {
  return BACKEND_IDS.includes(value as BackendId);
}

export function parseArgs(argv: string[]): Command {
  if (argv.length === 0) return { name: 'tui' };
  const [name, ...rest] = argv;
  if (name === '--help' || name === '-h' || name === 'help') return { name: 'help' };
  if (name === 'status') return { name: 'status' };
  if (name === 'learn') return { name: 'learn' };
  if (name !== 'run') throw new Error(`Unknown command: ${name}`);

  let backend: BackendId | undefined;
  let cwd: string | undefined;
  const briefParts: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--backend') {
      const value = rest[++index];
      if (!value || !isBackend(value)) throw new Error(`Invalid backend. Choose: ${BACKEND_IDS.join(', ')}`);
      backend = value;
    } else if (rest[index] === '--cwd') {
      const value = rest[++index];
      if (!value) throw new Error('--cwd requires a path');
      cwd = resolve(value);
    } else {
      briefParts.push(rest[index]);
    }
  }
  const brief = briefParts.join(' ').trim();
  if (!brief) throw new Error('jcode run requires a task brief');
  return { name: 'run', brief, backend, cwd };
}

export async function runHeadless(command: Exclude<Command, { name: 'tui' }>): Promise<number> {
  if (command.name === 'help') {
    console.log('Usage: jcode | jcode run [--backend ID] [--cwd PATH] "<task>" | jcode status | jcode learn');
    return 0;
  }
  if (command.name === 'learn') {
    console.log('jcode learn is reserved for Phase 5, after real ledger data exists.');
    return 0;
  }
  const snapshots = await backendSnapshots();
  if (command.name === 'status') {
    for (const item of snapshots) {
      const remaining = item.quota.remainingFraction === null ? 'unknown' : `${Math.round(item.quota.remainingFraction * 100)}%`;
      const reset = item.quota.resetsAt ?? 'unknown';
      console.log(`${item.id.padEnd(10)} ${item.status.padEnd(13)} remaining=${remaining.padEnd(8)} reset=${reset} source=${item.quota.source}`);
    }
    return 0;
  }

  const classification = classify(command.brief);
  const selection = selectBackend(classification, snapshots, command.backend);
  console.error(`[jcode] ${selection.backend}: ${selection.reason}`);
  const result = await dispatch({
    brief: command.brief,
    backend: selection.backend,
    cwd: command.cwd,
    selectionReason: selection.reason,
    classification: { ...classification },
  });
  return result.success ? 0 : result.exitCode ?? 1;
}
