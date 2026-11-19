import type { ThemeId } from '../core/types.js';

export interface TuiTheme {
  name: string;
  background: string;
  primary: string;
  accent: string;
  border: string;
  quota: string;
  success: string;
  warning: string;
  error: string;
  cooling: string;
  disabled: string;
}

export const THEMES: Record<ThemeId, TuiTheme> = {
  ember: {
    name: 'Ember',
    background: '#09070a',
    primary: '#ff5b62',
    accent: '#ffb45c',
    border: '#a43e48',
    quota: '#ff796d',
    success: '#58d68d',
    warning: '#ffd166',
    error: '#ff5b62',
    cooling: '#d88cff',
    disabled: '#85818a',
  },
  classic: {
    name: 'Classic',
    background: '#080d12',
    primary: '#45e0d0',
    accent: '#da8cff',
    border: '#277f84',
    quota: '#55d7e8',
    success: '#58d68d',
    warning: '#ffd166',
    error: '#ff6868',
    cooling: '#da8cff',
    disabled: '#818a94',
  },
  aurora: {
    name: 'Aurora',
    background: '#06100f',
    primary: '#70e0a0',
    accent: '#65c9f5',
    border: '#347c67',
    quota: '#65c9f5',
    success: '#70e0a0',
    warning: '#f1ca68',
    error: '#ff737b',
    cooling: '#a897ff',
    disabled: '#7e8984',
  },
  violet: {
    name: 'Violet',
    background: '#0c0812',
    primary: '#c4a0ff',
    accent: '#ff8bcb',
    border: '#7650a1',
    quota: '#c4a0ff',
    success: '#61d6a0',
    warning: '#ffd166',
    error: '#ff667b',
    cooling: '#ff8bcb',
    disabled: '#87818f',
  },
};

export const THEME_ORDER: ThemeId[] = ['ember', 'classic', 'aurora', 'violet'];
