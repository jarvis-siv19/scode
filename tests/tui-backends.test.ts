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

test('backends pane distinguishes non-window limit modes and shows auth providers', () => {
  const output = renderToString(React.createElement(BackendsPane, {
    backends: [
      backend({ id: 'codex-b', status: 'unavailable', note: 'no CODEX_HOME configured (JCODE_CODEX_B_HOME)' }),
      backend({ id: 'agy', quotaMode: 'reactive', authProvider: 'Google OAuth / GCP' }),
      backend({ id: 'opencode', quotaMode: 'provider', authProvider: 'Bedrock + GitHub Copilot + NVIDIA' }),
      backend({ id: 'claude', quotaMode: 'provider', authProvider: 'Amazon Bedrock' }),
    ],
    theme: THEMES.ember,
    wide: true,
  }));
  assert.match(output, /codex-b\s+NO HOME/);
  assert.match(output, /agy\s+REACTIVE.*Google OAuth \/ GCP/);
  assert.match(output, /opencode\s+BYO.*Bedrock\+GitHub Copilot\+NVIDIA/);
  assert.match(output, /claude\s+METERED.*Amazon Bedrock/);
  assert.doesNotMatch(output, /UNKNOWN/);
});
