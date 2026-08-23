import {
  ProviderUsageError,
  ProviderUsageProvider,
  type ProviderUsage,
} from "./usage-provider.js";
import { providerVersion } from "./spawn.js";
import type { CliContext } from "../context.js";
import { usageCacheTtlMs } from "../store.js";
import type { Json } from "../types.js";

export async function usageForAccount(
  ctx: CliContext,
  id: string,
  force = false,
): Promise<ProviderUsage> {
  const snap = await ctx.store.readSnapshot(id);
  if (!snap?.entry)
    throw new ProviderUsageError(
      "auth",
      "The selected Provider authentication is no longer valid.",
    );
  return new ProviderUsageProvider({
    cacheDir: ctx.paths.usageCacheDir,
    cacheTtlMs: await usageCacheTtlMs(ctx.paths),
    providerVersion: await providerVersion(),
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
