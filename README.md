# grok-cli

![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![CLI](https://img.shields.io/badge/CLI-Grok%20Build%20compatible-7C3AED)
![npm](https://img.shields.io/badge/npm-ready-CB3837?logo=npm&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

`grok-cli` **v1.0.0** is a local multi-account manager for the official Grok Build CLI. It preserves Grok's canonical `~/.grok/auth.json`, delegates login to `grok`, and provides account listing, switching, aliases, import/export, and status inspection.

It does not implement OAuth, replace Grok, use a backend, or collect telemetry.

## Install

Requirements: Node.js 20+, the official Grok CLI, and Windows, macOS, or Linux.

```powershell
npm install -g @chochkimhour/grok-cli
grok-cli --help
grok --version
```

Development install:

```powershell
npm install
npm run build
npm link
```

## Commands

```powershell
grok-cli list
grok-cli current
grok-cli status
grok-cli login
grok-cli login --device-auth
grok-cli switch 1
grok-cli switch user@example.com
grok-cli alias set 1 personal
grok-cli alias clear personal
grok-cli remove 1 --yes
grok-cli clean --yes
grok-cli repair
grok-cli config
grok-cli watch
```

Accounts can be selected by row number, ID, email, or alias. Switching creates a backup before updating Grok's active authentication file.

## Import and export

```powershell
grok-auth export accounts.json
grok-auth export accounts.json --include-credentials
grok-auth import accounts.json
```

Metadata-only export is the default. Credential export requires `--include-credentials` and contains sensitive live authentication data.

## JSON mode

```powershell
grok-cli --json list
grok-cli status --json
grok-cli repair --json
```

Normal JSON output never includes tokens, API keys, cookies, or authorization headers. Use `--no-color` to disable terminal colors.

## Storage and security

Grok's active credentials remain in `~/.grok/auth.json`. Manager metadata and protected snapshots are stored in `~/.grok-auth/`. Set `GROK_HOME` for a custom Grok home and `GROK_AUTH_HOME` for a custom manager directory.

Unknown fields are preserved. Grok owns token refresh; `grok-auth` never refreshes tokens itself. Never commit credentials, exports, backups, or `.grok-auth/` to source control. See [SECURITY.md](SECURITY.md).

## Compatibility

**Verified:** current official Grok Build CLI authentication using `~/.grok/auth.json`.

**Expected:** applications consuming the same Grok authentication state.

**Unverified:** third-party integrations with independent authentication stores.

Grok's local auth file does not currently provide Codex-style usage percentages or quota reset times, so this tool does not fabricate those values.

## Development and releases

```powershell
npm install
npm run build
npm test
```

GitHub Actions validates pushes and pull requests. Tags matching `v*.*.*` run the npm publish workflow. Configure the repository secret `NPM_TOKEN` before publishing.

## First run and troubleshooting

Install the official Grok CLI first and confirm that `grok --version` works. Then run `grok-cli login`. If `grok` is not found, add its installation directory to your PATH and open a new terminal. Run `grok-cli repair` after manually editing authentication files and review `grok-cli clean` before using `grok-cli clean --yes`.

The package works on Windows, macOS, and Linux with Node.js 20 or newer. Uninstall with `npm uninstall -g @chochkimhour/grok-cli`; local account data is retained unless you remove the manager directory yourself.

## License

MIT. See [LICENSE](LICENSE).
