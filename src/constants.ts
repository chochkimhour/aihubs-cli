import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const VERSION = readPackageVersion();
export const SENSITIVE_KEY =
  /key|token|cookie|authorization|secret|password|api[_-]?key/i;
export const DEFAULT_USAGE_CACHE_TTL_MS = 45_000;
export const PROVIDER_NOT_FOUND =
  "Provider CLI was not found. Install provider and ensure `provider` is in PATH.";
// Override this during local development to point at a mock or installed provider CLI.
export const PROVIDER_COMMAND =
  process.env.AIHUBS_PROVIDER_COMMAND ||
  (process.platform === "win32" ? "provider.exe" : "provider");

export const PROVIDER_COMMANDS: Record<string, string> = {
  codex: process.platform === "win32" ? "codex.cmd" : "codex",
  grok: process.platform === "win32" ? "grok.cmd" : "grok",
  kiro: process.platform === "win32" ? "kiro-cli.cmd" : "kiro-cli",
  opencode: process.platform === "win32" ? "opencode.cmd" : "opencode",
  claudecode: process.platform === "win32" ? "claude.cmd" : "claude",
  freebuff: process.platform === "win32" ? "freebuff.cmd" : "freebuff",
  deepseek: process.platform === "win32" ? "deepseek.cmd" : "deepseek",
  gemini: process.platform === "win32" ? "gemini.cmd" : "gemini",
  openrouter: process.platform === "win32" ? "openrouter.cmd" : "openrouter",
};

export const GLOBAL_FLAGS = new Set([
  "--json",
  "--yes",
  "--no-color",
  "--help",
  "--version",
  "--no-usage",
  "--include-credentials",
  "--confirm-sensitive-export",
  "--backups",
  "-h",
  "-v",
]);
