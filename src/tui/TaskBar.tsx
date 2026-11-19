import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { TuiTheme } from './theme.js';

export function TaskBar({ value, onChange, onSubmit, disabled, overrideLabel, interactionMode, theme }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled: boolean;
  overrideLabel: string;
  interactionMode: 'task' | 'chat';
  theme: TuiTheme;
}) {
  return (
    <Box borderStyle="round" borderColor={disabled ? theme.border : theme.accent} paddingX={1}>
      <Text bold color={disabled ? theme.disabled : theme.primary}>{interactionMode === 'task' ? 'Task' : 'Chat'} › </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} focus={!disabled} placeholder={interactionMode === 'task' ? 'Describe a coding task and press Enter' : 'Ask or continue the conversation'} />
      <Text dimColor> [{overrideLabel}]</Text>
    </Box>
  );
}
