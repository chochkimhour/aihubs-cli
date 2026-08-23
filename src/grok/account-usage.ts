import {
  GrokUsageError,
  GrokUsageProvider,
  type GrokUsage,
} from "./usage-provider.js";
import { grokVersion } from "./spawn.js";
import type { CliContext } from "../context.js";
import { usageCacheTtlMs } from "../store.js";
import type { Json } from "../types.js";

export async function usageForAccount(
  ctx: CliContext,
  id: string,
  force = false,
): Promise<GrokUsage> {
  const snap = await ctx.store.readSnapshot(id);
  if (!snap?.entry)
    throw new GrokUsageError(
      "auth",
      "The selected Grok authentication is no longer valid.",
    );
  return new GrokUsageProvider({
    cacheDir: ctx.paths.usageCacheDir,
    cacheTtlMs: await usageCacheTtlMs(ctx.paths),
    grokVersion: await grokVersion(),
  }).get(id, snap.entry, force);
}

export async function enrichAccountsWithUsage(
  ctx: CliContext,
  accounts: Json[],
) {
  return Promise.all(
    accounts.map(async (account) => {
      try {
        const usage = await usageForAccount(ctx, account.id);
        return { ...account, ...usage };
      } catch {
        return { ...account, usageState: "unknown" };
      }
    }),
  );
}
