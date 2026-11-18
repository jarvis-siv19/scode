#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { parseArgs, runHeadless } from './cli.js';
import { App } from './tui/App.js';

async function main(): Promise<void> {
  const command = parseArgs(process.argv.slice(2));
  if (command.name === 'tui') {
    if (!process.stdin.isTTY) {
      console.error('[jcode] the TUI needs an interactive terminal. Use `jcode run "<task>"`, `jcode status`, or `jcode doctor` instead.');
      process.exitCode = 2;
      return;
    }
    render(React.createElement(App));
    return;
  }
  process.exitCode = await runHeadless(command);
}

main().catch((error) => {
  console.error(`[jcode] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
