# Publishing scode to npm

jcode is TypeScript on Node, so npm is its home. There is no PyPI package:
PyPI is for Python, and jcode has no Python in it. A PyPI shim that
downloaded the Node build would only confuse installs — one registry, npm.

## Name

`jcode` is taken on npm by an unrelated package. The package is `scode`; the
installed binary remains `jcode`:

```sh
npm install -g scode   # installs the `jcode` command
npx -y scode           # run without installing
```

## First publish (manual, once)

1. Create an npm account (npmjs.com) with 2FA enabled. Any username works;
   `scode` is unscoped.
2. `npm login` on the machine doing the publish.
3. From the repo root: `npm test` (must be green), then `npm publish`.
   Unscoped packages are public by default; `publishConfig.access` in
   `package.json` already sets it explicitly.
4. Verify from a clean machine: `npx -y scode status` should print the backend
   table without cloning the repo.

## Releases after that

Push a version tag and the release workflow publishes it:

```sh
npm version patch   # or minor / major — bumps package.json, tags v0.1.1
git push origin main --tags
```

`.github/workflows/release.yml` currently requires manual dispatch. It runs the
tests, builds, and publishes with npm provenance
(`--provenance`, tying the tarball to the GitHub run). It needs one repository
secret: `NODE_AUTH_TOKEN` — an npm automation token scoped to `scode`. Without
the secret the workflow fails at the publish step and nothing ships.

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
