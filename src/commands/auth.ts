import { exists } from "../lib/json.js";
import { findActiveFromAuth } from "../store.js";
import { runProvider } from "../providers/spawn.js";
import type { CliContext } from "../context.js";

export async function loginCommand(ctx: CliContext): Promise<void> {
  if (await exists(ctx.paths.authFile)) await ctx.store.sync();
  const extra = ctx.commandArgs();
  const supported = extra.length
    ? ["--device-auth", "--device-code", "--oauth"].includes(extra[0])
    : true;
  if (!supported)
    ctx.fail("UNSUPPORTED_FLAG", `Unsupported login flag '${extra[0]}'.`);
  await runProvider(
    ["login", ...extra],
    (code) => `provider login exited with code ${code}`,
  );
  const { a, r } = await ctx.store.sync();
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
