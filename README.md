# aihubs-cli

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![npm](https://img.shields.io/badge/npm-package-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/aihubs-cli)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI-2088FF?logo=github-actions&logoColor=white)](https://github.com/chochkimhour/aihubs-cli/actions)
[![Multi-Provider](https://img.shields.io/badge/AI_Providers-Multi--Provider-111827)](https://github.com/chochkimhour/aihubs-cli)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

`aihubs-cli` is a local multi-account manager for supported AI CLI providers.
It stores account metadata locally, switches authentication files, and displays
available usage information without printing credentials.

Supported providers:

- `codex`
- `grok`
- `gemini`
- `freebuff`
- `claude`

## Install

Requirements: Node.js 20+, the CLI for the provider you want to use, and
Windows, macOS, or Linux.

```powershell
npm install -g aihubs-cli
aihubs-cli --help
```

The selected provider CLI must be installed and available on `PATH`.

## Welcome screen

Running the command without arguments shows the quick-start screen for the current version:

```text
PS C:\Users\YourName> aihubs-cli

    █████╗ ██╗██╗  ██╗██╗   ██╗██████╗ ███████╗
   ██╔══██╗██║██║  ██║██║   ██║██╔══██╗██╔════╝
   ███████║██║███████║██║   ██║██████╔╝███████║
   ██╔══██║██║██╔══██║██║   ██║██╔══██╗╚════██║
   ██║  ██║██║██║  ██║╚██████╔╝██║  ██║███████║
   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
                 ──  C L I  ──

  Welcome to aihubs-cli v0.0.0
  A simple local manager for your AI provider accounts and sessions.

  GET STARTED
  aihubs-cli login             Sign in and save an account
  aihubs-cli list              View your saved accounts
  aihubs-cli switch <account>  Change the active account
  aihubs-cli status            Check authentication status

  Run aihubs-cli --help for all commands and options.
```

## Common commands

```powershell
# Sign in
aihubs-cli login codex
aihubs-cli login grok
aihubs-cli login gemini
aihubs-cli login freebuff
aihubs-cli login claude

# List accounts
aihubs-cli list
aihubs-cli list codex
aihubs-cli list grok
aihubs-cli usage codex
aihubs-cli usage grok
aihubs-cli session codex
aihubs-cli resume grok <session-id-or-title>
aihubs-cli continue codex <session-id-or-title>
aihubs-cli continue grok <session-id-or-title>
aihubs-cli current codex

# Inspect and switch accounts
aihubs-cli current
aihubs-cli status
aihubs-cli doctor
aihubs-cli switch codex 01
aihubs-cli switch grok user@example.com
aihubs-cli switch 02

# Manage accounts
aihubs-cli alias set 01 personal
aihubs-cli alias clear personal
aihubs-cli remove 01 02 --yes
aihubs-cli export accounts.json
aihubs-cli import accounts.json
```

Account selectors can be row numbers, account IDs, email addresses, or aliases.
Provider-specific forms are supported for `list`, `usage`, `session`, `resume`,
`current`, and `switch`. `status` always shows all providers. Without a
provider, other commands use the configured default provider. Use
`aihubs-cli --help` for the complete command list.

## Account list

The human-readable list includes the row ID, provider, plan, token usage, reset
date, and last activity:

```text
 ID   PROVIDER    ACCOUNT                         PLAN      TOKEN USAGE    RESET AT         LAST ACTIVITY
-------------------------------------------------------------------------------------------------------------------------
  01 codex       account@example.com             Go        9%             Sep 22, 2026      Aug 24, 2026
  02 codex       another@example.com             Free      Auth expired    -                Aug 23, 2026
```

For Codex accounts, usage is retrieved independently for every account from the
authenticated Codex backend. The CLI reads the primary and secondary rate-limit
windows and treats server-provided reset timestamps as authoritative.

Codex accounts are discovered from the active auth file and the per-account
files in:

```text
~/.codex/accounts/*.auth.json
```

On Windows, `~` means the current user profile directory. `Auth expired`,
`Access denied`, `Rate limited`, and `Unknown` are status messages, not usage
percentages. Missing usage is displayed as `-`.

## Provider login

Login delegates to the selected provider CLI:

```powershell
aihubs-cli login <provider>
```

Freebuff login URLs open automatically in the default browser. Other providers
use their own installed CLI login flow.

## JSON output

Use `--json` for scripts and integrations:

```powershell
aihubs-cli --json list
aihubs-cli --json list codex
aihubs-cli --json status
aihubs-cli --json doctor
```

`doctor` checks installed provider CLIs, saved account counts, and basic
authentication metadata. Use `--no-update-check` to skip the daily npm update
notification for a command, for example: `aihubs-cli --no-update-check list`.

Normal JSON output redacts access tokens, refresh tokens, API keys, cookies,
authorization headers, and other sensitive values. Credential export requires
both explicit flags:

```powershell
aihubs-cli export accounts.json --include-credentials --confirm-sensitive-export
```

## Storage

The manager stores registry metadata, protected account snapshots, usage cache,
and backups in:

```text
~/.provider-auth
```

Provider authentication remains in the provider's own home. Override locations
when needed:

```powershell
$env:PROVIDER_HOME = "D:\\path\\to\\provider-home"
$env:PROVIDER_AUTH_HOME = "D:\\path\\to\\aihubs-auth"
```

Never commit authentication files, exports, backups, or tokens. See
[SECURITY.md](SECURITY.md).

## Development

```powershell
npm install
npm run build
npm test
```

TypeScript source is under `src/`, tests are under `test/`, and compiled files
are written to `dist/`.

## Troubleshooting

Verify the provider CLI is installed and available on `PATH`:

```powershell
codex --version
grok --version
gemini --version
freebuff --version
claude --version
```

If a Codex account displays `401`, authenticate that account again:

```powershell
aihubs-cli login codex
```

When developing locally, run the local build directly:

```powershell
node .\\dist\\cli.js list
```

## License

Copyright © 2026. MIT License; see [LICENSE](LICENSE).
