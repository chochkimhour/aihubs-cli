import { promises as fs } from "node:fs";
import { findAccount } from "../store.js";
import { backupAuthPath } from "../store.js";
import { writeJson } from "../lib/json.js";
import type { CliContext } from "../context.js";
import type { Json } from "../types.js";

export async function switchAccount(
  ctx: CliContext,
  name?: string,
): Promise<void> {
  const { a, r } = await ctx.store.sync();
  const target = findAccount(r, name);
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
  await fs.mkdir(ctx.paths.grokHome, { recursive: true });
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
  await switchAccount(ctx, ctx.positional[1]);
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

export async function removeCommand(ctx: CliContext): Promise<void> {
  const name = ctx.positional[1];
  const { r } = await ctx.store.sync();
  const x = findAccount(r, name);
  if (!x)
    return ctx.fail("ACCOUNT_NOT_FOUND", `Account '${name}' was not found`);
  if (!ctx.yes)
    return ctx.fail(
      "CONFIRMATION_REQUIRED",
      "Use --yes to confirm account removal.",
    );
  await ctx.store.removeSnapshot(x.id);
  await ctx.store.saveRegistry(r.filter((y) => y !== x));
  ctx.out({ success: true, removed: x.id });
}
