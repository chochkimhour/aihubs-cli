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
import { resumeCommand, sessionCommand } from "./commands/sessions.js";
import { usageCommand } from "./commands/usage.js";
import { checkForUpdate } from "./update-check.js";

type CommandHandler = (ctx: CliContext) => Promise<void> | void;

const commands: Record<string, CommandHandler> = {
  login: loginCommand,
  usage: usageCommand,
  list: listCommand,
  current: currentCommand,
  status: statusCommand,
  switch: switchCommand,
  resume: resumeCommand,
  continue: resumeCommand,
  session: sessionCommand,
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
  if (!handler) ctx.fail("UNKNOWN_COMMAND", `Unknown command '${cmd}'.`);
  await handler(ctx);
}

export async function run(ctx: CliContext = createContext()): Promise<void> {
  try {
    await checkForUpdate(ctx);
    await dispatch(ctx);
  } catch (e: any) {
    if (!e.silent) ctx.fail("OPERATION_FAILED", e.message);
  }
}
