# Scheduled jobs

A scheduled job is a task with a clock attached: jcode dispatches it through
the normal router (classify → select backend → dispatch with fallback) at
the time you set. Schedules live in `~/.jcode/schedules.json`; ledger
records for scheduled runs carry a `scheduleId` so `jcode learn` and the
token dashboard can tell them apart from manual runs.

## Adding one

```sh
jcode schedule add "review open PRs" --cron "0 9 * * 1-5"
jcode schedule add "summarize yesterday's commits" --at 2026-11-20T09:00
jcode schedule add "ping me about the deploy" --in 2h
jcode schedule add "weekly dependency audit" --cron "0 10 * * 1" --backend codex-a
```

- `--cron` takes a 5-field cron expression in **local time** (`min hour
  day-of-month month day-of-week`). It recurs forever until removed or
  disabled.
- `--at` takes an ISO datetime in local time (`2026-11-20T09:00`); `--in`
  takes a duration (`30m`, `2h`, `1d`, `1h30m`). Both are one-shot: the
  schedule disables itself after firing once.
- `--backend` pins the backend; without it the job is auto-routed at fire
  time, so it uses whatever has quota then.
- The job runs in the repo you add it from (`--cwd` overrides). The cwd is
  captured at add time — cron's own cwd is your home directory, which is
  almost never the repo you meant.

## Managing

```sh
jcode schedule list                  # id, on/off, next run, kind, backend, brief
jcode schedule remove abc123         # unique id prefix is enough
jcode schedule disable abc123        # keeps it, stops it firing
jcode schedule enable abc123
jcode schedule tick --dry-run        # what would fire right now (fires nothing)
jcode schedule tick                  # fire everything due, now
jcode schedule install               # the OS wiring for your platform
```

## How firing works

jcode is a CLI, not a daemon — nothing fires while no jcode process is
running. Two routes, pick either:

1. **The TUI.** While `jcode` is open it ticks every minute and fires due
   schedules as jobs in the Jobs pane (marked `[sched]`). It never fires
   while another job is running, and never stacks ticks.
2. **The OS scheduler.** `jcode schedule install` prints the wiring:
   a cron line (`*/5 * * * * jcode schedule tick`) on macOS/Linux, or a
   `schtasks` command on Windows. A tick every 5 minutes is plenty —
   schedules fire within 5 minutes of their time.

Tick semantics, all deliberate:

- Sequential: due schedules fire one at a time, in stored order. Parallel
  dispatches would fight over the same quota pools.
- At most once per tick per schedule. A laptop that slept through three
  runs fires one catch-up, not three.
- A schedule mid-run is skipped by the next tick. A run stuck over 2 hours
  is treated as crashed (the default timeout is 30 minutes) and becomes
  due again.
- A failed run still advances the schedule: the next run is computed and
  the failure is in the ledger. A failing schedule never re-fires in a
  loop.
- A one-shot that already fired is disabled, not deleted, so `list` still
  shows what happened. Remove it when you are done with it.
- `tick` exits 1 if any fired job failed, 0 otherwise — useful for cron
  mail and monitoring.
