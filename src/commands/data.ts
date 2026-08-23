import { promises as fs } from "node:fs";
import { watch } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { exists, readJson, writeJson } from "../lib/json.js";
import { redact } from "../lib/redact.js";
import { snapshotPath } from "../paths.js";
import type { CliContext } from "../context.js";
import type { Json } from "../types.js";

export async function exportCommand(ctx: CliContext): Promise<void> {
  const file = ctx.positional[1];
  if (!file) return ctx.fail("INVALID_USAGE", "Specify an export file.");
  const { r } = await ctx.store.sync();
  const metadataOnly = !ctx.hasFlag("--include-credentials");
  if (!metadataOnly && !ctx.hasFlag("--confirm-sensitive-export"))
    return ctx.fail(
      "CONFIRMATION_REQUIRED",
      "Credential export is sensitive. Re-run with --include-credentials --confirm-sensitive-export.",
    );
  const payload = metadataOnly
    ? { version: 1, accounts: r.map(redact) }
    : {
        version: 1,
        warning: "SENSITIVE CREDENTIAL EXPORT",
        accounts: await Promise.all(
          r.map(async (item) => ({
            ...item,
            credential: await ctx.store.readSnapshot(item.id),
          })),
        ),
      };
  await writeJson(path.resolve(file), payload);
  ctx.out({ success: true, file: path.resolve(file), metadataOnly });
}

export async function importCommand(ctx: CliContext): Promise<void> {
  const file = ctx.positional[1];
  if (!file) return ctx.fail("INVALID_USAGE", "Specify an import file.");
  const p = await readJson(path.resolve(file), null);
  if (!p || p.version !== 1 || !Array.isArray(p.accounts))
    return ctx.fail("INVALID_IMPORT", "Unsupported import structure.");
  await ctx.store.ensure();
  const r = await ctx.store.registry();
  let imported = 0;
  for (const item of p.accounts) {
    if (item.credential?.entry) {
      if (
        !item.credential.key ||
        typeof item.credential.entry !== "object" ||
        Array.isArray(item.credential.entry)
      )
        continue;
      const id =
        typeof item.id === "string" && /^[A-Za-z0-9_-]+$/.test(item.id)
          ? item.id
          : crypto.randomUUID();
      if (r.some((y) => y.id === id || (item.email && y.email === item.email)))
        continue;
      await ctx.store.writeSnapshot(id, item.credential);
      r.push({ ...item, id });
      imported++;
    }
  }
  await ctx.store.saveRegistry(r);
  ctx.out({
    success: true,
    imported,
    skipped: p.accounts.length - imported,
    metadataOnlyAccounts: p.accounts.filter(
      (item: Json) => !item.credential?.entry,
    ).length,
  });
}

export async function repairCommand(ctx: CliContext): Promise<void> {
  await ctx.store.ensure();
  const r = await ctx.store.registry();
  const valid = r.filter(
    (item) => item && typeof item.id === "string" && item.authEntryKey,
  );
  const duplicates =
    valid.length - new Map(valid.map((item) => [item.id, item])).size;
  const missingSnapshots = (
    await Promise.all(
      valid.map(
        async (item) => !(await exists(snapshotPath(ctx.paths, item.id))),
      ),
    )
  ).filter(Boolean).length;
  ctx.out({
    success: true,
    command: "repair",
    valid: valid.length,
    invalid: r.length - valid.length,
    duplicates,
    missingSnapshots,
    changes: [],
  });
}

export async function cleanCommand(ctx: CliContext): Promise<void> {
  await ctx.store.ensure();
  const r = await ctx.store.registry();
  const known = new Set(r.map((item) => `${item.id}.json`));
  const files = await fs.readdir(ctx.paths.accountsDir);
  const orphaned = files.filter(
    (item) => item.endsWith(".json") && !known.has(item),
  );
  if (orphaned.length && ctx.yes)
    await Promise.all(
      orphaned.map((item) =>
        fs.rm(path.join(ctx.paths.accountsDir, item), { force: true }),
      ),
    );
  const backupFiles = (await fs.readdir(ctx.paths.backupsDir)).filter((item) =>
    item.endsWith(".json"),
  );
  const removeBackups = ctx.hasFlag("--backups");
  if (removeBackups && ctx.yes)
    await Promise.all(
      backupFiles.map((item) =>
        fs.rm(path.join(ctx.paths.backupsDir, item), { force: true }),
      ),
    );
  ctx.out({
    success: true,
    command: "clean",
    preview: !ctx.yes,
    orphanedSnapshots: orphaned,
    removed: ctx.yes ? orphaned : [],
    backups: removeBackups
      ? ctx.yes
        ? backupFiles
        : { preview: backupFiles }
      : undefined,
  });
}

export async function configCommand(ctx: CliContext): Promise<void> {
  const operation = ctx.positional[1];
  const name = ctx.positional[2];
  const rawValue = ctx.positional[3];
  if (operation === "set" && name === "usage-cache-ttl") {
    const seconds = Number(rawValue);
    if (!Number.isFinite(seconds) || seconds < 0)
      return ctx.fail(
        "INVALID_CONFIG",
        "usage-cache-ttl must be zero or a positive number of seconds.",
      );
    const current = await readJson(ctx.paths.configFile, {});
    await writeJson(ctx.paths.configFile, {
      ...current,
      usageCacheTtlSeconds: seconds,
    });
    return ctx.out({ success: true, usageCacheTtlSeconds: seconds });
  }
  if (operation)
    return ctx.fail(
      "INVALID_CONFIG",
      "Use config set usage-cache-ttl <seconds>.",
    );
  ctx.out({
    success: true,
    grokHome: ctx.paths.grokHome,
    managerHome: ctx.paths.managerHome,
    authFile: ctx.paths.authFile,
    registryFile: ctx.paths.registryFile,
    grokCommand: ctx.grokCommand,
    configFile: ctx.paths.configFile,
  });
}

export async function watchCommand(ctx: CliContext): Promise<void> {
  await ctx.store.ensure();
  if (!(await exists(ctx.paths.authFile)))
    return ctx.fail(
      "AUTH_FILE_NOT_FOUND",
      `Grok auth file not found: ${ctx.paths.authFile}`,
    );
  if (!ctx.jsonMode)
    console.log(`Watching ${ctx.paths.authFile}. Press Ctrl-C to stop.`);
  const watcher = watch(ctx.paths.authFile, async () => {
    await ctx.store.sync();
    ctx.out({ success: true, event: "auth-changed", file: ctx.paths.authFile });
  });
  await new Promise<void>((resolve) =>
    process.once("SIGINT", () => {
      watcher.close();
      resolve();
    }),
  );
}
