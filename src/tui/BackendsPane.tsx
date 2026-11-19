import React from 'react';
import { Box, Text } from 'ink';
import type { BackendId, BackendSnapshot } from '../core/types.js';
import type { TuiTheme } from './theme.js';

function resetLabel(resetsAt: string | null): string {
  if (!resetsAt) return '';
  const ms = Date.parse(resetsAt) - Date.now();
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return 'reset';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h${minutes > 0 ? `${minutes}m` : ''}` : `${Math.max(1, minutes)}m`;
}

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
  const compact = !wide;
  return (
    <Box borderStyle="round" borderColor={theme.border} flexDirection="column" paddingX={1} width={wide ? '100%' : '50%'}>
      <Text bold color={theme.primary}>Backends <Text dimColor>· login and usage are separate</Text></Text>
      <Text dimColor>{compact
        ? `  ${'Name'.padEnd(13)} ${'Login'.padEnd(8)} Usage / reset`
        : `  ${'Name'.padEnd(16)} ${'Login'.padEnd(12)} ${'Usage'.padEnd(9)} ${'Resets'.padEnd(8)} Via / account`}</Text>
      {backends.map((backend) => {
        const used = backend.quota.remainingFraction === null ? null : 1 - backend.quota.remainingFraction;
        const remaining = usageLabel(backend, used);
        const color = backend.status === 'disabled' ? theme.disabled
          : backend.status === 'available' ? theme.success
            : backend.status === 'cooling-down' ? theme.cooling : theme.warning;
        const reset = resetLabel(backend.quota.resetsAt);
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
                  {selected ? '› ' : '  '}{name.slice(0, 13).padEnd(13)} {loginLabel(backend).replace('● ', '').replace('○ ', '').slice(0, 8).padEnd(8)} {remaining} / {reset || '—'}
                </Text>
                <Text dimColor>    {(auth || backend.note || '—').slice(0, Math.max(12, Math.floor((process.stdout.columns || 80) / 2) - 8))}</Text>
              </>
            ) : (
              <Text color={selected ? theme.accent : color}>
                {selected ? '› ' : '  '}{name.slice(0, 16).padEnd(16)} {loginLabel(backend).padEnd(12)} {remaining.padEnd(9)} {(reset || '—').padEnd(8)}
                <Text dimColor>{(auth || backend.note || '—').slice(0, 25)}{backend.quota.source === 'manual' ? ' · manual' : ''}</Text>
              </Text>
            )}
          </Box>
        );
      })}
      <Text dimColor>  Upcoming · Cursor CLI · Bivia coordinated teams</Text>
    </Box>
  );
}
