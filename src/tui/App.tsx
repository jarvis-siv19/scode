import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { classify } from '../core/classifier.js';
import { dispatch } from '../core/dispatcher.js';
import { selectBackend } from '../core/policy.js';
import { backendSnapshots } from '../core/quota.js';
import type { BackendSnapshot } from '../core/types.js';
import { BackendsPane } from './BackendsPane.js';
import { JobsPane, type JobView } from './JobsPane.js';
import { TaskBar } from './TaskBar.js';

export function App() {
  const { exit } = useApp();
  const [task, setTask] = useState('');
  const [backends, setBackends] = useState<BackendSnapshot[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [message, setMessage] = useState('Loading local backend state…');

  const refresh = async () => {
    setBackends(await backendSnapshots());
    setMessage('Quota probes not run yet; unknown values are labeled PLACEHOLDER.');
  };

  useEffect(() => { void refresh(); }, []);
  useInput((input) => {
    if (input === 'q' && task.length === 0) exit();
    if (input === 'r' && task.length === 0) void refresh();
    if (input === '?' && task.length === 0) setMessage('Enter dispatches • r refreshes • q quits when task bar is empty');
  });

  const submit = async (brief: string) => {
    if (!brief.trim()) return;
    const classification = classify(brief);
    const selection = selectBackend(classification, backends);
    const id = `${Date.now()}`;
    setJobs((current) => [{ id, brief, backend: selection.backend, state: 'running' }, ...current]);
    setTask('');
    setMessage(`Running on ${selection.backend}: ${selection.reason}`);
    try {
      const result = await dispatch({
        brief,
        backend: selection.backend,
        selectionReason: selection.reason,
        classification: { ...classification },
        onStdout: () => undefined,
        onStderr: () => undefined,
      });
      setJobs((current) => current.map((job) => job.id === id ? { ...job, state: result.success ? 'success' : 'failed' } : job));
      setMessage(result.success ? 'Job completed successfully.' : `Job failed with exit ${result.exitCode ?? 'unknown'}.`);
    } catch (error) {
      setJobs((current) => current.map((job) => job.id === id ? { ...job, state: 'failed' } : job));
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold color="magenta">jcode</Text>
      <TaskBar value={task} onChange={setTask} onSubmit={(value) => void submit(value)} disabled={jobs.some((job) => job.state === 'running')} />
      <Box>
        <BackendsPane backends={backends} />
        <JobsPane jobs={jobs} />
      </Box>
      <Text dimColor>{message}</Text>
    </Box>
  );
}
