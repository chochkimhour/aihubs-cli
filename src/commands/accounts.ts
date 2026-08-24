import { promises as fs } from "node:fs";
import path from "node:path";
import { findAccount } from "../store.js";
import { backupAuthPath } from "../store.js";
import { writeJson } from "../lib/json.js";
import type { CliContext } from "../context.js";
import type { Json } from "../types.js";
import { PROVIDER_COMMANDS } from "../constants.js";
import { resolvePaths } from "../paths.js";

export async function switchAccount(
  ctx: CliContext,
  name?: string,
  provider?: string,
): Promise<void> {
  const { a, r } = await ctx.store.sync(false, provider || "default");
  const target = findAccount(
    provider ? r.filter((item) => item.provider === provider) : r,
    name,
  );
  if (!target)
    return ctx.fail(
      "ACCOUNT_NOT_FOUND",
      `Account '${name || ""}' was not found`,
    );
  const snap = await ctx.store.readSnapshot(target.id);
  if (!snap?.entry)
    return ctx.fail("CORRUPT_SNAPSHOT", "Selected account snapshot is invalid");
  await fs.mkdir(ctx.paths.backupsDir, { recursive: true });
  if (await fs.stat(ctx.paths.authFile).catch(() => undefined))
    await fs.copyFile(ctx.paths.authFile, backupAuthPath(ctx.paths));
  await fs.mkdir(ctx.paths.providerHome, { recursive: true });
  const next: Json = { ...a, [snap.key]: snap.entry };
  for (const k of Object.keys(next))
    if (k !== snap.key && r.some((item) => item.authEntryKey === k))
      delete next[k];
  const tmp = ctx.paths.authFile + ".tmp-" + process.pid;
  await writeJson(tmp, next);
  await fs.rename(tmp, ctx.paths.authFile);
  target.lastUsedAt = new Date().toISOString();
  target.lastActiveAt = target.lastUsedAt;
  await ctx.store.saveRegistry(r);
  if (!ctx.jsonMode)
    console.log(
      ctx.color(
        "1;32",
        `✓ Switched to account: ${target.email || target.alias || target.id}`,
      ),
    );
  else ctx.out({ success: true, active: target.id });
}

export async function switchCommand(ctx: CliContext): Promise<void> {
  const possibleProvider = ctx.positional[1]?.toLowerCase();
  const provider = possibleProvider && PROVIDER_COMMANDS[possibleProvider]
    ? possibleProvider
    : undefined;
  await switchAccount(
    ctx,
    provider ? ctx.positional[2] : ctx.positional[1],
    provider,
  );
}

export async function moveCommand(ctx: CliContext): Promise<void> {
  const name = ctx.positional[1];
  const position = ctx.positional[2];
  const { r } = await ctx.store.sync();
  const target = findAccount(r, name);
  if (!target)
    return ctx.fail(
      "ACCOUNT_NOT_FOUND",
      `Account '${name || ""}' was not found`,
    );
  if (position !== "top" && position !== "bottom")
    return ctx.fail(
      "INVALID_POSITION",
      "Use move <account> top or move <account> bottom.",
    );
  const remaining = r.filter((item) => item !== target);
  position === "top" ? remaining.unshift(target) : remaining.push(target);
  await ctx.store.saveRegistry(remaining);
  ctx.out({ success: true, moved: target.id, position });
}

export async function aliasCommand(ctx: CliContext): Promise<void> {
  const { r } = await ctx.store.sync();
  const op = ctx.positional[1];
  const account = ctx.positional[2];
  const alias = ctx.positional[3];
  const x = findAccount(r, account, { numeric: false, email: false });
  if (!x)
    return ctx.fail("ACCOUNT_NOT_FOUND", `Account '${account}' was not found`);
  if (op === "set") {
    if (!alias || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/.test(alias))
      return ctx.fail(
        "INVALID_ALIAS",
        "Alias must be 1-32 characters using letters, numbers, dots, underscores, or hyphens.",
      );
    if (r.some((y) => y !== x && y.alias === alias))
      return ctx.fail(
        "ALIAS_CONFLICT",
        `Alias '${alias}' is already assigned to another account.`,
      );
    x.alias = alias;
  } else if (op === "clear") delete x.alias;
  else
    return ctx.fail(
      "INVALID_USAGE",
      "Use alias set <account> <alias> or alias clear <account>",
    );
  await ctx.store.saveRegistry(r);
  ctx.out({ success: true });
}

