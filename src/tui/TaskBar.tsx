import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { TuiTheme } from './theme.js';

export function TaskBar({ value, onChange, onSubmit, disabled, overrideLabel, theme }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled: boolean;
  overrideLabel: string;
  theme: TuiTheme;
}) {
  return (
    <Box borderStyle="round" borderColor={disabled ? theme.border : theme.accent} paddingX={1}>
      <Text bold color={disabled ? theme.disabled : theme.primary}>Task › </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} focus={!disabled} placeholder="Describe a coding task and press Enter" />
      <Text dimColor> [{overrideLabel}]</Text>
    </Box>
  );
}
