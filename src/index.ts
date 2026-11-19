#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { parseArgs, runHeadless } from './cli.js';
import { App } from './tui/App.js';
import { enterTuiScreen, leaveTuiScreen } from './tui/screen.js';

async function runTui(): Promise<void> {
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    leaveTuiScreen();
  };

  enterTuiScreen();
  process.once('exit', restore);
  let instance: ReturnType<typeof render> | undefined;
  try {
    instance = render(React.createElement(App));
    await instance.waitUntilExit();
  } finally {
    instance?.unmount();
    restore();
    process.removeListener('exit', restore);
  }
}

async function main(): Promise<void> {
  const command = parseArgs(process.argv.slice(2));
  if (command.name === 'tui') {
    if (!process.stdin.isTTY) {
      console.error('[scode] the TUI needs an interactive terminal. Use `scode run "<task>"`, `scode status`, or `scode doctor` instead.');
      process.exitCode = 2;
      return;
    }
    await runTui();
    return;
  }
  process.exitCode = await runHeadless(command);
}

main().catch((error) => {
  console.error(`[scode] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
