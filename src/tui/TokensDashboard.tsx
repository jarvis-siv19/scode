import React from 'react';
import { Box, Text } from 'ink';
import { bar, formatTokens, type TokenStats } from '../core/tokenStats.js';

/** Full token dashboard (the `t` view). The bottom bar shows the two headline numbers. */
export function TokensDashboard({ stats }: { stats: TokenStats }) {
  const maxBackend = Math.max(...stats.byBackendWeek.map((item) => item.total), 0);
  const maxDay = Math.max(...stats.daily.map((day) => day.total), 0);
  const unknownWeek = stats.week.runs - stats.week.runsWithUsage;
  const unknownToday = stats.today.runs - stats.today.runsWithUsage;

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1}>
      <Text bold color="cyan">Token usage</Text>
      <Text>
        <Text bold>Today: </Text>
        <Text color="green">{formatTokens(stats.today.total)} tokens</Text>
        <Text dimColor> ({formatTokens(stats.today.input)} in / {formatTokens(stats.today.output)} out · {stats.today.runs} run{stats.today.runs === 1 ? '' : 's'}{stats.today.costUsd > 0 ? ` · $${stats.today.costUsd.toFixed(2)}` : ''}{unknownToday > 0 ? ` · ${unknownToday} without usage data` : ''})</Text>
      </Text>
      <Text>
        <Text bold>Last 7 days: </Text>
        <Text color="green">{formatTokens(stats.week.total)} tokens</Text>
        <Text dimColor> ({formatTokens(stats.week.input)} in / {formatTokens(stats.week.output)} out · {stats.week.runs} run{stats.week.runs === 1 ? '' : 's'}{stats.week.costUsd > 0 ? ` · $${stats.week.costUsd.toFixed(2)}` : ''}{stats.week.premiumRequests > 0 ? ` · ${stats.week.premiumRequests} premium req` : ''})</Text>
      </Text>
      {stats.scheduledWeek.runs > 0 && (
        <Text dimColor>  of which scheduled: {formatTokens(stats.scheduledWeek.total)} tokens · {stats.scheduledWeek.runs} run{stats.scheduledWeek.runs === 1 ? '' : 's'}</Text>
      )}
      {unknownWeek > 0 && (
        <Text dimColor>{unknownWeek} run{unknownWeek === 1 ? '' : 's'} reported no token data — totals count only what backends reported.</Text>
      )}
      {stats.byBackendWeek.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Per backend (7 days)</Text>
          {stats.byBackendWeek.map((item) => (
            <Text key={item.backend}>
              <Text color="magenta">{item.backend.padEnd(9)}</Text> {bar(item.total, maxBackend, 14)} {formatTokens(item.total).padStart(9)} <Text dimColor>({item.runs} run{item.runs === 1 ? '' : 's'})</Text>
            </Text>
          ))}
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Daily (7 days)</Text>
        {stats.daily.map((day) => (
          <Text key={day.date}>
            <Text dimColor>{day.label.padEnd(8)}</Text> {bar(day.total, maxDay, 14)} {formatTokens(day.total).padStart(9)}
          </Text>
        ))}
      </Box>
      {stats.caveman && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Caveman</Text>
          <Text dimColor>
            {formatTokens(Math.round(stats.caveman.on.total / Math.max(stats.caveman.on.runsWithUsage, 1)))} tokens/run with Caveman ({stats.caveman.on.runs} run{stats.caveman.on.runs === 1 ? '' : 's'}) vs{' '}
            {formatTokens(Math.round(stats.caveman.off.total / Math.max(stats.caveman.off.runsWithUsage, 1)))} without ({stats.caveman.off.runs} run{stats.caveman.off.runs === 1 ? '' : 's'})
          </Text>
        </Box>
      )}
      <Text dimColor>Press any key to go back.</Text>
    </Box>
  );
}
