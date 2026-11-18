import React from 'react';
import { Box, Text } from 'ink';

export interface JobView {
  id: string;
  brief: string;
  backend: string;
  state: 'running' | 'success' | 'failed';
}

export function JobsPane({ jobs }: { jobs: JobView[] }) {
  const ordered = [...jobs].sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running'));
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width="50%">
      <Text bold color="cyan">Jobs</Text>
      {ordered.length === 0 ? <Text dimColor>No jobs yet</Text> : ordered.map((job) => (
        <Text key={job.id} color={job.state === 'failed' ? 'red' : job.state === 'success' ? 'green' : 'yellow'}>
          {job.state.padEnd(7)} {job.backend.padEnd(9)} {job.brief.slice(0, 35)}
        </Text>
      ))}
    </Box>
  );
}
