import { VERSION } from "../constants.js";
import type { CliContext } from "../context.js";

export function printHelp(ctx: CliContext): void {
  console.log(ctx.color("1;36", "\ngrok-cli — Grok account manager\n"));
  console.log(ctx.color("1;33", "USAGE"));
  console.log("  grok-cli <command> [options]\n");
  console.log(ctx.color("1;33", "ACCOUNT COMMANDS"));
  console.log("  list                         List saved Grok accounts");
  console.log(
    "  list --no-usage              List accounts without billing requests",
  );
  console.log(
    "  usage                        Show active account Grok credits",
  );
  console.log("  current                      Show the active account");
  console.log(
    "  status                       Show authentication and CLI status",
  );
  console.log(
    "  login [--device-auth]        Sign in through the official Grok CLI",
  );
  console.log("  switch <number|id|email|alias> Switch the active account");
  console.log("  resume [session-id|title]    Resume a Grok session");
  console.log("  session                      List available sessions");
  console.log("  move <account> <top|bottom>  Move an account in the list");
  console.log("  remove <number|email|alias>  Remove a saved account");
  console.log("  alias set <account> <alias>  Assign an account alias");
  console.log("  alias clear <account>        Remove an account alias\n");
  console.log("  reset set <account> <time>   Set a known account reset time");
  console.log("  reset clear <account>        Clear a saved reset time\n");
  console.log(ctx.color("1;33", "DATA COMMANDS"));
  console.log("  export <file>                Export account metadata");
  console.log("  export <file> --include-credentials");
  console.log(
    "                               Export sensitive credentials explicitly",
  );
  console.log(
    "  import <file>                Import a validated account export",
  );
  console.log("  clean                        Preview cleanup actions");
  console.log(
    "  clean --backups --yes       Remove saved authentication backups",
  );
  console.log("  repair                       Check registry consistency");
  console.log("  config                       Show configuration information");
  console.log(
    "  config set usage-cache-ttl <seconds>  Set list usage cache TTL",
  );
  console.log(
    "  watch                        Watch for auth file changes (Ctrl-C to stop)\n",
  );
  console.log(ctx.color("1;33", "OPTIONS"));
  console.log("  --json                       Output machine-readable JSON");
  console.log("  --yes                        Confirm destructive operations");
  console.log("  --no-color                   Disable terminal colors");
  console.log("  --version                    Show the version");
  console.log("  --help                       Show this help\n");
}

export function printWelcome(ctx: CliContext): void {
  console.log(
    ctx.color(
      "1;36",
      `
   ██████╗ ██████╗  ██████╗ ██╗  ██╗      ██████╗██╗     ██╗
  ██╔════╝ ██╔══██╗██╔═══██╗██║ ██╔╝     ██╔════╝██║     ██║
  ██║  ███╗██████╔╝██║   ██║█████╔╝█████╗██║     ██║     ██║
  ██║   ██║██╔══██╗██║   ██║██╔═██╗ ╚════╝██║     ██║     ██║
  ╚██████╔╝██║  ██║╚██████╔╝██║  ██╗     ╚██████╗███████╗██║
   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝      ╚═════╝╚══════╝╚═╝
`,
    ),
  );
  console.log(ctx.color("1;32", `  Welcome to grok-cli v${VERSION}`));
  console.log(
    "  A simple local manager for your Grok accounts and sessions.\n",
  );
  console.log(ctx.color("1;33", "  GET STARTED"));
  console.log("  grok-cli login                 Sign in and save an account");
  console.log("  grok-cli list                  View your saved accounts");
  console.log("  grok-cli switch <account>      Change the active account");
  console.log("  grok-cli status                Check authentication status\n");
  console.log(
    ctx.color("1;90", "  Run grok-cli --help for all commands and options."),
  );
}
