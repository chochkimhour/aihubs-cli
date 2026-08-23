import { runProvider } from "../providers/spawn.js";
import { autoSwitch } from "./usage.js";
import type { CliContext } from "../context.js";

export async function resumeCommand(ctx: CliContext): Promise<void> {
  const session = ctx.positional[1];
  await autoSwitch(ctx, true);
  const argv = session ? ["--resume", session] : ["--continue"];
  await runProvider(argv, (code) => `provider resume exited with code ${code}`);
}

export async function sessionCommand(ctx: CliContext): Promise<void> {
  const session = ctx.positional[1];
  if (session)
    return ctx.fail(
      "INVALID_OPTION",
      "Use 'session' to list sessions, then 'resume <session-id>' to continue one.",
    );
  await autoSwitch(ctx, true);
  await runProvider(
    ["sessions", "list"],
    (code) => `provider session list exited with code ${code}`,
  );
}
