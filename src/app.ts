import { VERSION } from "./constants.js";
import { createContext, type CliContext } from "./context.js";
import {
  aliasCommand,
  moveCommand,
  removeCommand,
  resetCommand,
  switchCommand,
} from "./commands/accounts.js";
import { loginCommand } from "./commands/auth.js";
import {
  cleanCommand,
  configCommand,
  exportCommand,
  importCommand,
  repairCommand,
  watchCommand,
} from "./commands/data.js";
import { printHelp, printWelcome } from "./commands/help.js";
import {
  currentCommand,
  listCommand,
  statusCommand,
} from "./commands/inspect.js";
import { continueCommand, sessionCommand } from "./commands/sessions.js";
import { doctorCommand } from "./commands/doctor.js";
import { checkForUpdate } from "./update-check.js";

type CommandHandler = (ctx: CliContext) => Promise<void> | void;

const commands: Record<string, CommandHandler> = {
  login: loginCommand,
  list: listCommand,
  current: currentCommand,
  status: statusCommand,
  switch: switchCommand,
  continue: continueCommand,
  session: sessionCommand,
  codex: (ctx) => continueCommand(ctx, "codex"),
  grok: (ctx) => continueCommand(ctx, "grok"),
  agy: (ctx) => continueCommand(ctx, "agy"),
  claude: (ctx) => continueCommand(ctx, "claude"),
  freebuff: (ctx) => continueCommand(ctx, "freebuff"),
  move: moveCommand,
  alias: aliasCommand,
  reset: resetCommand,
  remove: removeCommand,
  export: exportCommand,
  import: importCommand,
  clean: cleanCommand,
  repair: repairCommand,
  config: configCommand,
  watch: watchCommand,
  doctor: doctorCommand,
  help: printHelp,
};

export async function dispatch(ctx: CliContext): Promise<void> {
  const hasCommand = ctx.positional.length > 0;
  const cmd = ctx.positional[0] || "help";
  if (ctx.hasFlag("--help") || ctx.rawArgs.includes("-h"))
    return printHelp(ctx);
  if (ctx.hasFlag("--version") || ctx.rawArgs.includes("-v"))
    return ctx.out(`aihubs-cli ${VERSION}`);
  if (!hasCommand && !ctx.jsonMode) return printWelcome(ctx);
  const handler = commands[cmd];
  if (!handler) {
    const suggestion = closestCommand(cmd);
    ctx.fail(
      "UNKNOWN_COMMAND",
      `Unknown command '${cmd}'.${suggestion ? ` Did you mean '${suggestion}'?` : ""}`,
    );
  }
  await handler(ctx);
}

function closestCommand(input: string): string | undefined {
  const candidates = Object.keys(commands);
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(input.toLowerCase(), candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= Math.max(2, Math.floor(input.length / 2))
    ? best
    : undefined;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}

export async function run(ctx: CliContext = createContext()): Promise<void> {
  try {
    await checkForUpdate(ctx);
    await dispatch(ctx);
  } catch (e: any) {
    if (!e.silent) ctx.fail("OPERATION_FAILED", e.message);
  }
}
