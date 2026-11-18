# Publishing jcode to npm

jcode is TypeScript on Node, so npm is its home. There is no PyPI package:
PyPI is for Python, and jcode has no Python in it. A PyPI shim that
downloaded the Node build would only confuse installs — one registry, npm.

## Name

`jcode` is taken on npm. The package is `@sivab193/jcode` (scoped to the
author, available as of Nov 18, 2026) and the installed binary is still
`jcode`:

```sh
npm install -g @sivab193/jcode   # installs the `jcode` command
npx -y @sivab193/jcode           # run without installing
```

The alternative is the unscoped `jcode-cli` (also available). Switching is
one line in `package.json` (`"name"`) plus the README install commands.

## First publish (manual, once)

1. Create an npm account (npmjs.com) with 2FA enabled, and an org-free
   scope: the `@sivab193` scope belongs to the `sivab193` username, so the
   account must be that username.
2. `npm login` on the machine doing the publish.
3. From the repo root: `npm test` (must be green), then `npm publish
   --access public`. The `--access public` is required for a scoped package;
   `publishConfig.access` in `package.json` already sets it, so plain
   `npm publish` works too.
4. Verify from a clean machine: `npx -y @sivab193/jcode status` should print
   the backend table without cloning the repo.

## Releases after that (automated)

Push a tag and the release workflow publishes it:

```sh
npm version patch   # or minor / major — bumps package.json, tags v0.1.1
git push origin main --tags
```

`.github/workflows/release.yml` runs on tags matching `v*`: it runs the
tests, builds, and publishes with npm provenance
(`--provenance`, tying the tarball to the GitHub run). It needs one repo
secret: `NODE_AUTH_TOKEN` — an npm automation token (npmjs.com > Access
Tokens > Granular, scoped to `@sivab193/jcode`, or classic with publish
rights). Without the secret the workflow fails at the publish step and
nothing ships, which is the safe failure.

## What ships in the tarball

`files` in `package.json`: `dist/` (compiled JS), `prompts/` (the prompt
pack — the dispatcher resolves it relative to `dist/core/`, so it must
ship), `README.md`, `LICENSE`. Everything else (tests, docs, CI config)
stays out. Check any time with `npm pack --dry-run`.

## Versioning

SemVer. `0.x` while the CLI surface is still settling; `1.0.0` when the
host smoke tests pass and the TUI + `run` + `learn` commands are stable.
Breaking changes to `~/.jcode` state files (ledger, quota, sessions) count
as breaking and bump the minor while in `0.x`.
