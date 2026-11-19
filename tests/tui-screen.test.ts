import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import {
  ENTER_TUI_SCREEN,
  LEAVE_TUI_SCREEN,
  enterTuiScreen,
  leaveTuiScreen,
} from '../dist/tui/screen.js';

test('tui: alternate screen is entered and fully restored on close', () => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  enterTuiScreen(stream);
  leaveTuiScreen(stream);
  assert.equal(output, `${ENTER_TUI_SCREEN}${LEAVE_TUI_SCREEN}`);
  assert.match(LEAVE_TUI_SCREEN, /\?1000l/);
  assert.match(LEAVE_TUI_SCREEN, /\?1006l/);
  assert.match(LEAVE_TUI_SCREEN, /\?25h/);
  assert.match(LEAVE_TUI_SCREEN, /\?1049l/);
});
