import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const testDir = resolve('tests');
const files = (await readdir(testDir))
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => resolve(testDir, name));

if (files.length === 0) {
  console.error('No tests/*.test.ts files found.');
  process.exitCode = 1;
} else {
  const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], {
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