export async function resetCommand(ctx: CliContext): Promise<void> {
  const { r } = await ctx.store.sync(true);
  const operation = ctx.positional[1];
  const accountName = ctx.positional[2];
  const value = ctx.positional[3];
  const account = findAccount(r, accountName);
  if (!account)
    return ctx.fail(
      "ACCOUNT_NOT_FOUND",
      `Account '${accountName || ""}' was not found`,
    );
  if (operation === "clear") {
    delete account.manualResetAt;
  } else if (operation === "set") {
    const time = value ? new Date(value) : new Date("");
    if (Number.isNaN(time.getTime()))
      return ctx.fail(
        "INVALID_RESET_TIME",
        "Use an ISO time, for example 2026-08-29T07:00:00+07:00.",
      );
    account.manualResetAt = time.toISOString();
  } else {
    return ctx.fail(
      "INVALID_USAGE",
      "Use reset set <account> <ISO-time> or reset clear <account>.",
    );
  }
  await ctx.store.saveRegistry(r);
  ctx.out({
    success: true,
    account: account.id,
    resetAt: account.manualResetAt || null,
  });
}

function removeSelectors(ctx: CliContext): string[] {
  return ctx.positional
    .slice(1)
    .flatMap((arg) => arg.split(/[,\s]+/))
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function removeCommand(ctx: CliContext): Promise<void> {
  const names = removeSelectors(ctx);
  if (!names.length)
    return ctx.fail(
      "INVALID_USAGE",
      "Use remove <number|id|email|alias> [number|id|email|alias ...]",
    );
  const { a, r } = await ctx.store.sync();
  const found: Json[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const account = findAccount(r, name);
    if (!account) missing.push(name);
    else if (!found.some((item) => item.id === account.id)) found.push(account);
  }
  if (missing.length)
    return ctx.fail(
      "ACCOUNT_NOT_FOUND",
      `Account '${missing.join("', '")}' was not found`,
    );
  if (!ctx.yes)
    return ctx.fail(
      "CONFIRMATION_REQUIRED",
      "Use --yes to confirm account removal.",
    );
  const nextAuth: Json = { ...a };
  let authChanged = false;
  for (const account of found) {
    await ctx.store.removeSnapshot(account.id);
    const key = account.authEntryKey;
    const entry = key ? nextAuth[key] : undefined;
    if (
      entry &&
      (entry.user_id === account.userId ||
        entry.principal_id === account.userId ||
        !account.userId)
    ) {
      delete nextAuth[key];
      authChanged = true;
    }
    await removeProviderAccountSource(
      String(account.provider || "default"),
      account.authEntryKey,
      account.userId,
      account.email,
    );
  }
  const ids = new Set(found.map((item) => item.id));
  await ctx.store.saveRegistry(r.filter((item) => !ids.has(item.id)));
  if (authChanged) {
    await fs.mkdir(ctx.paths.backupsDir, { recursive: true });
    if (await fs.stat(ctx.paths.authFile).catch(() => undefined))
      await fs.copyFile(ctx.paths.authFile, backupAuthPath(ctx.paths));
    const tmp = ctx.paths.authFile + ".tmp-" + process.pid;
    await writeJson(tmp, nextAuth);
    await fs.rename(tmp, ctx.paths.authFile);
  }
  const removed = found.map((item) => item.id);
  if (ctx.jsonMode) return ctx.out({ success: true, removed });
  const labels = found.map(
    (item) => item.email || item.alias || item.id,
  );
  console.log(
    ctx.color(
      "1;32",
      `✓ Removed ${found.length} account${found.length === 1 ? "" : "s"}: ${labels.join(", ")}`,
    ),
  );
}

async function removeProviderAccountSource(
  provider: string,
  authEntryKey: unknown,
  userId: unknown,
  email: unknown,
): Promise<void> {
  const paths = resolvePaths(provider);
  let auth: any;
  try {
    auth = JSON.parse(await fs.readFile(paths.authFile, "utf8"));
  } catch {
    auth = undefined;
  }
  if (auth && typeof auth === "object" && !Array.isArray(auth)) {
    let changed = false;
    for (const [key, entry] of Object.entries(auth)) {
      const value = entry as any;
      const matches =
        key === authEntryKey ||
        (userId &&
          [value?.user_id, value?.principal_id, value?.account_id].includes(
            userId,
          )) ||
        (email && [value?.email, value?.login].includes(email));
      if (matches) {
        delete auth[key];
        changed = true;
      }
    }
    if (changed) await writeJson(paths.authFile, auth);
  }
  if (provider !== "codex") return;
  const accountDir = path.join(paths.providerHome, "accounts");
  let names: string[];
  try {
    names = await fs.readdir(accountDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith(".auth.json")) continue;
    const file = path.join(accountDir, name);
    let value: any;
    try {
      value = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      continue;
    }
    const tokens = value?.tokens || value;
    const matchesUser =
      (userId &&
        [tokens?.account_id, tokens?.user_id, tokens?.principal_id].includes(
          userId,
        )) ||
      (email && [tokens?.email, value?.email].includes(email));
    if (matchesUser) await fs.rm(file, { force: true });
  }
}
