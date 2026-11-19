import React from 'react';
import { Box, Text } from 'ink';
import type { BackendSnapshot } from '../core/types.js';
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

function stateLabel(backend: BackendSnapshot): string {
  if (backend.status === 'disabled') return 'off';
  if (backend.status === 'cooling-down') return `cool ${resetLabel(backend.quota.coolingUntil ?? null)}`.trim();
  if (backend.status === 'unavailable') return backend.note?.includes('CODEX_HOME') ? 'no home' : 'missing';
  return backend.quota.remainingFraction === null ? 'unknown' : '';
}

export function BackendsPane({ backends, theme, wide = false }: { backends: BackendSnapshot[]; theme: TuiTheme; wide?: boolean }) {
  return (
    <Box borderStyle="round" borderColor={theme.border} flexDirection="column" paddingX={1} width={wide ? '100%' : '50%'}>
      <Text bold color={theme.primary}>Backends</Text>
      {backends.map((backend) => {
        const remaining = backend.quota.remainingFraction === null ? 'UNKNOWN' : `${Math.round(backend.quota.remainingFraction * 100)}%`;
        const filled = backend.quota.remainingFraction === null ? 0 : Math.round(backend.quota.remainingFraction * 6);
        const bar = `${'█'.repeat(filled)}${'░'.repeat(6 - filled)}`;
        const color = backend.status === 'disabled' ? theme.disabled
          : backend.status === 'available' ? theme.success
            : backend.status === 'cooling-down' ? theme.cooling : theme.warning;
        const reset = resetLabel(backend.quota.resetsAt);
        const state = stateLabel(backend);
        return (
          <Box key={backend.id}>
            <Text color={color}>
              {backend.id.padEnd(9)} {remaining.padStart(7)}
              <Text color={theme.quota}> {bar}</Text>
              <Text dimColor>{reset ? ` ${reset}` : ''}{state ? ` · ${state}` : ''}{backend.quota.source === 'manual' ? ' · manual' : ''}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
