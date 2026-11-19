import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { loadConfig } from '../config.js';
import { dispatch } from '../core/dispatcher.js';
import { readLedgerTail } from '../core/ledger.js';
import { backendSnapshots, setManualQuota } from '../core/quota.js';
import { routeTask } from '../core/router.js';
import { loadSchedules, runDueSchedules } from '../core/schedules.js';
import { getPriors } from '../core/scoring.js';
import { computeTokenStats, type TokenStats } from '../core/tokenStats.js';
import { BACKEND_IDS, type BackendId, type BackendSnapshot, type ThemeId } from '../core/types.js';
import { BackendsPane } from './BackendsPane.js';
import { JobsPane, MAX_VISIBLE_JOBS, type JobView, type ScheduleView } from './JobsPane.js';
import { ManualEntry } from './ManualEntry.js';
import { hitTestTuiClick, parseSgrMouseClick } from './mouse.js';
import { TaskBar } from './TaskBar.js';
import { TokensDashboard } from './TokensDashboard.js';
import { THEMES, THEME_ORDER } from './theme.js';

type Mode = 'task' | 'manual' | 'help' | 'tokens';
type Focus = 'task' | 'backends' | 'jobs';

/** Override cycle: auto, then each backend in order. */
export const OVERRIDE_OPTIONS: Array<BackendId | undefined> = [undefined, ...BACKEND_IDS];

