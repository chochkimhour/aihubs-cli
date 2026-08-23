# vibecode-cli

`vibecode-cli` v1.2.0 is a local multi-account manager for AI CLI providers. The current provider integration is the official configured provider CLI; provider-specific integrations live under `src/providers/` so additional providers can be added without treating provider as the application itself.

It supports account listing, switching, aliases, import/export, status, usage, sessions, and safe multi-account removal. It does not provide universal login: each AI provider has its own authentication and usage APIs.

## Install

Requirements: Node.js 20+, the configured provider CLI, and Windows, macOS, or Linux.

```powershell
npm i vibecode-cli
npx --no-install vibecode-cli --help
```

For global use:

```powershell
npm i -g vibecode-cli
vibecode-cli --help
provider --version
```

## Commands

```powershell
vibecode-cli list
vibecode-cli current
vibecode-cli status
vibecode-cli login
vibecode-cli login --device-auth
vibecode-cli switch 1
vibecode-cli session
vibecode-cli resume <session-id-or-title>
vibecode-cli move 2 top
vibecode-cli alias set 1 personal
vibecode-cli reset set 1 2026-08-29T07:00:00+07:00
vibecode-cli remove 1 --yes
vibecode-cli clean
vibecode-cli clean --backups --yes
vibecode-cli repair
vibecode-cli config
vibecode-cli watch
```

Accounts accept a row number, ID, email, or alias. Remove multiple accounts with spaces or commas:

```powershell
vibecode-cli remove 01 02 03 --yes
vibecode-cli remove 01,02,03 --yes
vibecode-cli remove personal other@example.com --yes
```

`--yes` is required. All selectors are validated before deletion; duplicate selectors are ignored.

## Import, export, and JSON

```powershell
vibecode-cli export accounts.json
vibecode-cli export accounts.json --include-credentials --confirm-sensitive-export
vibecode-cli import accounts.json
vibecode-cli --json list
vibecode-cli status --json
```

Metadata-only export is the default. Credential export contains sensitive authentication data. Normal JSON output never includes tokens, API keys, cookies, or authorization headers.

## Provider support

The current provider is supported. `vibecode-cli login` delegates authentication to the installed official `provider` CLI. OpenAI, Claude, Gemini, Kiro, and other services require separate adapters for their supported login, account, status, and usage interfaces; no safe universal login exists for every provider.

## Storage and security

Provider credentials remain in the configured provider home. Manager metadata and protected snapshots are stored in the configured manager home. Set the provider and manager home environment variables to customize these locations. Never commit credentials, exports, or backups; see [SECURITY.md](SECURITY.md).

Usage percentages are shown only when provider billing provides a real positive limit. `NO API LIMIT` means no monthly API limit is available, and `UNAVAILABLE` means billing could not be queried.

## Development

```powershell
npm install
npm run build
npm test
```

Source is organized into `src/commands/`, `src/store.ts`, `src/providers/`, and `src/lib/`. GitHub Actions validates pushes and pull requests; tags matching `v*.*.*` publish to npm.

## Troubleshooting

Confirm `provider --version` works, then run `vibecode-cli login`. If `provider` is not found, add it to `PATH` and open a new terminal. Use `vibecode-cli repair` after manually editing authentication files.

Uninstall with `npm uninstall vibecode-cli` or `npm uninstall -g vibecode-cli`.

## License

Copyright © 2026. MIT License; see [LICENSE](LICENSE).
