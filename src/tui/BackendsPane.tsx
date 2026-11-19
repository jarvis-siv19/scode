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

function stateLabel(backend: BackendSnapshot): string {
  if (backend.status === 'disabled') return 'off';
  if (backend.quota.remainingFraction === 0) return 'limit reached';
  if (backend.status === 'cooling-down') return `cool ${resetLabel(backend.quota.coolingUntil ?? null)}`.trim();
  if (backend.status === 'unavailable') return '';
  return backend.quota.remainingFraction === null && backend.quotaMode === 'unknown' ? 'quota unknown' : '';
}

function usageLabel(backend: BackendSnapshot, used: number | null): string {
  if (backend.status === 'disabled') return 'OFF';
  if (backend.status === 'unavailable') return backend.note?.includes('CODEX_HOME') ? 'NO HOME' : 'MISSING';
  if (used !== null) return `${Math.round(used * 100)}% used`;
  if (backend.quotaMode === 'reactive') return 'REACTIVE';
  if (backend.quotaMode === 'provider') return backend.id === 'opencode' ? 'BYO' : 'METERED';
  return 'UNKNOWN';
}

export function BackendsPane({ backends, theme, wide = false, selectedBackend }: {
  backends: BackendSnapshot[];
  theme: TuiTheme;
  wide?: boolean;
  selectedBackend?: BackendId;
}) {
  return (
    <Box borderStyle="round" borderColor={theme.border} flexDirection="column" paddingX={1} width={wide ? '100%' : '50%'}>
      <Text bold color={theme.primary}>Backends <Text dimColor>· click title for auto</Text></Text>
      {backends.map((backend) => {
        const used = backend.quota.remainingFraction === null ? null : 1 - backend.quota.remainingFraction;
        const remaining = usageLabel(backend, used);
        const filled = used === null ? 0 : Math.round(used * 6);
        const bar = `${'█'.repeat(filled)}${'░'.repeat(6 - filled)}`;
        const color = backend.status === 'disabled' ? theme.disabled
          : backend.status === 'available' ? theme.success
            : backend.status === 'cooling-down' ? theme.cooling : theme.warning;
        const reset = resetLabel(backend.quota.resetsAt);
        const state = stateLabel(backend);
        const auth = backend.authProvider?.replaceAll(' + ', '+');
        const selected = selectedBackend === backend.id;
        return (
          <Box key={backend.id}>
            <Text color={selected ? theme.accent : color}>
              {selected ? '› ' : '  '}{backend.id.padEnd(9)} {remaining.padStart(8)}
              <Text color={theme.quota}> {bar}</Text>
              <Text dimColor>{reset ? ` ${reset}` : ''}{state ? ` · ${state}` : ''}{auth ? ` · ${auth}` : ''}{backend.quota.source === 'manual' ? ' · manual' : ''}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
