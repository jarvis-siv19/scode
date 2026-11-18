import React from 'react';
import { Box, Text } from 'ink';
import type { RunUsage } from '../core/types.js';

export interface JobView {
  id: string;
  brief: string;
  backend: string;
  state: 'running' | 'success' | 'failed';
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  errorClass?: string | null;
  usage?: RunUsage;
  outputTail: string[];
}

function formatElapsed(startedAt: number, finishedAt: number | undefined, now: number): string {
  const ms = (finishedAt ?? now) - startedAt;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

function formatUsage(usage: RunUsage | undefined): string {
  if (!usage) return '';
  const parts: string[] = [];
  if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
    parts.push(`${usage.inputTokens ?? 0}in/${usage.outputTokens ?? 0}out tok`);
  }
  if (usage.premiumRequests !== undefined) parts.push(`${usage.premiumRequests} premium req`);
  if (usage.totalCostUsd !== undefined) parts.push(`$${usage.totalCostUsd.toFixed(4)}`);
  return parts.length > 0 ? ` — ${parts.join(', ')}` : '';
}

export function JobsPane({ jobs, now }: { jobs: JobView[]; now: number }) {
  const ordered = [...jobs].sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running'));
  const latest = ordered[0];
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width="50%">
      <Text bold color="cyan">Jobs</Text>
      {ordered.length === 0 ? <Text dimColor>No jobs yet</Text> : ordered.map((job) => (
        <Box key={job.id} flexDirection="column">
          <Text color={job.state === 'failed' ? 'red' : job.state === 'success' ? 'green' : 'yellow'}>
            {job.state.padEnd(7)} {job.backend.padEnd(9)} {formatElapsed(job.startedAt, job.finishedAt, now).padStart(5)} {job.brief.slice(0, 30)}
          </Text>
          {(job.usage || job.errorClass) && (
            <Text dimColor>
              {'  '}{job.errorClass ? `failed: ${job.errorClass}${job.exitCode !== null && job.exitCode !== undefined ? ` (exit ${job.exitCode})` : ''}` : ''}{formatUsage(job.usage)}
            </Text>
          )}
        </Box>
      ))}
      {latest && latest.outputTail.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>── {latest.backend} output ──</Text>
          {latest.outputTail.map((line, index) => (
            <Text key={index} dimColor>{line.slice(0, 70)}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
