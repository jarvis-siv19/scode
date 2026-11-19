import React from 'react';
import { Box, Text } from 'ink';
import type { BackendId, BackendSnapshot } from '../core/types.js';
import { displayQuotaWindows } from '../core/quotaDisplay.js';
import type { TuiTheme } from './theme.js';

function usageLabel(backend: BackendSnapshot, used: number | null): string {
  if (backend.status === 'disabled') return '—';
  if (used !== null) return `${Math.round(used * 100)}% used`;
  if (backend.id === 'opencode' && backend.model.startsWith('opencode/')) return 'free';
  if (backend.quotaMode === 'provider') return 'provider';
  return 'on run';
}

function loginLabel(backend: BackendSnapshot): string {
  if (backend.loginStatus === 'active') return '● active';
  if (backend.loginStatus === 'disabled') return '○ disabled';
  if (backend.loginStatus === 'setup') return '○ setup';
  return '○ logged out';
}

export function BackendsPane({ backends, theme, wide = false, selectedBackend }: {
  backends: BackendSnapshot[];
  theme: TuiTheme;
  wide?: boolean;
  selectedBackend?: BackendId;
}) {
  // A full-width pane can still be too narrow for five readable columns.
  // Fall back to the deliberately stacked layout instead of letting Ink wrap
  // provider/account text at arbitrary points.
  const terminalColumns = process.stdout.columns || 80;
  const compact = !wide || terminalColumns < 110;
  return (
    <Box borderStyle="round" borderColor={theme.border} flexDirection="column" paddingX={1} width={wide ? '100%' : '50%'}>
      <Text bold color={theme.primary}>Backends <Text dimColor>· login and usage are separate</Text></Text>
      <Text dimColor>{compact
        ? `  ${'Name'.padEnd(13)} ${'Login'.padEnd(8)} Window / usage / reset`
        : `  ${'Name'.padEnd(14)} ${'Login'.padEnd(10)} ${'Window / usage'.padEnd(15)} ${'Resets'.padEnd(20)} Via / account`}</Text>
      {backends.map((backend) => {
        const used = backend.quota.remainingFraction === null ? null : 1 - backend.quota.remainingFraction;
        const remaining = usageLabel(backend, used);
        const windows = displayQuotaWindows(backend);
        const firstWindow = windows[0];
        const color = backend.status === 'disabled' ? theme.disabled
          : backend.status === 'available' ? theme.success
            : backend.status === 'cooling-down' ? theme.cooling : theme.warning;
        const context = backend.id === 'kiro' ? 'monthly'
          : backend.status === 'disabled' ? backend.note : undefined;
        const auth = [backend.authProvider, backend.accountLabel, context].filter(Boolean).join(' · ');
        const name = backend.displayName ?? backend.id;
        const selected = selectedBackend === backend.id;
        return (
          <Box key={backend.id} flexDirection="column">
            {compact ? (
              <>
                <Text color={selected ? theme.accent : color}>
                  {selected ? '› ' : '  '}{name.slice(0, 13).padEnd(13)} {loginLabel(backend).replace('● ', '').replace('○ ', '').slice(0, 8).padEnd(8)} {firstWindow ? `${firstWindow.label} ${firstWindow.usage} / ${firstWindow.reset}` : `${remaining} / —`}
                </Text>
                {windows.slice(1).map((window) => (
                  <Text key={`${backend.id}-${window.label}`} dimColor>    {' '.repeat(18)}{window.label} {window.usage} / {window.reset}</Text>
                ))}
                <Text dimColor>    {(auth || backend.note || '—').slice(0, Math.max(12, Math.floor(terminalColumns / (wide ? 1 : 2)) - 8))}</Text>
              </>
            ) : (
              <Text color={selected ? theme.accent : color}>
                {selected ? '› ' : '  '}{name.slice(0, 14).padEnd(14)} {loginLabel(backend).padEnd(10)} {(firstWindow ? `${firstWindow.label} ${firstWindow.usage}` : remaining).padEnd(15)} {(firstWindow?.reset ?? '—').padEnd(20)}{' '}
                <Text dimColor>{(auth || backend.note || '—').slice(0, Math.max(14, terminalColumns - 65))}{backend.quota.source === 'manual' ? ' · manual' : ''}</Text>
              </Text>
            )}
            {!compact && windows.slice(1).map((window) => (
              <Text key={`${backend.id}-${window.label}`} dimColor>
                {'  '}{''.padEnd(14)} {''.padEnd(10)} {`${window.label} ${window.usage}`.padEnd(15)} {window.reset.padEnd(20)}
              </Text>
            ))}
          </Box>
        );
      })}
      <Text dimColor>  Upcoming · Cursor CLI</Text>
      <Text dimColor>  Upcoming · Bivia CLI</Text>
    </Box>
  );
}
