# jcode

`jcode` is a local-first, quota-aware router for coding-agent CLIs. One command
chooses an eligible backend for a whole job, launches the vendor's unmodified
binary, streams its output, and records the routing decision in a local ledger.

The first host is a Windows laptop. Runtime state lives in `%USERPROFILE%\\.jcode`
(or `JCODE_HOME`) and is never committed.

## Install

Requires Node.js 20+ and at least one authenticated backend CLI. Codex is the
first working adapter.

```sh
npm install
npm run build
npm link
```

## Usage

```sh
jcode                         # open the Ink terminal UI
jcode run "review this change"
jcode run --backend codex-a "add tests"
jcode status
jcode learn                   # learning fold (implemented in Phase 5)
```

`jcode run` defaults to the current directory. It never extracts or reuses a
vendor login token: adapters only spawn official CLIs. Claude is intentionally
disabled until a Claude Pro subscription is confirmed and smoke-tested.

## Backends

The planned backend set is `codex-a`, `codex-b`, `kiro`, `agy`, `copilot`,
`opencode`, and `claude`. Missing CLIs and unavailable quota probes are reported
honestly as unknown/unavailable; placeholder data is labeled.

## Development phases

1. Base scaffold and real Codex dispatch
2. Phase 0 machine smoke tests
3. Phase 1 router core and real adapters
4. Phase 2 full TUI
5. Phase 3 optional Caveman efficiency layer
6. Phase 4 ledger-justified MCP tools
7. Phase 5 learning loop
8. Phase 6 measured policy refinement

No paid API credits are required or used. OpenCode defaults to free models once
its adapter is configured.