export function App() {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>('task');
  const [task, setTask] = useState('');
  const [backends, setBackends] = useState<BackendSnapshot[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [schedules, setSchedules] = useState<ScheduleView[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>('ember');
  const [message, setMessage] = useState('Loading local backend state…');
  const [overrideIndex, setOverrideIndex] = useState(0);
  const [focus, setFocus] = useState<Focus>('task');
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const controllersRef = useRef(new Map<string, AbortController>());

  const override = OVERRIDE_OPTIONS[overrideIndex];
  const theme = THEMES[themeId];
  const orderedJobs = [...jobs].sort((a, b) => Number(b.state === 'running' || b.state === 'stopping') - Number(a.state === 'running' || a.state === 'stopping'));
  const selectedJobIndex = orderedJobs.findIndex((job) => job.id === selectedJobId);
  const startIndex = Math.max(0, Math.min(
    selectedJobIndex < 0 ? 0 : selectedJobIndex,
    orderedJobs.length - MAX_VISIBLE_JOBS,
  ));
  const visibleJobs = orderedJobs.slice(startIndex, startIndex + MAX_VISIBLE_JOBS);
  const selectedJob = orderedJobs.find((job) => job.id === selectedJobId);
  const running = jobs.some((job) => job.state === 'running' || job.state === 'stopping');
  const showJobs = jobs.length > 0 || schedules.length > 0;
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
    // 2000 records ≈ 1000 runs — comfortably covers a heavy week.
    const records = await readLedgerTail(2000);
    setTokenStats(computeTokenStats(records, new Date()));
    const known = snapshots.filter((item) => item.quota.source !== 'placeholder').length;
    setMessage(`${known}/${snapshots.length} quotas`);
  };

  useEffect(() => { void refresh(true); }, []);
  useEffect(() => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return;
    process.stdout.write('\u001b[?1000h\u001b[?1006h');
    return () => { process.stdout.write('\u001b[?1000l\u001b[?1006l'); };
  }, []);
  useEffect(() => {
    void loadConfig()
      .then((config) => setThemeId(config.theme))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : String(error)));
  }, []);
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
      const controller = new AbortController();
      void runDueSchedules({
        signal: controller.signal,
        onStart: ({ jobId, schedule }) => {
          controllersRef.current.set(jobId, controller);
          setJobs((current) => [{
            id: jobId, brief: `[sched] ${schedule.brief}`, backend: schedule.backend ?? 'auto',
            state: 'running', startedAt: Date.now(), outputTail: [],
          }, ...current]);
          setSelectedJobId(jobId);
        },
        onOutput: (jobId, chunk) => appendOutput(jobId, chunk),
        onFinish: ({ jobId, schedule }, result) => {
          controllersRef.current.delete(jobId);
          setJobs((current) => current.map((job) => job.id === jobId
            ? {
              ...job,
              state: result.success ? 'success' : result.errorClass === 'cancelled' ? 'cancelled' : 'failed',
              finishedAt: Date.now(),
              exitCode: result.exitCode,
              errorClass: result.errorClass,
              usage: result.usage,
              backend: result.backend,
            }
            : job));
          setMessage(result.success
            ? `Scheduled job ${schedule.id} completed on ${result.backend}.`
            : result.errorClass === 'cancelled'
              ? `Scheduled job ${schedule.id} stopped.`
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
   * Reserved shortcuts also reach TextInput. Suppress only the active
   * shortcuts so ordinary task text can still start with other letters.
   */
  const handleTaskChange = (value: string) => {
    if (value.includes('[<')) return;
    const shortcuts = ['m', 'r', 't', '?', 'q'];
    if (focus === 'jobs') shortcuts.push('s', 'c');
    if (focus === 'backends') shortcuts.push('a');
    setTask((prev) => (prev === '' && value.length === 1 && shortcuts.includes(value) ? prev : value));
  };

  const stopSelectedJob = () => {
    if (!selectedJob || selectedJob.state !== 'running') {
      setMessage('Select a running job to stop.');
      return;
    }
    const controller = controllersRef.current.get(selectedJob.id);
    if (!controller) {
      setMessage('This job cannot be stopped from the TUI.');
      return;
    }
    controller.abort();
    setJobs((current) => current.map((job) => job.id === selectedJob.id ? { ...job, state: 'stopping' } : job));
    setMessage(`Stopping ${selectedJob.id}…`);
  };

  const clearFinishedJobs = () => {
    const remaining = orderedJobs.filter((job) => job.state === 'running' || job.state === 'stopping');
    setJobs(remaining);
    setSelectedJobId(remaining[0]?.id);
    setMessage('Cleared completed jobs.');
  };

  const moveJobSelection = (delta: number) => {
    if (orderedJobs.length === 0) return;
    const next = selectedJobIndex < 0
      ? 0
      : (selectedJobIndex + delta + orderedJobs.length) % orderedJobs.length;
    setSelectedJobId(orderedJobs[next].id);
  };

  const handleMouseClick = (x: number, y: number) => {
    const target = hitTestTuiClick(x, y, {
      columns: process.stdout.columns || 80,
      showJobs,
      backendCount: backends.length,
      visibleJobCount: visibleJobs.length,
      hasMoreJobs: orderedJobs.length > MAX_VISIBLE_JOBS,
    });
    if (target.type === 'task') setFocus('task');
    if (target.type === 'auto') {
      setOverrideIndex(0);
      setFocus('backends');
    }
    if (target.type === 'backend') {
      const backend = backends[target.index];
      if (backend) {
        setOverrideIndex(OVERRIDE_OPTIONS.indexOf(backend.id));
        setFocus('backends');
      }
    }
    if (target.type === 'job') {
      setSelectedJobId(visibleJobs[target.index]?.id);
      setFocus('jobs');
    }
    if (target.type === 'stop') stopSelectedJob();
    if (target.type === 'clear') clearFinishedJobs();
  };

  useInput((input, key) => {
    const click = parseSgrMouseClick(input);
    if (click) {
      if (mode === 'task') handleMouseClick(click.x, click.y);
      return;
    }
    if (mode === 'help' || mode === 'tokens') {
      setMode('task');
      return;
    }
    if (mode !== 'task') return;
    if (key.tab && task.length === 0) {
      const focusOrder: Focus[] = showJobs ? ['task', 'backends', 'jobs'] : ['task', 'backends'];
      setFocus((current) => focusOrder[(focusOrder.indexOf(current) + 1) % focusOrder.length]);
      return;
    }
    if (key.upArrow || key.downArrow) {
      const delta = key.upArrow ? -1 : 1;
      if (focus === 'jobs') moveJobSelection(delta);
      else setOverrideIndex((current) => (current + delta + OVERRIDE_OPTIONS.length) % OVERRIDE_OPTIONS.length);
    }
    if (input === 'q' && task.length === 0) exit();
    if (input === 'r' && task.length === 0) void refresh(true);
    if (input === 'm' && task.length === 0) setMode('manual');
    if (input === 't' && task.length === 0) setMode('tokens');
    if (input === '?' && task.length === 0) setMode('help');
    if (input === 's' && task.length === 0 && focus === 'jobs') stopSelectedJob();
    if (input === 'c' && task.length === 0 && focus === 'jobs') clearFinishedJobs();
    if (input === 'a' && task.length === 0 && focus === 'backends') setOverrideIndex(0);
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
    const priors = await getPriors();
    let classification;
    let selection;
    try {
      ({ classification, selection } = await routeTask(brief, backends, override, { priors }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    const id = `${Date.now()}`;
    const controller = new AbortController();
    controllersRef.current.set(id, controller);
    setJobs((current) => [{
      id, brief, backend: selection.backend, state: 'running',
      startedAt: Date.now(), outputTail: [],
    }, ...current]);
    setSelectedJobId(id);
    setFocus('jobs');
    setTask('');
    setMessage(`Running on ${selection.backend}: ${selection.reason}`);
    try {
      const result = await dispatch({
        brief,
        backend: selection.backend,
        selectionReason: selection.reason,
        classification: { ...classification },
        allowFallback: true,
        signal: controller.signal,
        onStdout: (chunk) => appendOutput(id, chunk),
        onStderr: (chunk) => appendOutput(id, chunk),
      });
      setJobs((current) => current.map((job) => job.id === id
        ? {
          ...job,
          state: result.success ? 'success' : result.errorClass === 'cancelled' ? 'cancelled' : 'failed',
          finishedAt: Date.now(),
          exitCode: result.exitCode,
          errorClass: result.errorClass,
          usage: result.usage,
          backend: result.backend,
        }
        : job));
      setMessage(result.success
        ? `Job completed on ${result.backend}.`
        : result.errorClass === 'cancelled'
          ? `Job stopped on ${result.backend}.`
          : `Job failed on ${result.backend}: ${result.errorClass ?? 'unknown'} (exit ${result.exitCode ?? 'unknown'}).`);
      void refresh(false);
    } catch (error) {
      setJobs((current) => current.map((job) => job.id === id ? { ...job, state: 'failed', finishedAt: Date.now() } : job));
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      controllersRef.current.delete(id);
    }
  };

  const saveManual = async (backend: BackendId, remainingFraction: number, resetsAt: string | null) => {
    await setManualQuota(backend, remainingFraction, resetsAt);
    setMode('task');
    setMessage(`Manual quota saved for ${backend}: ${Math.round(remainingFraction * 100)}% remaining.`);
    void refresh(false);
  };

  return (
    <Box
      flexDirection="column"
      width={process.stdout.columns || undefined}
      minHeight={process.stdout.rows || undefined}
      backgroundColor={theme.background}
    >
      <Box flexDirection="row">
        <Text bold color={theme.primary}>scode</Text><Text dimColor> / </Text><Text color={theme.accent}>{theme.name}</Text>
      </Box>
      {mode === 'tokens' ? (
        <TokensDashboard stats={tokenStats ?? computeTokenStats([], new Date())} theme={theme} />
      ) : mode === 'help' ? (
        <Box borderStyle="round" borderColor={theme.border} flexDirection="column" paddingX={1}>
          <Text bold color={theme.primary}>Controls</Text>
          <Text>Enter — dispatch the task · Tab — switch focus</Text>
          <Text>↑ ↓ — choose a backend or move through jobs</Text>
          <Text>Click a backend to pin it; click the Backends heading for auto-routing.</Text>
          <Text>Click a job to select it; click Stop or press s to cancel a running job.</Text>
          <Text>Click Clear completed or press c to clear finished jobs.</Text>
          <Text>r — refresh quota probes</Text>
          <Text>m — manual quota entry (when the task bar is empty)</Text>
          <Text>t — token usage dashboard (when the task bar is empty)</Text>
          <Text>Theme — run `scode theme set {THEME_ORDER.join('|')}`; restart to apply</Text>
          <Text>? — this help</Text>
          <Text>q — quit (when the task bar is empty)</Text>
          <Text dimColor>Any key closes help.</Text>
        </Box>
      ) : mode === 'manual' ? (
        <ManualEntry theme={theme} backends={backends} onSave={(backend, remaining, reset) => void saveManual(backend, remaining, reset)} onCancel={() => setMode('task')} />
      ) : (
        <TaskBar
          theme={theme}
          value={task}
          onChange={handleTaskChange}
          onSubmit={(value) => void submit(value)}
          disabled={running || focus !== 'task'}
          overrideLabel={override ? `backend: ${override}` : 'backend: auto'}
        />
      )}
      {mode !== 'tokens' && (
        <Box>
          <BackendsPane backends={backends} theme={theme} wide={!showJobs} selectedBackend={override} />
          {showJobs && (
            <JobsPane
              jobs={visibleJobs}
              schedules={schedules}
              now={now}
              theme={theme}
              selectedJobId={selectedJobId}
              totalJobs={orderedJobs.length}
              startIndex={startIndex}
              canClear={orderedJobs.some((job) => job.state === 'success' || job.state === 'failed' || job.state === 'cancelled')}
            />
          )}
        </Box>
      )}
      <Text dimColor>{message}</Text>
      {mode === 'task' && <Text dimColor>Tab focus · click rows · ↑↓ select · s stop · c clear · r refresh · ? help · q quit</Text>}
    </Box>
  );
}
