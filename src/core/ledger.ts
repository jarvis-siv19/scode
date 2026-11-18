import { appendFile } from 'node:fs/promises';
import { ensureStateHome, statePaths } from '../config.js';

export async function appendLedger(record: Record<string, unknown>): Promise<void> {
  await ensureStateHome();
  await appendFile(statePaths().ledger, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
}
