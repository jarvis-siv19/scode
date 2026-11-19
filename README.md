# scode

**Quota-aware routing for coding agents, with optional Bivia decisions.**

scode classifies tasks and selects an eligible coding CLI, then runs the task
without changing the vendor's tool. With Bivia configured, its fast decision
API helps classify and route each task; otherwise scode uses local rules.

![scode terminal interface](https://raw.githubusercontent.com/sivab193/scode/main/docs/shots/tui-main.png)

## Get started

Requires Node.js 22+ and at least one authenticated coding-agent CLI.

```sh
npm install -g @sivab193/scode
scode
```

Or launch without installing:

```sh
npx -y @sivab193/scode
```

## Use

```sh
scode run "review this change"
scode status
scode doctor --quick
```

Running `scode` opens the interactive terminal UI. Use `jcode` as a
compatibility alias.

## Features

- Routes tasks across supported coding-agent CLIs based on task and quota.
- Uses Bivia for task classification and backend selection when configured.
- Runs each task in its own Git worktree.
- Tracks runs and token usage in a local ledger.
- Supports scheduled jobs and MCP tools.

When enabled, Bivia receives the task brief and available backends' quota
summaries. See [Bivia routing](https://github.com/sivab193/scode/blob/main/docs/bivia-routing.md)
for setup, privacy, and local fallback behavior.

See the [full documentation](https://github.com/sivab193/scode/tree/main/docs) for setup and usage details.

[GitHub](https://github.com/sivab193/scode) · [npm](https://www.npmjs.com/package/@sivab193/scode) · [MIT License](LICENSE)
