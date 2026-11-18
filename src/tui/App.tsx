import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { classifyAsync } from '../core/classifier.js';
import { dispatch } from '../core/dispatcher.js';
import { selectBackend } from '../core/policy.js';
import { backendSnapshots, setManualQuota } from '../core/quota.js';
import { loadSchedules, runDueSchedules } from '../core/schedules.js';
import { getPriors } from '../core/scoring.js';
import { BACKEND_IDS, type BackendId, type BackendSnapshot } from '../core/types.js';
import { BackendsPane } from './BackendsPane.js';
import { JobsPane, type JobView, type ScheduleView } from './JobsPane.js';
import { ManualEntry } from './ManualEntry.js';
import { TaskBar } from './TaskBar.js';

type Mode = 'task' | 'manual' | 'help';

/** Override cycle: auto, then each backend in order. */
export const OVERRIDE_OPTIONS: Array<BackendId | undefined> = [undefined, ...BACKEND_IDS];

export function App() {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>('task');
  const [task, setTask] = useState('');
  const [backends, setBackends] = useState<BackendSnapshot[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [schedules, setSchedules] = useState<ScheduleView[]>([]);
  const [message, setMessage] = useState('Loading local backend state…');
  const [overrideIndex, setOverrideIndex] = useState(0);
  const [now, setNow] = useState(Date.now());

  const override = OVERRIDE_OPTIONS[overrideIndex];
  const running = jobs.some((job) => job.state === 'running');
  // Refs so the 60s tick timer sees live state instead of a stale closure.
  const runningRef = useRef(false);
  const tickingRef = useRef(false);
  useEffect(() => { runningRef.current = running; }, [running]);

  const refresh = async (withProbes: boolean) => {
    setMessage('Refreshing quota probes…');
    const snapshots = await backendSnapshots({ refresh: withProbes });
    setBackends(snapshots);
    const stored = await loadSchedules();
    setSchedules(stored.map((item) => ({
      id: item.id, brief: item.brief, backend: item.backend ?? 'auto',
      nextRunAt: item.nextRunAt, enabled: item.enabled,
    })));
    const known = snapshots.filter((item) => item.quota.source !== 'placeholder').length;
    setMessage(`Backends refreshed: ${known}/${snapshots.length} with quota data. r refreshes · m manual entry · ? help · q quits.`);
  };

  useEffect(() => { void refresh(true); }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The TUI is the scheduler while it is open: every minute, fire due
  // schedules as jobs — but never while another job is running, and never
  // two ticks at once (a slow dispatch must not stack up).
  useEffect(() => {
    const timer = setInterval(() => {
      if (runningRef.current || tickingRef.current) return;
      tickingRef.current = true;
      void runDueSchedules({
        onStart: ({ jobId, schedule }) => {
          setJobs((current) => [{
            id: jobId, brief: `[sched] ${schedule.brief}`, backend: schedule.backend ?? 'auto',
            state: 'running', startedAt: Date.now(), outputTail: [],
          }, ...current]);
        },
        onOutput: (jobId, chunk) => appendOutput(jobId, chunk),
        onFinish: ({ jobId, schedule }, result) => {
          setJobs((current) => current.map((job) => job.id === jobId
            ? {
              ...job,
              state: result.success ? 'success' : 'failed',
              finishedAt: Date.now(),
              exitCode: result.exitCode,
              errorClass: result.errorClass,
              usage: result.usage,
              backend: result.backend,
            }
            : job));
          setMessage(result.success
            ? `Scheduled job ${schedule.id} completed on ${result.backend}.`
            : `Scheduled job ${schedule.id} failed: ${result.errorClass ?? 'unknown'}.`);
        },
      }).then((result) => {
        tickingRef.current = false;
        if (result.fired.length > 0) void refresh(false);
      }).catch((error: unknown) => {
        tickingRef.current = false;
        setMessage(error instanceof Error ? error.message : String(error));
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  /**
   * Command keys (m/r/?/q) fire from the App's own input handler AND reach
   * TextInput, which would type them into the task bar — so pressing `m` on
   * an empty bar opened the manual modal and left "m" in the task. Drop a
   * lone command character typed into an empty bar: those keys are reserved
   * as the first keystroke by design (they open their mode instead), so no
   * real task text is ever lost — a task can only start with them after
   * other text is already present, and then this guard does not apply.
   */
  const handleTaskChange = (value: string) => {
    setTask((prev) => (prev === '' && value.length === 1 && ['m', 'r', '?', 'q'].includes(value) ? prev : value));
  };

  useInput((input, key) => {
    if (mode === 'help') {
      setMode('task');
      return;
    }
    if (mode !== 'task') return;
    if (key.upArrow) setOverrideIndex((current) => (current + OVERRIDE_OPTIONS.length - 1) % OVERRIDE_OPTIONS.length);
    if (key.downArrow) setOverrideIndex((current) => (current + 1) % OVERRIDE_OPTIONS.length);
    if (input === 'q' && task.length === 0) exit();
    if (input === 'r' && task.length === 0) void refresh(true);
    if (input === 'm' && task.length === 0) setMode('manual');
    if (input === '?' && task.length === 0) setMode('help');
  }, { isActive: mode !== 'manual' });

  const appendOutput = (id: string, chunk: string) => {
    const lines = chunk.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) return;
    setJobs((current) => current.map((job) => job.id === id
      ? { ...job, outputTail: [...job.outputTail, ...lines].slice(-6) }
      : job));
  };

  const submit = async (brief: string) => {
    if (!brief.trim() || running) return;
    const classification = await classifyAsync(brief);
    const priors = await getPriors();
    let selection;
    try {
      selection = selectBackend(classification, backends, override, { priors });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    const id = `${Date.now()}`;
    setJobs((current) => [{
      id, brief, backend: selection.backend, state: 'running',
      startedAt: Date.now(), outputTail: [],
    }, ...current]);
    setTask('');
    setMessage(`Running on ${selection.backend}: ${selection.reason}`);
    try {
      const result = await dispatch({
        brief,
        backend: selection.backend,
        selectionReason: selection.reason,
        classification: { ...classification },
        allowFallback: true,
        onStdout: (chunk) => appendOutput(id, chunk),
        onStderr: (chunk) => appendOutput(id, chunk),
      });
      setJobs((current) => current.map((job) => job.id === id
        ? {
          ...job,
          state: result.success ? 'success' : 'failed',
          finishedAt: Date.now(),
          exitCode: result.exitCode,
          errorClass: result.errorClass,
          usage: result.usage,
          backend: result.backend,
        }
        : job));
      setMessage(result.success
        ? `Job completed on ${result.backend}.`
        : `Job failed on ${result.backend}: ${result.errorClass ?? 'unknown'} (exit ${result.exitCode ?? 'unknown'}).`);
      void refresh(false);
    } catch (error) {
      setJobs((current) => current.map((job) => job.id === id ? { ...job, state: 'failed', finishedAt: Date.now() } : job));
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const saveManual = async (backend: BackendId, remainingFraction: number, resetsAt: string | null) => {
    await setManualQuota(backend, remainingFraction, resetsAt);
    setMode('task');
    setMessage(`Manual quota saved for ${backend}: ${Math.round(remainingFraction * 100)}% remaining.`);
    void refresh(false);
  };

  return (
    <Box flexDirection="column">
      <Text bold color="magenta">jcode</Text>
      {mode === 'help' ? (
        <Box borderStyle="round" flexDirection="column" paddingX={1}>
          <Text bold color="cyan">Keys</Text>
          <Text>Enter — dispatch the task (auto-routed, or the ↑↓ override)</Text>
          <Text>↑ ↓ — cycle backend override (auto → codex-a → codex-b → …)</Text>
          <Text>r — refresh quota probes</Text>
          <Text>m — manual quota entry (when the task bar is empty)</Text>
          <Text>? — this help</Text>
          <Text>q — quit (when the task bar is empty)</Text>
          <Text dimColor>Scheduled jobs (jcode schedule add) fire here every minute while the TUI is open.</Text>
          <Text dimColor>Press any key to close this help.</Text>
        </Box>
      ) : mode === 'manual' ? (
        <ManualEntry backends={backends} onSave={(backend, remaining, reset) => void saveManual(backend, remaining, reset)} onCancel={() => setMode('task')} />
      ) : (
        <TaskBar
          value={task}
          onChange={handleTaskChange}
          onSubmit={(value) => void submit(value)}
          disabled={running}
          overrideLabel={override ? `backend: ${override}` : 'backend: auto'}
        />
      )}
      <Box>
        <BackendsPane backends={backends} />
        <JobsPane jobs={jobs} schedules={schedules} now={now} />
      </Box>
      <Text dimColor>{message}</Text>
    </Box>
  );
}
