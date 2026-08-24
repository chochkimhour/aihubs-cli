import {
  GLOBAL_FLAGS,
  PROVIDER_COMMAND,
  PROVIDER_COMMANDS,
} from "./constants.js";
import { failAndExit, colorize, printValue } from "./lib/output.js";
import { resolvePaths, type AppPaths } from "./paths.js";
import { AccountStore } from "./store.js";

export interface CliContext {
  rawArgs: string[];
  positional: string[];
  jsonMode: boolean;
  yes: boolean;
  colorEnabled: boolean;
  paths: AppPaths;
  providerCommand: string;
  store: AccountStore;
  hasFlag(name: string): boolean;
  commandArgs(): string[];
  color(code: string, value: string): string;
  out(value: unknown): void;
  fail(code: string, message: string): never;
}

export function createContext(
  argv: string[] = process.argv.slice(2),
): CliContext {
  const jsonMode = argv.includes("--json");
  const yes = argv.includes("--yes");
  const colorEnabled =
    !jsonMode &&
    !argv.includes("--no-color") &&
    !process.env.NO_COLOR &&
    Boolean(process.stdout.isTTY);
  const positional = argv.filter((a) => !a.startsWith("--"));
  let providerArg =
    positional[0] === "login" ||
    positional[0] === "list" ||
    positional[0] === "switch" ||
    positional[0] === "usage" ||
    positional[0] === "session" ||
    positional[0] === "resume" ||
    positional[0] === "continue" ||
    positional[0] === "current" ||
    positional[0] === "status"
      ? positional[1]?.toLowerCase()
      : undefined;
  if (positional[0] === "login" && !providerArg) providerArg = "freebuff";
  if (positional[0] === "switch" && !PROVIDER_COMMANDS[providerArg || ""])
    providerArg = undefined;
  if (
    ["usage", "session", "resume", "continue", "current", "status"].includes(
      positional[0],
    ) &&
    providerArg &&
    !PROVIDER_COMMANDS[providerArg]
  )
    providerArg = undefined;
  const paths = resolvePaths(providerArg);
  const color = (code: string, value: string) =>
    colorize(colorEnabled, code, value);

  const ctx: CliContext = {
    rawArgs: argv,
    positional,
    jsonMode,
    yes,
    colorEnabled,
    paths,
    providerCommand: PROVIDER_COMMAND,
    store: undefined as unknown as AccountStore,
    hasFlag: (name) => argv.includes(name),
    commandArgs: () => {
      const cmd = positional[0];
      const start = cmd ? argv.findIndex((arg) => arg === cmd) : -1;
      if (start < 0) return [];
      return argv.slice(start + 1).filter((arg) => !GLOBAL_FLAGS.has(arg));
    },
    color,
    out: (value) => printValue(jsonMode, value),
    fail: (code, message) => failAndExit(jsonMode, color, code, message),
  };
  ctx.store = new AccountStore(paths);
  return ctx;
}
