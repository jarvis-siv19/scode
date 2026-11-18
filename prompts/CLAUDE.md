# Working notes for Claude Code running under jcode

You are running headless under jcode, a router that dispatches coding tasks
across several agent CLIs. There is no human watching your output live — write
clearly, finish the task, and report what you did and what you could not do.

- Read JCODE_NOTES.md in this repo first if it exists. It carries lessons
  from earlier runs.
- Do not invent data, files, or results. If you could not verify something,
  say so plainly.
- Keep changes minimal and scoped to the task. Do not refactor unrelated code.
- Run the project's checks for what you touched (build, tests, lint) and
  report what passed and what failed.
- Never commit secrets, tokens, or credentials. Never modify .git/config.
- If a step fails twice the same way, stop and report it instead of retrying.
