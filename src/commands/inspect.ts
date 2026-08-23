import { printAccountTable } from "../lib/format.js";
import { grokVersion } from "../grok/spawn.js";
import { withActiveFlags } from "../store.js";
import { enrichAccountsWithUsage } from "../grok/account-usage.js";
import type { CliContext } from "../context.js";

export async function listCommand(ctx: CliContext): Promise<void> {
  const { a, r } = await ctx.store.sync(true);
  const accounts = withActiveFlags(a, r);
  const active = (accounts.find((item) => item.active) as any)?.id;
  const listed = ctx.hasFlag("--no-usage")
    ? accounts
    : await enrichAccountsWithUsage(ctx, accounts);
  if (!ctx.jsonMode) {
    printAccountTable(ctx, listed, active);
    return;
  }
  ctx.out({ success: true, active, accounts: listed });
}

export async function currentCommand(ctx: CliContext): Promise<void> {
  const { a, r } = await ctx.store.sync();
  const accounts = withActiveFlags(a, r);
  if (!ctx.jsonMode) {
    const account: any = accounts.find((item) => item.active);
    if (!account)
      return ctx.fail("NO_ACTIVE_ACCOUNT", "No active Grok account was found.");
    console.log(
      ctx.color(
        "1;36",
        `Active account: ${account.email || account.displayName || account.id}`,
      ),
    );
    console.log(
      `Auth mode: ${ctx.color("33", String(account.authMode || "-").toUpperCase())}`,
    );
    console.log(
      `Status: ${ctx.color(account.status === "VALID" ? "32" : "31", String(account.status || "UNKNOWN").toLowerCase())}`,
    );
    return;
  }
  ctx.out({
    success: true,
    active: accounts.find((item) => item.active) || null,
    grokCli: await grokVersion(),
    authFile: ctx.paths.authFile,
    registry: "synchronized",
  });
}

export async function statusCommand(ctx: CliContext): Promise<void> {
  const { a, r } = await ctx.store.sync();
  const accounts = withActiveFlags(a, r);
  ctx.out({
    success: true,
    active: accounts.find((item) => item.active) || null,
    grokCli: await grokVersion(),
    authFile: ctx.paths.authFile,
    registry: "synchronized",
  });
}
