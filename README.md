# grok-cli

![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![CLI](https://img.shields.io/badge/CLI-Grok%20Build%20compatible-7C3AED)
![npm](https://img.shields.io/badge/npm-ready-CB3837?logo=npm&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

`grok-cli` **v1.0.0** is a local multi-account manager for the official Grok Build CLI. It preserves Grok's canonical `~/.grok/auth.json`, delegates login to `grok`, and provides account listing, switching, aliases, import/export, status inspection, and session discovery/resume.

The account list shows email, authentication status, when an account was last selected through this manager, API-usage availability, and reset date. Automatic account switching only acts when the billing service returns a real positive API limit and confirms that the active account is exhausted.

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
grok-cli session
grok-cli resume <session-id-or-title>
grok-cli move 2 top
grok-cli move user@example.com bottom
grok-cli alias set 1 personal
grok-cli alias clear personal
grok-cli reset set 1 2026-08-29T07:00:00+07:00
grok-cli reset clear 1
grok-cli remove 1 --yes
grok-cli clean
grok-cli clean --backups --yes
grok-cli repair
grok-cli config
grok-cli watch
```

Accounts can be selected by row number, ID, email, or alias. Use `move <account> top` or `move <account> bottom` to change the list order. Switching creates a backup before updating Grok's active authentication file. `session` lists available sessions; copy a session ID and pass it to `resume` to continue it.

## Import and export

```powershell
grok-cli export accounts.json
grok-cli export accounts.json --include-credentials --confirm-sensitive-export
grok-auth import accounts.json
```

Metadata-only export is the default. Credential export requires `--include-credentials --confirm-sensitive-export` and contains sensitive live authentication data.

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

Usage percentages and reset dates are shown only when the Grok billing service provides both the usage value and its real positive limit. `NO API LIMIT` means the account has no API monthly limit to convert into a percentage. `UNAVAILABLE` means the saved OIDC session cannot query billing. Grok Build free-plan/rate-limit allowances are not exposed by the official CLI or billing API. The `6.2K / 500K` value shown inside a Grok session is a session context window, not the account's plan quota, so it is not used as an account percentage.

Use `reset set <account> <ISO-time>` to save a reset time reported by an account dashboard when Grok does not expose it through billing. A live billing value always takes priority over the saved value.

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

Copyright © 2026.

This project is licensed under the MIT License. See [LICENSE](LICENSE).
