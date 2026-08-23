# Changelog

## Unreleased

Added provider labels to saved accounts and provider filtering with `list <provider>`. Help and README examples now document provider-specific login and list commands.

Added multi-account removal: `remove` accepts multiple row numbers, IDs, emails, or aliases separated by spaces or commas. The command validates every selector before changing account data and requires `--yes` confirmation. Usage listing now merges provider `/billing` used counts with the weekly credits reset period.

Split the CLI from a single `src/cli.ts` into a standard TypeScript layout: thin entrypoint, command modules, account store, and provider integration helpers. Login flags such as `--device-auth` are now forwarded to the configured provider CLI. Version output is read from `package.json`.

## 1.2.0

Renamed the package and command to `aihubs-cli` and prepared the project for provider-specific AI integrations.

## 1.0.0

Initial stable local provider account manager release.
