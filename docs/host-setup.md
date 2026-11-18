# Host setup (Windows laptop)

jcode is local-first: it runs on the machine where the coding CLIs are
installed and logged in. This is that machine's setup guide. Nothing here
needs a server, a paid API key, or a token handed to anyone — every adapter
spawns the official CLI, which keeps its own login.

## 1. Prereqs

- Node.js 20+ (`node --version`)
- git
- A terminal that supports Ink (Windows Terminal is fine)
- Python 3.11+ (for the Graphify code graph — optional; everything else
  works without it, the graph features just skip silently)

## 2. Install the CLIs and log each one in

| Backend | Install | Login |
|---|---|---|
| codex-a / codex-b | `npm i -g @openai/codex` (or the Codex installer) | `codex login` once per account, each under its own `CODEX_HOME` (below) |
| kiro | `kiro-cli` installer | `kiro-cli` first run, or `KIRO_API_KEY` in the environment |
| agy | Google Antigravity CLI installer | `agy` first run |
| copilot | `npm i -g @github/copilot` (>= v1.0.28) | `copilot` first run |
| opencode | opencode installer (v2) | none for free models |
| claude | Claude Code installer | only after Claude Pro is live (see below) |

Optional, for the code graph (see docs/graphify.md):

```powershell
winget install astral-sh.uv
uv tool install "graphifyy[mcp]"     # pin a version in production, e.g. graphifyy==0.9.112
graphify --version                   # verify it is on PATH
```

## 3. Two Codex accounts, two homes

One login per `CODEX_HOME` — this is the clean official path, and it is why
jcode treats codex-a and codex-b as separate quota pools.

```powershell
$env:CODEX_HOME = "$env:USERPROFILE\.codex-a"; codex login   # account A
$env:CODEX_HOME = "$env:USERPROFILE\.codex-b"; codex login   # account B
```

Then point jcode at them in `%USERPROFILE%\.jcode\config.json`
(see `config.example.json` in the repo):

```json
{ "codexHomes": { "a": "C:\\Users\\you\\.codex-a", "b": "C:\\Users\\you\\.codex-b" } }
```

If codex-b has no home configured, jcode reports it unavailable rather than
silently sharing account A's login.

## 4. Config

Copy `config.example.json` to `%USERPROFILE%\.jcode\config.json` and edit it.
The fields:

- `quotaFloor` (0.1) — backends below this remaining fraction are skipped
  unless they are the only option.
- `defaultTimeoutMs` — per-job timeout (30 min default).
- `claudeEnabled` — **leave false** until Claude Pro is live and the smoke
  test passes. Enabling also needs `JCODE_CLAUDE_ENABLED=true` in the
  environment (double-gate).
- `opencodeModel` — free model for the opencode backend.
- `copilotMaxContinues` — cap on Copilot autonomous steps per run (premium
  requests). Set this to match the Copilot plan.
- `claudeMaxTurns` / `claudeMaxBudgetUsd` / `claudeMcpConfig` — only used
  when claude is enabled.
- `caveman` — token-efficiency layer. Off by default; `mode: "proxy"` wraps
  the CLI, `"skill-only"` never wraps. `perBackend` overrides per backend.

Environment variables (all optional):

- `JCODE_HOME` — state dir (default `%USERPROFILE%\.jcode`).
- `JCODE_CODEX_A_HOME` / `JCODE_CODEX_B_HOME` — same as `codexHomes`.
- `JCODE_OPENCODE_ATTACH` — attach to a warm `opencode serve`.
- `JCODE_CAVEMAN=true` — enable the Caveman layer.
- `JCODE_LAYA_URL` — Laya classification endpoint (`POST /classify`).
- `JCODE_CLAUDE_RATE_LIMITS_FILE` — claude status-line rate-limits file.

## 5. Verify

```powershell
npm ci
npm test          # expect all tests green (95 at last count)
jcode doctor      # Phase 0 gate — see docs/codex-local-testing.md
jcode tools install   # wire the jcode-tools MCP server into the backends
```

## 6. Weekly habit

Run `jcode learn` once a week. It writes the report to
`%USERPROFILE%\.jcode\learn-report.md` and appends the fold to
`%USERPROFILE%\.jcode\lessons.md`. Proposals are presented, never
auto-applied — read them, then change `config.json` by hand if you agree.

## Decisions still open

These are the user's to make, not defaults to guess:

- **Copilot plan** (Free / Pro / GitHub Student / org) — sets the
  premium-request budget and `copilotMaxContinues`.
- **OpenCode default provider** — free models unless he says otherwise.
- **Claude Pro live date** — expected by Nov 30, 2026. Only then enable the
  claude adapter and run its smoke test.
