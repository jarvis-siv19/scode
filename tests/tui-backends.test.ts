import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'ink';
import { BackendsPane } from '../dist/tui/BackendsPane.js';
import { THEMES } from '../dist/tui/theme.js';
import type { BackendSnapshot } from '../dist/core/types.js';

function backend(overrides: Partial<BackendSnapshot> & Pick<BackendSnapshot, 'id'>): BackendSnapshot {
  return {
    status: 'available',
    model: 'test',
    cliPresent: true,
    quota: {
      remainingFraction: null,
      resetsAt: null,
      windowMinutes: null,
      source: 'placeholder',
      observedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

test('backends pane separates login, usage, reset, and provider columns', () => {
  const output = renderToString(React.createElement(BackendsPane, {
    backends: [
      backend({ id: 'codex-b', displayName: 'Codex school', loginStatus: 'setup', status: 'unavailable', note: 'no CODEX_HOME configured (JCODE_CODEX_B_HOME)' }),
      backend({ id: 'agy', displayName: 'Antigravity', loginStatus: 'active', quotaMode: 'reactive', authProvider: 'Google OAuth / GCP' }),
      backend({ id: 'opencode', displayName: 'OpenCode', loginStatus: 'active', model: 'opencode/big-pickle', quotaMode: 'provider', authProvider: 'OpenCode free' }),
      backend({ id: 'claude', displayName: 'Claude', loginStatus: 'active', quotaMode: 'provider', authProvider: 'Amazon Bedrock' }),
    ],
    theme: THEMES.ember,
    wide: true,
  }));
  assert.match(output, /Name\s+Login\s+Usage\s+Resets/);
  assert.match(output, /Codex school\s+○ setup/);
  assert.match(output, /Antigravity\s+● active.*on run.*Google OAuth \/ GCP/);
  assert.match(output, /OpenCode\s+● active.*free.*OpenCode free/);
  assert.match(output, /Claude\s+● active.*provider.*Amazon Bedrock/);
  assert.match(output, /Upcoming · Cursor CLI · Bivia coordinated teams/);
  assert.doesNotMatch(output, /UNKNOWN/);
});
