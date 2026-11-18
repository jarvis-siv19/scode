import { appendFile, readFile } from 'node:fs/promises';
import { ensureStateHome, statePaths } from '../config.js';

export async function appendLedger(record: Record<string, unknown>): Promise<void> {
  await ensureStateHome();
  await appendFile(statePaths().ledger, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
}

/** Read the last `count` ledger records (newest last). Tolerates a torn tail. */
export async function readLedgerTail(count = 100): Promise<Array<Record<string, unknown>>> {
  try {
    const text = await readFile(statePaths().ledger, 'utf8');
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    const records: Array<Record<string, unknown>> = [];
    for (const line of lines.slice(-count)) {
      try {
        records.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Skip a torn line — the ledger is append-only and a partial last
        // line means a crashed writer, not corrupt history.
      }
    }
    return records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
