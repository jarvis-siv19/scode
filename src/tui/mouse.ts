export interface TerminalClick {
  x: number;
  y: number;
}

export type TuiClickTarget =
  | { type: 'task' }
  | { type: 'auto' }
  | { type: 'backend'; index: number }
  | { type: 'job'; index: number }
  | { type: 'stop' }
  | { type: 'clear' }
  | { type: 'none' };

/** Parse a left-button SGR mouse press emitted by xterm-compatible terminals. */
export function parseSgrMouseClick(input: string): TerminalClick | null {
  const match = /^\x1b?\[<(\d+);(\d+);(\d+)M$/.exec(input);
  if (!match || Number(match[1]) !== 0) return null;
  return { x: Number(match[2]), y: Number(match[3]) };
}

export function hitTestTuiClick(x: number, y: number, layout: {
  columns: number;
  showJobs: boolean;
  backendCount: number;
  visibleJobCount: number;
  hasMoreJobs: boolean;
}): TuiClickTarget {
  if (y >= 2 && y <= 4) return { type: 'task' };
  const leftPanel = !layout.showJobs || x <= Math.floor(layout.columns / 2);
  if (leftPanel) {
    if (y === 6) return { type: 'auto' };
    const index = y - 7;
    return index >= 0 && index < layout.backendCount ? { type: 'backend', index } : { type: 'none' };
  }
  const jobIndex = y - 7;
  if (jobIndex >= 0 && jobIndex < layout.visibleJobCount) return { type: 'job', index: jobIndex };
  const actionStart = 7 + Math.max(1, layout.visibleJobCount) + Number(layout.hasMoreJobs);
  if (y === actionStart) return { type: 'stop' };
  if (y === actionStart + 1) return { type: 'clear' };
  return { type: 'none' };
}
