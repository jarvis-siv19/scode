import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export function TaskBar({ value, onChange, onSubmit, disabled }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Box borderStyle="round" paddingX={1}>
      <Text bold color="cyan">Task › </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} focus={!disabled} placeholder="Describe a coding task and press Enter" />
    </Box>
  );
}
