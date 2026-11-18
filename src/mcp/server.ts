#!/usr/bin/env node
/**
 * jcode-tools MCP server (Phase 4). Stdio transport — spawned by the coding
 * CLIs via `node <jcode>/dist/mcp/server.js` (see `jcode tools install`).
 * All logging goes to stderr; stdout is the protocol.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { callTool, TOOL_DESCRIPTIONS, TOOL_INPUT_SHAPES, TOOL_NAMES } from './tools.js';

const server = new McpServer({ name: 'jcode-tools', version: '0.1.0' });

for (const name of TOOL_NAMES) {
  server.registerTool(name, {
    title: name,
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: TOOL_INPUT_SHAPES[name],
  }, async (args: Record<string, unknown>) => {
    const result = await callTool(name, args ?? {});
    return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError };
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[jcode-tools] MCP server running (stdio): pdf-read, latex-build, file-peek');
