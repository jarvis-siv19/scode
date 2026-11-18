# jcode

`jcode` is a local-first, quota-aware router for coding-agent CLIs. One command
chooses an eligible backend for a whole job, launches the vendor's unmodified
binary, streams its output, and records the routing decision in a local ledger.

The first host is a Windows laptop. Runtime state lives in `%USERPROFILE%\.jcode`
(or `JCODE_HOME`) and is never committed.

## Status

- ✅ Base scaffold + real Codex dispatch (Codex, Nov 18, 2026)
- ✅ Phase 0 — `jcode doctor` smoke-test harness (run it on the host to go green)
- ✅ Phase 1 — router core: real kiro/agy/copilot/opencode adapters, quota
  probes, rule-based classifier, quota-floor + soonest-expiring policy,
  worktree-per-job dispatch with one fallback, JSONL ledger
- ✅ Phase 2 — full TUI: manual quota entry (`m`), backend override (↑↓),
  jobs pane with live elapsed / tokens / output tail, help overlay (`?`)
- ✅ Phase 3 — Caveman efficiency layer (opt-in per backend, telemetry off,
  Auto off; every run records `cavemanWrapped` in the ledger for measurement)
- ✅ Phase 4 — MCP tool suite v1: `jcode-tools` server (pdf-read, latex-build,
  file-peek) + `jcode tools install` wiring into Codex/Claude/Kiro/Copilot/
  OpenCode configs; doctor load-tests the server for real
- ⏳ Phase 5 — learning loop (`jcode learn`)
- ⏳ Phase 6 — measured policy refinement

Claude stays disabled until Claude Pro is confirmed live (~Nov 30, 2026) and
its smoke test passes. Never enable it on your own.

## Install

Requires Node.js 20+ and at least one authenticated backend CLI.

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
jcode run --dry-run "show me the exact command, run nothing"
jcode status                  # per-backend headroom (runs quota probes)
jcode doctor                  # Phase 0 smoke tests for this machine
jcode doctor --quick          # presence + probes only, no live dispatches
jcode doctor --full           # also test the Caveman wrap on codex
jcode learn                   # learning fold (implemented in Phase 5)
```

`jcode run` defaults to the current directory and runs each job in its own git
worktree (kept on failure for inspection, removed on success). It never
extracts or reuses a vendor login token: adapters only spawn official CLIs.

## Backends

`codex-a`, `codex-b`, `kiro`, `agy`, `copilot`, `opencode`, `claude`.
Missing CLIs and unavailable quota probes are reported honestly as
unknown/unavailable; placeholder data is labeled, never faked as live.

- **codex-a / codex-b** — separate `CODEX_HOME` per account
  (`JCODE_CODEX_A_HOME`, `JCODE_CODEX_B_HOME`). Quota via the app-server
  JSON-RPC probe (consumes no quota).
- **kiro** — `KIRO_API_KEY` from the environment. Quota via `/usage`.
- **agy** — Google's Antigravity CLI (binary `agy`), not Auggie, not Aider.
  Quota probing is best-effort; reactive mode (per-run usage + 429s) is the
  design, not a bug.
- **copilot** — CLI >= v1.0.28. Bills in premium requests; exit code 3 means
  the limit is reached (hard stop, no retry). Tracked in the ledger.
- **opencode** — v2 only, free models by default (`opencodeModel` in
  `~/.jcode/config.json`). No native quota; if it points at a subscription
  pool it draws on the same pool as that adapter.
- **claude** — disabled until Pro is live. Quota probe reads a status-line
  `rate_limits` file when one exists (`JCODE_CLAUDE_RATE_LIMITS_FILE`).

## Policy

Rule-based routing (Laya integration is a later phase): AWS work → kiro,
huge-repo exploration → agy, GitHub work → copilot, free-model work →
opencode, deep reasoning → claude (once live). Among eligible backends the
soonest-expiring quota goes first, accounts below the floor (default 10%
remaining) are skipped unless they are the only option, and cooling-down
accounts are never picked. On a classified failure the dispatcher falls back
once: quota failures cool the account down and route sideways, capability
failures escalate to a stronger backend.

## Terminal notes

- [iTerm2](docs/iterm2.md) — why it helps on the Mac (tmux `-CC` is the
  `jcode attach` story), and why nothing in the router depends on it.

## Development

```sh
npm run build    # TypeScript build
npm test         # build + node:test suite (classifier, policy, probes, worktrees)
npm run check    # typecheck only
```

No paid API credits are required or used. OpenCode defaults to free models.
