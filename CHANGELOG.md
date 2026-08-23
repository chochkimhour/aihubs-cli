# Changelog

## Unreleased

Split the CLI from a single `src/cli.ts` into a standard TypeScript layout: thin entrypoint, command modules, account store, and Grok integration helpers. Login flags such as `--device-auth` are now forwarded to the official Grok CLI. Version output is read from `package.json`.

## 1.0.0

Initial stable local Grok account manager release.
