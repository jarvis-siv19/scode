# What Codex needs to test on the host (Windows laptop)

Everything buildable in a clean environment is built: all six phases, the
lessons store, the real claude adapter (disabled), the prompt pack, CI, and
these docs. What is left can only be verified where the CLIs are installed
and logged in. This is that list, in order. Work from a fresh clone of
`sivab193/jcode` after PR #1 merges, on a branch named with the day's date.

## 0. Baseline

- `npm ci` then `npm test` — expect all tests green (95 at last count).
  If any fail on Windows, that is a real bug: fix it on the branch, do not
  skip it.
- `jcode status` — every installed backend should show a version string.
  Missing CLIs show as unavailable with the reason. Nothing should show a
  quota number that was not probed or manually entered.

## 1. Phase 0 gate: `jcode doctor`

Run the full doctor (not `--quick`). Every dispatch check needs a real,
logged-in CLI:

- **codex-a and codex-b dispatch smoke** — each must create SMOKE.md with
  the exact line in a temp dir. If codex-b fails with an auth error, check
  that its `CODEX_HOME` is really a separate login; if both accounts share
  one home, jcode will see one pool twice.
- **kiro / agy / copilot / opencode dispatch smoke** — same check, one per
  backend. If a backend's headless command differs from the handoff table
  (flags change between releases), update the adapter AND the handoff
  command table in this doc's notes — do not silently work around it.
- **Quota probes** — codex app-server JSON-RPC should return real windows
  (this failed on the build VM only because codex was unauthenticated).
  kiro `/usage` parsing is the fragile one: if the format changed, paste
  the raw `/usage` output into the fix commit message and update the parser.
- **Caveman wrap test** (`jcode doctor --full`) — needs Caveman installed
  (`npx @caveman-ai/cli@latest`). If the wrap breaks a CLI's JSON output,
  that backend goes on the do-not-wrap list (`caveman.perBackend`).
- **MCP server load test** — must pass; it spawns the real server and lists
  the three tools over JSON-RPC.

Doctor writes `%USERPROFILE%\.jcode\smoke.json`. Keep it — it is the record
of what this machine can do.

## 2. One real run per backend

For each installed backend, run a real task through the router (not a
smoke test): `jcode run --backend <id> "<a small real task in a test repo>"`.
Check each run in the ledger (`%USERPROFILE%\.jcode\ledger.jsonl`):

- `run-started` and `run-finished` records exist with matching task ids.
- The worktree was created under `.git\jcode-worktrees\<taskId>` and removed
  on success.
- Tokens / cost / premium-requests are recorded when the backend reports
  them; absent when it does not. Never a fabricated number.
- Session ids are captured in `sessions.json`, and a follow-up
  `jcode run` on the same task resumes the session.

## 3. Prompt pack

- Run a job in a repo that has NO AGENTS.md / CLAUDE.md / JCODE_NOTES.md.
  The job's worktree diff must contain the four seeded files, and the agent
  must have read them (check the run output for a reference to the working
  rules or JCODE_NOTES.md).
- Run a job in a repo that HAS its own AGENTS.md. jcode must not overwrite
  it — the file must be byte-identical afterwards.
- If a backend ignores its steering file (some versions do), note which one
  and how you confirmed it. Do not work around it by duplicating the rules
  into every brief.

## 4. TUI

Bare `jcode` in Windows Terminal. Check: task bar accepts input, backends
pane shows quota bars and reset times, `m` opens manual quota entry and the
entry shows as MANUAL, up/down cycles the backend override, `?` shows help,
`r` refreshes probes, jobs show live elapsed time, and `q` quits cleanly.
If Ink misbehaves on this terminal, report the exact symptom — do not
replace the TUI.

## 5. MCP tools

- `jcode tools install`, then `jcode tools status` — all five backends
  should show configured (agy is skipped by design; see §7).
- Ask codex (or any backend) to use `file-peek` on a real file, `pdf-read`
  on a real PDF, and `latex-build` on a real .tex file. Each call is logged
  to `tool-calls.jsonl` — verify the log has the calls.
- If a backend does not pick up the server, check its config file first
  (paths are in `src/mcp/install.ts`); the wiring is the usual suspect, not
  the server.

## 6. Caveman (only after §1's wrap test passes)

- One real run with `JCODE_CAVEMAN=true` per backend. Compare token counts
  in the ledger against the same task run without it. If a backend's output
  degrades or its JSON breaks under the wrap, add it to
  `caveman.perBackend` as disabled and note it here.

## 7. Known unknowns — resolve on the host, do not guess

- **agy MCP config path** — unconfirmed, which is why `tools install`
  skips agy. Find the real path on the machine and add it to install.ts.
- **kiro `/usage` format** — the probe parses the current text format.
  If it changed, update the parser with the raw output in the commit.
- **Copilot premium-request accounting** — confirm the per-run count in the
  ledger matches what Copilot reports. This sets the real budget.
- **OpenCode default provider** — the user's decision, not Codex's. Ask
  before changing `opencodeModel` away from free models.
- **claude status-line rate-limits file** — the probe reads
  `JCODE_CLAUDE_RATE_LIMITS_FILE` or `~/.jcode/claude-rate-limits.json`.
  Confirm the real path once Claude Code is installed.

## 8. Claude (only after Pro is live, ~Nov 30)

Do not enable before then. When Pro is live:

1. Set `claudeEnabled: true` in config AND `JCODE_CLAUDE_ENABLED=true`.
2. `jcode doctor` — the claude dispatch smoke must pass.
3. One real `jcode run --backend claude` task; verify `total_cost_usd`
   lands in the ledger.
4. If the adapter's command needs flags for the installed Claude version,
   update the adapter and the handoff table together.

## 9. Learn loop (after a few days of real runs)

- `jcode learn` — the report must show real per-backend x class stats.
- `%USERPROFILE%\.jcode\lessons.md` must accumulate one entry per fold.
- If a proposal looks wrong, say which numbers disagree — do not tune the
  thresholds to make the report look nicer.

## 10. Scheduled jobs

- `jcode schedule add "say hello" --in 1m`, then `jcode schedule tick
  --dry-run` — must say "Would fire" after the minute passes.
- `jcode schedule tick` — must dispatch through the real router (check the
  ledger: the run-started record carries a `scheduleId`), and the one-shot
  must show disabled in `jcode schedule list` afterwards.
- `jcode schedule install` — must print a `schtasks` command on Windows.
  Do NOT create the scheduled task without asking — it is a system change.
- Open the TUI with a due schedule pending: it must fire as a `[sched]`
  job within a minute, and the Jobs pane must show upcoming schedules.

## What to change vs what to report

- **Fix on the branch:** test failures, adapter command changes, probe
  parser updates, prompt-pack bugs, TUI bugs. One commit per fix, then a PR.
- **Update these docs:** anything in §7 that gets resolved, any CLI version
  requirement that changes, any host-setup step that turns out wrong.
- **Report back without changing:** the three open decisions in
  docs/host-setup.md §6, any ToS wording a CLI shows about third-party
  harnesses, and any quota number that looks wrong (with the raw probe
  output attached).
