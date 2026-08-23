# aihubs-cli

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![npm](https://img.shields.io/badge/npm-package-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/aihubs-cli)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI-2088FF?logo=github-actions&logoColor=white)](https://github.com/chochkimhour/aihubs-cli/actions)
[![Multi-Provider](https://img.shields.io/badge/AI_Providers-Multi--Provider-111827)](https://github.com/chochkimhour/aihubs-cli)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

`aihubs-cli` is a local multi-account manager for AI CLI providers. The current provider integration is the official configured provider CLI; provider-specific integrations live under `src/providers/` so additional providers can be added without treating provider as the application itself.

It supports account listing, switching, aliases, import/export, status, usage, sessions, and safe multi-account removal. It does not provide universal login: each AI provider has its own authentication and usage APIs.

## Install

Requirements: Node.js 20+, the configured provider CLI, and Windows, macOS, or Linux.

```powershell
npm i aihubs-cli
npx --no-install aihubs-cli --help
```

For global use:

```powershell
npm i -g aihubs-cli
aihubs-cli --help
provider --version
```

## Commands

```powershell
aihubs-cli list
aihubs-cli list grok
aihubs-cli list codex
aihubs-cli current
aihubs-cli status
aihubs-cli switch codex 1
aihubs-cli switch grok email@example.com
aihubs-cli switch gemini personal
aihubs-cli login
aihubs-cli login codex
aihubs-cli login grok
aihubs-cli login kiro
aihubs-cli login opencode
aihubs-cli login claudecode
aihubs-cli login freebuff
aihubs-cli login deepseek
aihubs-cli login gemini
aihubs-cli login openrouter
aihubs-cli login --device-auth
aihubs-cli switch 1
aihubs-cli session
aihubs-cli resume <session-id-or-title>
aihubs-cli move 2 top
aihubs-cli alias set 1 personal
aihubs-cli reset set 1 2026-08-29T07:00:00+07:00
aihubs-cli remove 1 --yes
aihubs-cli clean
aihubs-cli clean --backups --yes
aihubs-cli repair
aihubs-cli config
aihubs-cli watch
```

Provider-aware switching works with all supported providers: `codex`, `grok`, `kiro`, `opencode`, `claudecode`, `freebuff`, `deepseek`, `gemini`, and `openrouter`.

Accounts accept a row number, ID, email, or alias. Remove multiple accounts with spaces or commas:

The account list includes a `PROVIDER` column. Filter it by provider when needed:

```powershell
aihubs-cli list grok
aihubs-cli list codex
aihubs-cli list gemini
```

```powershell
aihubs-cli remove 01 02 03 --yes
aihubs-cli remove 01,02,03 --yes
aihubs-cli remove personal other@example.com --yes
```

`--yes` is required. All selectors are validated before deletion; duplicate selectors are ignored.

## Import, export, and JSON

```powershell
aihubs-cli export accounts.json
aihubs-cli export accounts.json --include-credentials --confirm-sensitive-export
aihubs-cli import accounts.json
aihubs-cli --json list
aihubs-cli status --json
```

JSON account records also include the `provider` field.

Metadata-only export is the default. Credential export contains sensitive authentication data. Normal JSON output never includes tokens, API keys, cookies, or authorization headers.

## Provider support

`aihubs-cli login` delegates authentication to the selected installed CLI. Supported provider names are `codex`, `grok`, `kiro`, `opencode`, `claudecode`, `freebuff`, `deepseek`, `gemini`, and `openrouter`. `claudecode` uses the `claude` executable; the other names use matching executable names. With no provider argument, it uses the configured default provider CLI.

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

Confirm `provider --version` works, then run `aihubs-cli login`. If `provider` is not found, add it to `PATH` and open a new terminal. Use `aihubs-cli repair` after manually editing authentication files.

Uninstall with `npm uninstall aihubs-cli` or `npm uninstall -g aihubs-cli`.

## License

Copyright © 2026. MIT License; see [LICENSE](LICENSE).
