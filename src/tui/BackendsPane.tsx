import React from 'react';
import { Box, Text } from 'ink';
import type { BackendSnapshot } from '../core/types.js';

export function BackendsPane({ backends }: { backends: BackendSnapshot[] }) {
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width="50%">
      <Text bold color="cyan">Backends</Text>
      {backends.map((backend) => {
        const remaining = backend.quota.remainingFraction === null ? 'UNKNOWN' : `${Math.round(backend.quota.remainingFraction * 100)}%`;
        return (
          <Text key={backend.id} color={backend.status === 'disabled' ? 'gray' : backend.status === 'available' ? 'green' : 'yellow'}>
            {backend.id.padEnd(10)} {backend.status.padEnd(13)} {remaining.padStart(7)} [{backend.quota.source.toUpperCase()}]
          </Text>
        );
      })}
    </Box>
  );
}
