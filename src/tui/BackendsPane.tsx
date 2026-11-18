import React from 'react';
import { Box, Text } from 'ink';
import type { BackendSnapshot } from '../core/types.js';

function resetLabel(resetsAt: string | null): string {
  if (!resetsAt) return '';
  const ms = Date.parse(resetsAt) - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return 'reset now';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `reset in ${hours}h${minutes}m` : `reset in ${minutes}m`;
}

export function BackendsPane({ backends }: { backends: BackendSnapshot[] }) {
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width="50%">
      <Text bold color="cyan">Backends</Text>
      {backends.map((backend) => {
        const remaining = backend.quota.remainingFraction === null ? 'UNKNOWN' : `${Math.round(backend.quota.remainingFraction * 100)}%`;
        const bar = backend.quota.remainingFraction === null
          ? '░'.repeat(10)
          : `${'█'.repeat(Math.round(backend.quota.remainingFraction * 10))}${'░'.repeat(10 - Math.round(backend.quota.remainingFraction * 10))}`;
        const color = backend.status === 'disabled' ? 'gray'
          : backend.status === 'available' ? 'green'
            : backend.status === 'cooling-down' ? 'magenta' : 'yellow';
        return (
          <Box key={backend.id} flexDirection="column">
            <Text color={color}>
              {backend.id.padEnd(10)} {backend.status.padEnd(13)} {remaining.padStart(7)} [{backend.quota.source.toUpperCase()}]
            </Text>
            <Text dimColor>  {bar} {resetLabel(backend.quota.resetsAt)}{backend.note ? ` — ${backend.note}` : ''}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
