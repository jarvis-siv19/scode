# scode

**One command to route coding tasks across your AI coding tools.**

scode checks backend availability and quota, picks a suitable CLI for each task,
and runs it without changing the vendor's tool. It keeps routing history locally.

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
- Runs each task in its own Git worktree.
- Tracks runs and token usage in a local ledger.
- Supports scheduled jobs and MCP tools.

See the [full documentation](https://github.com/sivab193/scode/tree/main/docs) for setup and usage details.

[GitHub](https://github.com/sivab193/scode) · [npm](https://www.npmjs.com/package/@sivab193/scode) · [MIT License](LICENSE)
