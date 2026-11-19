import type { Writable } from 'node:stream';

/** Keep the full-screen TUI out of the shell's normal scrollback buffer. */
export const ENTER_TUI_SCREEN = '\u001b[?1049h\u001b[2J\u001b[H';
/** Disable mouse capture, show the cursor, then restore the previous screen. */
export const LEAVE_TUI_SCREEN = '\u001b[?1000l\u001b[?1006l\u001b[?25h\u001b[?1049l';

export function enterTuiScreen(stream: Writable = process.stdout): void {
  stream.write(ENTER_TUI_SCREEN);
}

export function leaveTuiScreen(stream: Writable = process.stdout): void {
  stream.write(LEAVE_TUI_SCREEN);
}
