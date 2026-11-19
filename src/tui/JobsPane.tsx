import React from 'react';
import { Box, Text } from 'ink';
import type { RunUsage } from '../core/types.js';
import type { TuiTheme } from './theme.js';

export interface JobView {
  id: string;
  brief: string;
  backend: string;
  state: 'running' | 'stopping' | 'success' | 'failed' | 'cancelled';
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  errorClass?: string | null;
  usage?: RunUsage;
  outputTail: string[];
}

export interface ScheduleView {
  id: string;
  brief: string;
  backend: string;
  nextRunAt: string | null;
  enabled: boolean;
}

export const MAX_VISIBLE_JOBS = 5;

function formatNextRun(nextRunAt: string | null, now: number): string {
  if (!nextRunAt) return '—';
  const ms = Date.parse(nextRunAt) - now;
  if (ms <= 0) return 'due';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h${minutes % 60 === 0 ? '' : `${minutes % 60}m`}`;
  return new Date(nextRunAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

export function JobsPane({ jobs, schedules, now, theme, selectedJobId, totalJobs, startIndex, canClear }: {
  jobs: JobView[];
  schedules?: ScheduleView[];
  now: number;
  theme: TuiTheme;
  selectedJobId?: string;
  totalJobs: number;
  startIndex: number;
  canClear: boolean;
}) {
  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const upcoming = (schedules ?? []).filter((item) => item.enabled && item.nextRunAt !== null);
  return (
    <Box borderStyle="round" borderColor={theme.border} flexDirection="column" paddingX={1} width="50%">
      <Text bold color={theme.primary}>Jobs <Text dimColor>· click row</Text></Text>
      {jobs.length === 0 ? <Text dimColor>No jobs yet</Text> : jobs.map((job) => (
        <Box key={job.id} flexDirection="column">
          <Text color={job.id === selectedJobId ? theme.accent
            : job.state === 'failed' ? theme.error
              : job.state === 'success' ? theme.success
                : job.state === 'cancelled' ? theme.disabled : theme.warning}>
            {job.id === selectedJobId ? '› ' : '  '}{job.state.padEnd(9)} {job.backend.padEnd(9)} {formatElapsed(job.startedAt, job.finishedAt, now).padStart(5)} {job.brief.slice(0, Math.max(1, Math.floor((process.stdout.columns || 80) / 2) - 32))}
          </Text>
        </Box>
      ))}
      {totalJobs > MAX_VISIBLE_JOBS && (
        <Text dimColor>Showing {startIndex + 1}–{startIndex + jobs.length} of {totalJobs}</Text>
      )}
      <Text color={selectedJob?.state === 'running' ? theme.error : theme.disabled}>
        [S] Stop selected{selectedJob?.state === 'running' ? '' : ' (not running)'}
      </Text>
      <Text color={canClear ? theme.accent : theme.disabled}>[C] Clear completed</Text>
      {selectedJob && (
        <Text dimColor>
          {selectedJob.errorClass ? `Error: ${selectedJob.errorClass}${selectedJob.exitCode !== null && selectedJob.exitCode !== undefined ? ` (exit ${selectedJob.exitCode})` : ''}` : ''}
          {formatUsage(selectedJob.usage)}
        </Text>
      )}
      {selectedJob && selectedJob.outputTail.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>── {selectedJob.backend} output ──</Text>
          {selectedJob.outputTail.map((line, index) => (
            <Text key={index} dimColor>{line.slice(0, 70)}</Text>
          ))}
        </Box>
      )}
      {upcoming.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={theme.primary}>Scheduled</Text>
          {upcoming.map((item) => (
            <Text key={item.id} dimColor>
              {formatNextRun(item.nextRunAt, now).padEnd(9)} {item.backend.padEnd(9)} {item.brief.slice(0, 30)}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
