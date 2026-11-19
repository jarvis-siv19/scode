# scode

**Quota-aware routing for coding agents, with optional Bivia decisions.**

scode classifies tasks and selects an eligible coding CLI, then runs the task
without changing the vendor's tool. With Bivia configured, its fast decision
API helps classify and route each task; otherwise scode uses local rules.

![scode terminal interface](https://raw.githubusercontent.com/sivab193/scode/main/docs/shots/tui-main.png)

## Get started

Requires Node.js 22+ and at least one authenticated coding-agent CLI.

```sh
npm install -g --no-fund --no-audit @sivab193/scode
scode
```

To try scode without a global install:

```sh
npx -y @sivab193/scode
npx -y @sivab193/scode status
npx -y @sivab193/scode doctor --quick
```

The first command opens the terminal UI. The other commands let you check
detected backends and your machine setup without adding `scode` to your PATH.
Use the package name, including `@sivab193/`; `npm install -g sivab193/scode`
does not refer to this npm package.

If a global npm install fails or your npm prefix is not in PATH, install under
your home directory instead:

```sh
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
npm install -g --no-fund --no-audit @sivab193/scode
```

For bash or a shell other than zsh, add `$HOME/.npm-global/bin` to that
shell's PATH instead.

### Run or install from source

Clone and run the checkout without linking it globally:

```sh
git clone https://github.com/sivab193/scode.git
cd scode
npm install --no-fund --no-audit
npm run build
npm start
```

Run individual source commands with `npm run dev --`:

```sh
npm run dev -- status
npm run dev -- doctor --quick
npm run dev -- run "review this change"
```

To expose the source checkout as `scode` and `jcode` on your PATH, link it
globally after building:

```sh
npm run build
npm link
```

Remove the local global link with:

```sh
npm unlink -g @sivab193/scode
```

### Uninstall

Global npm install:

```sh
npm uninstall -g @sivab193/scode
```

Home-directory npm install:

```sh
npm uninstall -g --prefix ~/.npm-global @sivab193/scode
```

The no-install `npx` commands keep scode out of the global npm installation;
they only use npm's temporary download cache.

## Use

```sh
scode run "review this change"
scode status
scode doctor --quick
scode theme set ember
```

Running `scode` opens the interactive terminal UI. Choose from Ember
(red/black), Classic, Aurora, or Violet with `scode theme set <name>`.
In the TUI, click to pin a backend or select a job; stop a running job with
the Stop action or `s`. Tab and arrow keys work without a mouse.

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
