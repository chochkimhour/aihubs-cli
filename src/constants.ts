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
export function providerNotFoundMessage(command: string): string {
  const name = command.replace(/\.cmd$/i, "");
  const install =
    name === "grok"
      ? "Install xAI Grok CLI from https://x.ai/cli, then reopen PowerShell."
      : name === "gemini"
        ? "Install Gemini CLI with 'npm install -g @google/gemini-cli', then reopen PowerShell."
        : `Install '${name}' CLI, then reopen PowerShell.`;
  return `Provider CLI '${command}' was not found in PATH. ${install} Verify it with '${command} --version'.`;
}
// Override this during local development to point at a mock or installed provider CLI.
export const PROVIDER_COMMAND =
  process.env.AIHUBS_PROVIDER_COMMAND ||
  (process.platform === "win32" ? "codex.cmd" : "codex");

export const PROVIDER_COMMANDS: Record<string, string> = {
  codex: process.platform === "win32" ? "codex.cmd" : "codex",
  grok: process.platform === "win32" ? "grok.exe" : "grok",
  gemini: process.platform === "win32" ? "gemini.cmd" : "gemini",
  freebuff: process.platform === "win32" ? "freebuff.cmd" : "freebuff",
  claude: process.platform === "win32" ? "claude.cmd" : "claude",
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
