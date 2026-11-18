import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { BackendId, BackendSnapshot } from '../core/types.js';

/**
 * Parse a reset-time input into an ISO timestamp, or null for unknown.
 * Accepts: "2h" / "30m" / "1d" (from now), ISO dates, or empty (unknown).
 * Pure — unit-tested.
 */
export function parseResetInput(input: string, now: Date = new Date()): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const relative = trimmed.match(/^(\d+(?:\.\d+)?)\s*([hmd])$/i);
  if (relative) {
    const value = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const ms = unit === 'h' ? value * 3_600_000 : unit === 'm' ? value * 60_000 : value * 86_400_000;
    return new Date(now.getTime() + ms).toISOString();
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function ManualEntry({ backends, onSave, onCancel }: {
  backends: BackendSnapshot[];
  onSave: (backend: BackendId, remainingFraction: number, resetsAt: string | null) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(0);
  const [remaining, setRemaining] = useState('');
  const [reset, setReset] = useState('');
  const [error, setError] = useState('');

  const eligible = backends.filter((item) => item.status !== 'disabled');
  const backend = eligible[selected] ?? eligible[0];

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (step !== 0) return;
    if (key.upArrow) setSelected((current) => (current + eligible.length - 1) % eligible.length);
    if (key.downArrow) setSelected((current) => (current + 1) % eligible.length);
    if (key.return) setStep(1);
  }, { isActive: step === 0 });

  const submitRemaining = (value: string) => {
    const percent = Number(value);
    if (value.trim() === '' || Number.isNaN(percent) || percent < 0 || percent > 100) {
      setError('Enter a number between 0 and 100.');
      return;
    }
    setError('');
    setStep(2);
  };

  const submitReset = (value: string) => {
    const resetsAt = parseResetInput(value);
    if (value.trim() !== '' && resetsAt === null) {
      setError('Unrecognised reset time. Try 2h, 30m, 1d, or an ISO date.');
      return;
    }
    if (!backend) return;
    onSave(backend.id, Number(remaining) / 100, resetsAt);
  };

  return (
    <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Manual quota entry</Text>
      <Text dimColor>Probe values replace manual entries when they next succeed. Manual entries age out after 24h.</Text>
      {step === 0 && (
        <Box flexDirection="column">
          <Text>Backend (↑↓ to pick, Enter to continue, Esc to cancel):</Text>
          {eligible.map((item, index) => (
            <Text key={item.id} color={index === selected ? 'cyan' : undefined}>
              {index === selected ? '› ' : '  '}{item.id} — {item.status}
            </Text>
          ))}
        </Box>
      )}
      {step === 1 && backend && (
        <Box>
          <Text>{backend.id} remaining % (0–100): </Text>
          <TextInput value={remaining} onChange={setRemaining} onSubmit={submitRemaining} placeholder="e.g. 65" />
        </Box>
      )}
      {step === 2 && backend && (
        <Box>
          <Text>{backend.id} resets (2h, 30m, 1d, ISO date, or empty): </Text>
          <TextInput value={reset} onChange={setReset} onSubmit={submitReset} placeholder="e.g. 2h" />
        </Box>
      )}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
