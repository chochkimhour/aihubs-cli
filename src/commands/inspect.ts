import { printAccountTable } from "../lib/format.js";
import { providerVersion } from "../providers/spawn.js";
import { withActiveFlags } from "../store.js";
import { enrichAccountsWithUsage } from "../providers/account-usage.js";
import type { CliContext } from "../context.js";
import { PROVIDER_COMMANDS } from "../constants.js";
import { resolvePaths } from "../paths.js";
import { AccountStore } from "../store.js";

export async function listCommand(ctx: CliContext): Promise<void> {
  const requestedProvider = ctx.commandArgs()[0]?.toLowerCase();
  const providers = requestedProvider
    ? [requestedProvider]
    : process.env.PROVIDER_HOME
      ? ["default"]
      : Object.keys(PROVIDER_COMMANDS);
  if (requestedProvider && !PROVIDER_COMMANDS[requestedProvider])
    return ctx.fail(
      "UNKNOWN_PROVIDER",
      `Unknown provider '${requestedProvider}'. Supported providers: ${providers.join(", ")}.`,
    );
  const snapshots = [];
  for (const provider of providers) {
    const store = new AccountStore(resolvePaths(provider));
    const snapshot = await store.sync(true, provider);
    snapshots.push(snapshot);
  }
  const r = await ctx.store.registry();
  const activeIds = new Set(
    snapshots.flatMap(({ a, r: registry }) =>
      withActiveFlags(a, registry)
        .filter((item) => item.active)
        .map((item: any) => item.id),
    ),
  );
  const accounts = r
    .filter((item) => providers.includes(item.provider))
    .map((item) => ({ ...item, active: activeIds.has(item.id) }));
  const active = (accounts.find((item: any) => item.active) as any)?.id;
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
  const provider = ctx.commandArgs()[0]?.toLowerCase();
  const { a, r } = await ctx.store.sync(true, provider || "default");
  const accounts = withActiveFlags(a, r);
  if (!ctx.jsonMode) {
    const account: any = accounts.find((item) => item.active);
    if (!account)
      return ctx.fail(
        "NO_ACTIVE_ACCOUNT",
        "No active Provider account was found.",
      );
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
    providerCli: await providerVersion(),
    authFile: ctx.paths.authFile,
    registry: "synchronized",
  });
}

export async function statusCommand(ctx: CliContext): Promise<void> {
  const provider = ctx.commandArgs()[0]?.toLowerCase();
  const { a, r } = await ctx.store.sync(true, provider || "default");
  const accounts = withActiveFlags(a, r);
  ctx.out({
    success: true,
    active: accounts.find((item) => item.active) || null,
    providerCli: await providerVersion(),
    authFile: ctx.paths.authFile,
    registry: "synchronized",
  });
}
