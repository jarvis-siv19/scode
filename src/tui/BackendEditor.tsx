import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { BackendSnapshot } from '../core/types.js';
import type { TuiTheme } from './theme.js';

type Field = 'label' | 'account' | 'extra';

export interface BackendEdit {
  label: string;
  account: string;
  extra?: string;
}

export function BackendEditor({ backend, theme, onSave, onCancel }: {
  backend: BackendSnapshot;
  theme: TuiTheme;
  onSave: (edit: BackendEdit) => void;
  onCancel: () => void;
}) {
  const [field, setField] = useState<Field>('label');
  const [label, setLabel] = useState(backend.displayName ?? backend.id);
  const [account, setAccount] = useState(backend.accountLabel ?? '');
  const [extra, setExtra] = useState('');
  const hasExtra = backend.id === 'opencode' || backend.id === 'codex-a' || backend.id === 'codex-b';

  useInput((_input, key) => { if (key.escape) onCancel(); });

  const advance = () => {
    if (field === 'label') setField('account');
    else if (field === 'account' && hasExtra) setField('extra');
    else onSave({ label: label.trim(), account: account.trim(), extra: extra.trim() || undefined });
  };
  const value = field === 'label' ? label : field === 'account' ? account : extra;
  const setValue = field === 'label' ? setLabel : field === 'account' ? setAccount : setExtra;
  const prompt = field === 'label' ? 'Display name'
    : field === 'account' ? 'Account hint (email / @mention)'
      : backend.id === 'opencode' ? 'Model (`free` or provider/model; blank keeps current)'
        : 'CODEX_HOME path (blank keeps current)';

  return (
    <Box borderStyle="round" borderColor={theme.accent} flexDirection="column" paddingX={1}>
      <Text bold color={theme.primary}>Edit {backend.id}</Text>
      <Text dimColor>Local labels never change or expose vendor credentials.</Text>
      <Box><Text color={theme.accent}>{prompt} › </Text><TextInput value={value} onChange={setValue} onSubmit={advance} focus /></Box>
      <Text dimColor>Enter next/save · Esc cancel</Text>
    </Box>
  );
}
