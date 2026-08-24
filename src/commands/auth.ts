import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exists, readJson, writeJson } from "../lib/json.js";
import { findActiveFromAuth } from "../store.js";
import { runProvider } from "../providers/spawn.js";
import { PROVIDER_COMMANDS } from "../constants.js";
import type { CliContext } from "../context.js";
import { resolvePaths } from "../paths.js";

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
  const failMessage = (code: number | null) =>
    providerName === "gemini"
      ? `Gemini CLI login failed with exit code ${code}. Google ended personal-account Gemini CLI sign-in on June 18, 2026. Use a Gemini API key, an eligible enterprise account, or migrate to Antigravity: https://antigravity.google`
      : `Login through '${providerCommand || "the default provider CLI"}' failed with exit code ${code}. Verify the provider CLI is installed and try again.`;
  if (providerName === "codex")
    await runCodexLoginIsolated(ctx, loginArgs, failMessage);
  else if (providerName === "agy")
    // Agy starts its OAuth flow on launch; it does not implement a `login`
    // subcommand like Codex and Gemini.
    await runProvider(loginArgs, failMessage, providerCommand);
  else await runProvider(["login", ...loginArgs], failMessage, providerCommand);
  const { a, r } = await ctx.store.sync(false, providerName || "default");
  if (providerName === "agy") await preserveAgyAccountHistory();
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

async function preserveAgyAccountHistory(): Promise<void> {
  const file = path.join(os.homedir(), ".gemini", "google_accounts.json");
  const data = await readJson(file, {});
  const active = typeof data?.active === "string" ? data.active : undefined;
  if (!active) return;
  const old = Array.isArray(data.old) ? data.old : [];
  await writeJson(file, {
    ...data,
    active,
    old: [...new Set([...old, active])].filter((email) => email !== active),
  });
}

async function runCodexLoginIsolated(
  ctx: CliContext,
  loginArgs: string[],
  failMessage: (code: number | null) => string,
): Promise<void> {
  const realPaths = resolvePaths("codex");
  const scratchHome = await fs.mkdtemp(
    path.join(os.tmpdir(), "aihubs-codex-login-"),
  );
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = scratchHome;
  try {
    await runProvider(
      ["login", ...loginArgs],
      failMessage,
      PROVIDER_COMMANDS.codex,
    );
    const scratchAuth = path.join(scratchHome, "auth.json");
    const raw = JSON.parse(await fs.readFile(scratchAuth, "utf8"));
    const accountId = raw?.tokens?.account_id;
    await fs.mkdir(realPaths.providerHome, { recursive: true });
    await fs.copyFile(scratchAuth, realPaths.authFile);
    if (typeof accountId === "string") {
      const accountDir = path.join(realPaths.providerHome, "accounts");
      await fs.mkdir(accountDir, { recursive: true });
      await fs.copyFile(
        scratchAuth,
        path.join(accountDir, `${accountId}.auth.json`),
      );
    }
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    await fs.rm(scratchHome, { recursive: true, force: true });
  }
}
