import { exists } from "../lib/json.js";
import { findActiveFromAuth } from "../store.js";
import { runProvider } from "../providers/spawn.js";
import { PROVIDER_COMMANDS } from "../constants.js";
import type { CliContext } from "../context.js";

export async function loginCommand(ctx: CliContext): Promise<void> {
  const extra = ctx.commandArgs();
  const providerName =
    extra[0] && !extra[0].startsWith("--") ? extra[0].toLowerCase() : undefined;
  if (providerName && !PROVIDER_COMMANDS[providerName])
    ctx.fail(
      "UNKNOWN_PROVIDER",
      `Unknown provider '${extra[0]}'. Supported providers: ${Object.keys(PROVIDER_COMMANDS).join(", ")}.`,
    );
  const providerCommand = providerName
    ? PROVIDER_COMMANDS[providerName]
    : undefined;
  if (providerName && !providerCommand)
    ctx.fail(
      "UNKNOWN_PROVIDER",
      `Unknown provider '${extra[0]}'. Supported providers: ${Object.keys(PROVIDER_COMMANDS).join(", ")}.`,
    );
  if (await exists(ctx.paths.authFile))
    await ctx.store.sync(false, providerName || "default");
  const loginArgs = providerCommand ? extra.slice(1) : extra;
  const supported = loginArgs.length
    ? ["--device-auth", "--device-code", "--oauth"].includes(loginArgs[0])
    : true;
  if (!supported)
    ctx.fail("UNSUPPORTED_FLAG", `Unsupported login flag '${loginArgs[0]}'.`);
  await runProvider(
    ["login", ...loginArgs],
    (code) =>
      providerName === "gemini"
        ? `Gemini CLI login failed with exit code ${code}. Google ended personal-account Gemini CLI sign-in on June 18, 2026. Use a Gemini API key, an eligible enterprise account, or migrate to Antigravity: https://antigravity.google`
        : `Login through '${providerCommand || "the default provider CLI"}' failed with exit code ${code}. Verify the provider CLI is installed and try again.`,
    providerCommand,
  );
  const { a, r } = await ctx.store.sync(false, providerName || "default");
  const active = findActiveFromAuth(a, r);
  if (active) {
    active.lastUsedAt = new Date().toISOString();
    active.lastActiveAt = active.lastUsedAt;
    await ctx.store.saveRegistry(r);
  }
  if (!ctx.jsonMode)
    console.log(ctx.color("1;32", "✓ Login completed and account saved."));
  else ctx.out({ success: true });
}
