import { PROVIDER_COMMANDS } from "../constants.js";
import type { CliContext } from "../context.js";
import { providerVersion } from "../providers/spawn.js";

export async function doctorCommand(ctx: CliContext): Promise<void> {
  const { r } = await ctx.store.sync(true, "default");
  const accounts = r.filter(
    (item) =>
      typeof item.provider === "string" && PROVIDER_COMMANDS[item.provider],
  );
  const providers = Object.keys(PROVIDER_COMMANDS);
  const cliVersions = Object.fromEntries(
    await Promise.all(
      providers.map(async (name) => [
        name,
        await providerVersion(PROVIDER_COMMANDS[name]),
      ]),
    ),
  );
  const accountsByProvider = Object.fromEntries(
    providers.map((name) => [
      name,
      accounts.filter((item) => item.provider === name).length,
    ]),
  );
  const authMetadata = accounts.map((account) => ({
    id: account.id,
    provider: account.provider,
    email: account.email || account.displayName || account.id,
    status: account.status || "UNKNOWN",
    authMode: account.authMode || null,
  }));
  const result = {
    success: true,
    providers: cliVersions,
    accountCount: accounts.length,
    accountsByProvider,
    authMetadata,
  };
  if (ctx.jsonMode) return ctx.out(result);
  console.log(ctx.color("1;38;5;208", "DOCTOR"));
  console.log(ctx.color("1;38;5;208", "Provider CLIs"));
  for (const name of providers)
    console.log(
      `  ${name.padEnd(10)} ${String(cliVersions[name]).replace(/\s*\([^)]*\)/g, "")}`,
    );
  console.log(`\nSaved accounts: ${accounts.length}`);
  console.log(ctx.color("1;38;5;208", "Accounts by provider"));
  for (const name of providers)
    console.log(`  ${name.padEnd(10)} ${accountsByProvider[name]}`);
  console.log(ctx.color("1;38;5;208", "\nAuthentication metadata"));
  for (const account of authMetadata)
    console.log(
      `  ${String(account.provider).padEnd(10)} ${String(account.email).padEnd(34)} ${String(account.status).toLowerCase()} ${account.authMode || "-"}`,
    );
}
