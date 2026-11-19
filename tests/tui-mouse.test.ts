import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'ink';
import { hitTestTuiClick, parseSgrMouseClick } from '../dist/tui/mouse.js';
import { JobsPane } from '../dist/tui/JobsPane.js';
import { THEMES } from '../dist/tui/theme.js';

test('mouse parser accepts SGR left-button presses with and without ESC prefix', () => {
  assert.deepEqual(parseSgrMouseClick('\u001b[<0;24;6M'), { x: 24, y: 6 });
  assert.deepEqual(parseSgrMouseClick('[<0;12;9M'), { x: 12, y: 9 });
});

test('mouse parser ignores releases, non-left buttons, and malformed input', () => {
  assert.equal(parseSgrMouseClick('[<0;12;9m'), null);
  assert.equal(parseSgrMouseClick('[<2;12;9M'), null);
  assert.equal(parseSgrMouseClick('not a mouse event'), null);
});

test('mouse hit testing selects backend/job rows and stop/clear actions', () => {
  const layout = { columns: 120, showJobs: true, backendCount: 7, visibleJobCount: 2, hasMoreJobs: false };
  assert.deepEqual(hitTestTuiClick(20, 8, layout), { type: 'backend', index: 1 });
  assert.deepEqual(hitTestTuiClick(100, 8, layout), { type: 'job', index: 1 });
  assert.deepEqual(hitTestTuiClick(100, 9, layout), { type: 'stop' });
  assert.deepEqual(hitTestTuiClick(100, 10, layout), { type: 'clear' });
});

test('jobs pane exposes stop and clear actions', () => {
  const output = renderToString(React.createElement(JobsPane, {
    jobs: [{
      id: 'job-1',
      brief: 'test task',
      backend: 'codex-a',
      state: 'running',
      startedAt: Date.now(),
      outputTail: [],
    }],
    now: Date.now(),
    theme: THEMES.ember,
    selectedJobId: 'job-1',
    totalJobs: 1,
    startIndex: 0,
    canClear: false,
  }));
  assert.match(output, /Stop selected/);
  assert.match(output, /Clear completed/);
});
