import { ProviderUsageError } from "../providers/usage-provider.js";
import { formatResetAt } from "../lib/format.js";
import { findActiveFromAuth, lastActiveAccount } from "../store.js";
import { usageForAccount } from "../providers/account-usage.js";
import { switchAccount } from "./accounts.js";
import type { CliContext } from "../context.js";

export async function usageCommand(ctx: CliContext): Promise<void> {
  const { a, r } = await ctx.store.sync(true);
  const account = findActiveFromAuth(a, r) || lastActiveAccount(r);
  if (!account)
    return ctx.fail("NO_ACTIVE_ACCOUNT", "No active Provider account was found.");
  let usage;
  try {
    usage = await usageForAccount(ctx, account.id, true);
  } catch (error) {
    if (error instanceof ProviderUsageError) {
      if (ctx.jsonMode)
        return ctx.fail(
          error.kind === "auth" ? "AUTH_INVALID" : "BILLING_UNAVAILABLE",
          error.message,
        );
      if (error.kind === "auth") {
        console.error(
          "✗ Unable to fetch provider usage.\n\nThe selected Provider authentication is no longer valid.\nRun:\n\naihubs-cli login",
        );
      } else if (error.kind === "unsupported")
        console.error(
          "✗ Provider returned an unsupported billing response.\n\nNo account data was modified.",
        );
      else
        console.error(
          "✗ provider usage is currently unavailable.\n\nThe Provider billing service did not return usable usage data.",
        );
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  const payload = { id: account.id, email: account.email };
  if (ctx.jsonMode) return ctx.out({ success: true, account: payload, usage });
  const fmt = (value?: string) => (value ? formatResetAt(value) : "-");
  console.log("Provider Usage\n");
  console.log(`Account: ${account.email || account.id}`);
  console.log(`Plan: ${usage.subscriptionTier || "Unknown"}\n`);
  console.log("Credit Usage");
  const usedLabel =
    usage.usagePercent !== undefined
      ? `${usage.usagePercent}%`
      : usage.used !== undefined
        ? String(usage.used)
        : "Unknown";
  const remainingLabel =
    usage.usagePercent !== undefined
      ? `${Math.max(0, 100 - usage.usagePercent)}%`
      : usage.used !== undefined && usage.limit
        ? String(Math.max(0, usage.limit - usage.used))
        : usage.used !== undefined
          ? "No API limit"
          : "Unknown";
  console.log(`  Used:       ${usedLabel}`);
  console.log(`  Remaining:  ${remainingLabel}\n`);
  console.log("Current Period");
  console.log(`  Start:      ${fmt(usage.periodStart)}`);
  console.log(`  Reset At:   ${fmt(usage.resetAt)}\n`);
  console.log("Source: Provider billing");
}

export async function autoSwitch(
  ctx: CliContext,
  silent = false,
): Promise<void> {
  const { a, r } = await ctx.store.sync();
  const active = findActiveFromAuth(a, r);
  if (!active)
    return ctx.fail("NO_ACTIVE_ACCOUNT", "No active Provider account was found.");
  let current;
  try {
    current = await usageForAccount(ctx, active.id);
  } catch {
    if (!silent)
      return ctx.out({
        success: true,
        switched: false,
        active: active.id,
        usageUnavailable: true,
      });
    return;
  }
  const currentExhausted =
    current.usagePercent !== undefined ? current.usagePercent >= 100 : false;
  if (current.usagePercent === undefined) {
    if (!silent)
      return ctx.out({
        success: true,
        switched: false,
        active: active.id,
        usageUnavailable: true,
      });
    return;
  }
  if (!currentExhausted) {
    if (!silent)
      return ctx.out({
        success: true,
        switched: false,
        active: active.id,
        ...current,
      });
    return;
  }
  for (const candidate of r.filter((item) => item.id !== active.id)) {
    const next = await usageForAccount(ctx, candidate.id);
    const available =
      next.usagePercent !== undefined ? next.usagePercent < 100 : false;
    if (available) {
      await switchAccount(ctx, candidate.id);
      if (!silent)
        return ctx.out({
          success: true,
          switched: true,
          previous: active.id,
          active: candidate.id,
          ...current,
        });
      return;
    }
  }
  return ctx.fail(
    "NO_AVAILABLE_ACCOUNT",
    "The active account is exhausted and no other account has available usage.",
  );
}
