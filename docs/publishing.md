# Publishing jcode to npm

jcode is TypeScript on Node, so npm is its home. There is no PyPI package:
PyPI is for Python, and jcode has no Python in it. A PyPI shim that
downloaded the Node build would only confuse installs — one registry, npm.

## Name

`jcode` is taken on npm by an unrelated package. The repository and local
package metadata remain `jcode` to match the product specification, so npm
publishing is intentionally disabled until the owner chooses a registry name
or obtains the existing name. Do not silently rename the product.

```sh
npm install
npm run build
npm link               # installs the local `jcode` command
```

Other names checked free on Nov 18, 2026: `jcode-cli`, `s19code`, `s19c`.
Switching is one line in `package.json` (`"name"`) plus the README install
commands.

## First publish (manual, once)

1. Choose and approve an available npm name (or obtain `jcode`).
2. Create an npm account (npmjs.com) with 2FA enabled.
3. `npm login` on the machine doing the publish.
4. From the repo root: `npm test` (must be green), then `npm publish`.
   Unscoped packages are public by default; `publishConfig.access` in
   `package.json` already sets it explicitly.
5. Verify from a clean machine using the approved package name; `jcode status` should print
   the backend table without cloning the repo.

## Releases after name approval

The release workflow is manual-only until an npm name is approved. After that
decision, update `package.json`, restore a reviewed tag trigger if desired, and
then create a version tag:

```sh
npm version patch   # or minor / major — bumps package.json, tags v0.1.1
git push origin main --tags
```

`.github/workflows/release.yml` currently requires manual dispatch. It runs the
tests, builds, and publishes with npm provenance
(`--provenance`, tying the tarball to the GitHub run). It needs one repo
secret: `NODE_AUTH_TOKEN` — an npm automation token (npmjs.com > Access
Tokens > Granular, scoped to the approved package name, or classic with publish
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
