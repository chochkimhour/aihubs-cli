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
  const registryEntry = (await ctx.store.registry()).find(
    (item) => item.id === id,
  );
  return new ProviderUsageProvider({
    cacheDir: ctx.paths.usageCacheDir,
    cacheTtlMs: await usageCacheTtlMs(ctx.paths),
    providerVersion: await providerVersion(),
  }).get(id, snap.entry, force, registryEntry?.provider);
}

export async function enrichAccountsWithUsage(
  ctx: CliContext,
  accounts: Json[],
) {
  const [cacheTtlMs, version, registry] = await Promise.all([
    usageCacheTtlMs(ctx.paths),
    providerVersion(),
    ctx.store.registry(),
  ]);
  const provider = new ProviderUsageProvider({
    cacheDir: ctx.paths.usageCacheDir,
    cacheTtlMs,
    providerVersion: version,
  });
  return Promise.all(
    accounts.map(async (account) => {
      // Google-account Agy/Gemini CLI quota is exposed by the provider's
      // interactive `/stats` command, not by a supported account billing API.
      // Do not send these entries through the generic provider endpoint and
      // mislabel the result as an authentication error.
      if (account.provider === "agy")
        return { ...account, usageState: "unavailable" };
      try {
        const snap = await ctx.store.readSnapshot(account.id);
        if (!snap?.entry)
          throw new ProviderUsageError(
            "auth",
            "The selected Provider authentication is no longer valid.",
          );
        const registryEntry = registry.find((item) => item.id === account.id);
        const usage = await provider.get(
          account.id,
          snap.entry,
          false,
          registryEntry?.provider,
        );
        return { ...account, ...usage };
      } catch (error) {
        const usageError =
          error instanceof ProviderUsageError ? error : undefined;
        const errorStatus = usageError
          ? usageError.statusCode === 401
            ? "auth expired"
            : usageError.statusCode === 403
              ? "access denied"
              : usageError.statusCode === 429
                ? "rate limited"
                : usageError.kind === "unavailable"
                  ? "unavailable"
                  : usageError.kind
          : "unknown";
        return {
          ...account,
          usageState: "unknown",
          errorStatus,
        };
      }
    }),
  );
}
