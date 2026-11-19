/**
 * Phase 4 — `scode tools install`: write the jcode-tools MCP server entry
 * into each backend's config file, non-destructively (existing servers are
 * preserved; only the jcode-tools entry is added or replaced).
 *
 * Config locations (per vendor docs):
 * - Codex (both accounts share one config): ~/.codex/config.toml
 *   `[mcp_servers.jcode-tools]`
 * - Claude Code: ~/.claude.json `mcpServers`
 * - Kiro: ~/.kiro/settings/mcp.json `mcpServers`
 * - Copilot CLI: ~/.copilot/mcp-config.json `mcpServers`
 * - OpenCode: ~/.config/opencode/opencode.json `mcp`
 * - agy (Antigravity CLI): config path not confirmed — skipped with manual
 *   instructions rather than guessed. Update this file once confirmed.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BackendId } from '../core/types.js';

export const SERVER_NAME = 'jcode-tools';

/** Absolute path to the built MCP server entrypoint. */
export function serverScriptPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), 'server.js');
}

export interface InstallOutcome {
  backend: BackendId;
  path: string;
  status: 'installed' | 'already-present' | 'skipped' | 'error';
  detail: string;
}

/**
 * Merge a server entry into a JSON MCP config's server map. Pure — tested.
 * `key` is the map key ('mcpServers' for most, 'mcp' for OpenCode).
 * Returns the new file text, or null when the existing text is not valid JSON
 * (never clobber a config we cannot parse).
 */
export function mergeJsonMcpServers(
  existingText: string | null,
  key: string,
  entry: Record<string, unknown>,
): string | null {
  let parsed: Record<string, unknown> = {};
  if (existingText !== null && existingText.trim() !== '') {
    try {
      parsed = JSON.parse(existingText) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const servers = (parsed[key] as Record<string, unknown> | undefined) ?? {};
  servers[SERVER_NAME] = entry;
  parsed[key] = servers;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

/**
 * Merge the jcode-tools section into a Codex config.toml. Pure — tested.
 * Replaces an existing [mcp_servers.jcode-tools] section in place, or
 * appends it. Other sections are left untouched.
 */
export function mergeCodexToml(existingText: string | null, command: string, args: string[]): string {
  const section = [
    `# jcode-tools MCP server (managed by \`scode tools install\`)`,
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${JSON.stringify(command)}`,
    `args = ${JSON.stringify(args)}`,
    '',
  ].join('\n');
  const text = existingText ?? '';
  if (!text.includes(`[mcp_servers.${SERVER_NAME}]`)) {
    return text === '' ? section : `${text.endsWith('\n') ? text : `${text}\n`}\n${section}`;
  }
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === `[mcp_servers.${SERVER_NAME}]`);
  // A marker comment line directly above the section belongs to it.
  const sectionStart = start > 0 && lines[start - 1].includes('jcode-tools') ? start - 1 : start;
  let end = start + 1;
  while (end < lines.length && !lines[end].trim().startsWith('[')) end++;
  const before = lines.slice(0, sectionStart).join('\n');
  const after = lines.slice(end).join('\n');
  return `${before}${before && !before.endsWith('\n') ? '\n' : ''}${section}${after}`;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function writeConfig(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, 'utf-8');
}

function jsonEntry(): Record<string, unknown> {
  return { command: 'node', args: [serverScriptPath()] };
}

function opencodeEntry(): Record<string, unknown> {
  return { type: 'local', command: ['node', serverScriptPath()], environment: {} };
}

export async function installForBackend(backend: BackendId, home: string = homedir()): Promise<InstallOutcome> {
  const script = serverScriptPath();
  switch (backend) {
    case 'codex-a':
    case 'codex-b': {
      const path = join(home, '.codex', 'config.toml');
      const existing = await readIfExists(path);
      const merged = mergeCodexToml(existing, 'node', [script]);
      if (merged === existing) return { backend, path, status: 'already-present', detail: 'jcode-tools entry already present' };
      await writeConfig(path, merged);
      return { backend, path, status: 'installed', detail: 'wrote [mcp_servers.jcode-tools] to config.toml' };
    }
    case 'claude': {
      const path = join(home, '.claude.json');
      const existing = await readIfExists(path);
      const merged = mergeJsonMcpServers(existing, 'mcpServers', jsonEntry());
      if (merged === null) return { backend, path, status: 'error', detail: 'existing .claude.json is not valid JSON — left untouched' };
      if (merged === existing) return { backend, path, status: 'already-present', detail: 'jcode-tools entry already present' };
      await writeConfig(path, merged);
      return { backend, path, status: 'installed', detail: 'added jcode-tools to mcpServers' };
    }
    case 'kiro': {
      const path = join(home, '.kiro', 'settings', 'mcp.json');
      const existing = await readIfExists(path);
      const merged = mergeJsonMcpServers(existing, 'mcpServers', jsonEntry());
      if (merged === null) return { backend, path, status: 'error', detail: 'existing mcp.json is not valid JSON — left untouched' };
      if (merged === existing) return { backend, path, status: 'already-present', detail: 'jcode-tools entry already present' };
      await writeConfig(path, merged);
      return { backend, path, status: 'installed', detail: 'added jcode-tools to mcpServers' };
    }
    case 'copilot': {
      const path = join(home, '.copilot', 'mcp-config.json');
      const existing = await readIfExists(path);
      const merged = mergeJsonMcpServers(existing, 'mcpServers', jsonEntry());
      if (merged === null) return { backend, path, status: 'error', detail: 'existing mcp-config.json is not valid JSON — left untouched' };
      if (merged === existing) return { backend, path, status: 'already-present', detail: 'jcode-tools entry already present' };
      await writeConfig(path, merged);
      return { backend, path, status: 'installed', detail: 'added jcode-tools to mcpServers' };
    }
    case 'opencode': {
      const path = join(home, '.config', 'opencode', 'opencode.json');
      const existing = await readIfExists(path);
      const merged = mergeJsonMcpServers(existing, 'mcp', opencodeEntry());
      if (merged === null) return { backend, path, status: 'error', detail: 'existing opencode.json is not valid JSON — left untouched' };
      if (merged === existing) return { backend, path, status: 'already-present', detail: 'jcode-tools entry already present' };
      await writeConfig(path, merged);
      return { backend, path, status: 'installed', detail: 'added jcode-tools to mcp' };
    }
    case 'agy':
      return {
        backend,
        path: '(unknown)',
        status: 'skipped',
        detail: `agy MCP config path is not confirmed — add manually: server "${SERVER_NAME}", command node, args ["${script}"]`,
      };
  }
}

export async function toolsStatus(home: string = homedir()): Promise<Array<{ backend: BackendId; path: string; configured: boolean }>> {
  const targets: Array<{ backend: BackendId; path: string }> = [
    { backend: 'codex-a', path: join(home, '.codex', 'config.toml') },
    { backend: 'claude', path: join(home, '.claude.json') },
    { backend: 'kiro', path: join(home, '.kiro', 'settings', 'mcp.json') },
    { backend: 'copilot', path: join(home, '.copilot', 'mcp-config.json') },
    { backend: 'opencode', path: join(home, '.config', 'opencode', 'opencode.json') },
  ];
  const rows: Array<{ backend: BackendId; path: string; configured: boolean }> = [];
  for (const target of targets) {
    const text = await readIfExists(target.path);
    rows.push({ ...target, configured: text !== null && text.includes(SERVER_NAME) });
  }
  return rows;
}
