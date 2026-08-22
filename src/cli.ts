#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";

type Json = Record<string, any>;
const home = process.env.GROK_HOME || path.join(homedir(), ".grok");
const base = process.env.GROK_AUTH_HOME || path.join(homedir(), ".grok-auth");
const authPath = path.join(home, "auth.json");
const registryPath = path.join(base, "registry.json");
const sensitive = /key|token|cookie|authorization|secret|password|api[_-]?key/i;
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const yes = args.includes("--yes");
const colorEnabled =
  !jsonMode &&
  !args.includes("--no-color") &&
  !process.env.NO_COLOR &&
  Boolean(process.stdout.isTTY);
const cleanArgs = args.filter((a) => !a.startsWith("--"));
const out = (v: any) =>
  jsonMode ? console.log(JSON.stringify(v, null, 2)) : console.log(v);
const color = (code: string, value: string) =>
  colorEnabled ? `\u001b[${code}m${value}\u001b[0m` : value;
function printAccountTable(accounts: Json[], active?: string) {
  const hasPlanData = accounts.some((account) => account.plan);
  const hasAuthData = accounts.some((account) => account.authMode);
  const hasResetData = accounts.some(
    (account) => account.resetAt || account.resetIn || account.usageResetAt,
  );
  console.log(
    color(
      "1;36",
      `     ID  ACCOUNT                        ${hasPlanData ? "PLAN     " : ""}${hasAuthData ? "AUTH   " : ""}STATUS       LAST ACTIVITY${hasResetData ? "  RESET IN" : ""}`,
    ),
  );
  console.log(
    "-----------------------------------------------------------------------------------------------",
  );
  for (const [index, account] of accounts.entries()) {
    const marker = account.id === active ? "*" : " ";
    const number = String(index + 1).padStart(2, "0");
    const name = String(
      account.email || account.displayName || account.id,
    ).padEnd(34);
    const plan = hasPlanData ? String(account.plan || "-").toUpperCase().padEnd(8) : "";
    const authMode = hasAuthData ? String(account.authMode || "-").toUpperCase().padEnd(7) : "";
    const usage = String(account.status || "-")
      .toLowerCase()
      .padEnd(12);
    const last = account.lastUsedAt || account.active ? "Now" : "-";
    const reset =
      account.resetIn || account.usageResetAt || account.resetAt || "-";
    const row = `${marker} ${number} ${name} ${plan}${authMode}${usage} ${last}${hasResetData ? `  ${reset}` : ""}`;
    console.log(account.id === active ? color("1;32", row) : row);
  }
  console.log(
    `\n${accounts.length} account${accounts.length === 1 ? "" : "s"}`,
  );
}
function printHelp() {
  console.log(color("1;36", "\ngrok-cli — Grok account manager\n"));
  console.log(color("1;33", "USAGE"));
  console.log("  grok-cli <command> [options]\n");
  console.log(color("1;33", "ACCOUNT COMMANDS"));
  console.log("  list                         List saved Grok accounts");
  console.log("  current                      Show the active account");
  console.log(
    "  status                       Show authentication and CLI status",
  );
  console.log(
    "  login [--device-auth]        Sign in through the official Grok CLI",
  );
  console.log("  switch <number|email|alias>  Switch the active account");
  console.log("  move <account> <top|bottom>  Move an account in the list");
  console.log("  remove <number|email|alias>  Remove a saved account");
  console.log("  alias set <account> <alias>  Assign an account alias");
  console.log("  alias clear <account>        Remove an account alias\n");
  console.log(color("1;33", "DATA COMMANDS"));
  console.log("  export <file>                Export account metadata");
  console.log("  export <file> --include-credentials");
  console.log(
    "                               Export sensitive credentials explicitly",
  );
  console.log(
    "  import <file>                Import a validated account export",
  );
  console.log("  clean                        Preview cleanup actions");
  console.log("  clean --backups --yes       Remove saved authentication backups");
  console.log("  repair                       Check registry consistency");
  console.log("  config                       Show configuration information");
  console.log("  watch                        Watch for auth file changes (Ctrl-C to stop)\n");
  console.log(color("1;33", "OPTIONS"));
  console.log("  --json                       Output machine-readable JSON");
  console.log("  --yes                        Confirm destructive operations");
  console.log("  --no-color                   Disable terminal colors");
  console.log("  --version                    Show the version");
  console.log("  --help                       Show this help\n");
}
const fail = (code: string, message: string): never => {
  if (jsonMode)
    console.log(JSON.stringify({ success: false, error: { code, message } }));
  else console.error(color("1;31", `✗ ${message}`));
  process.exitCode = 1;
  process.exit(1);
  throw new Error(message);
};
async function readJson(file: string, fallback: any) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e: any) {
    if (e.code === "ENOENT") return fallback;
    throw new Error(`Malformed JSON: ${file}`);
  }
}
async function ensure() {
  await fs.mkdir(path.join(base, "accounts"), { recursive: true });
  await fs.mkdir(path.join(base, "backups"), { recursive: true });
}
async function exists(file: string) {
  try { await fs.access(file); return true; } catch { return false; }
}
async function auth(): Promise<Json> {
  const v = await readJson(authPath, {});
  if (!v || Array.isArray(v) || typeof v !== "object")
    throw new Error("Grok auth.json must contain a JSON object");
  return v;
}
function redact(v: any): any {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !sensitive.test(k))
        .map(([k, x]) => [k, redact(x)]),
    );
  return v;
}
async function registry(): Promise<Json[]> {
  const value = await readJson(registryPath, []);
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}
async function saveRegistry(r: Json[]) {
  await fs.writeFile(registryPath, JSON.stringify(r, null, 2) + "\n", {
    mode: 0o600,
  });
}
function entryMeta(id: string, key: string, e: Json, active = false) {
  const exp = e.expires_at;
  const status =
    exp && !Number.isNaN(Date.parse(exp)) && Date.parse(exp) <= Date.now()
      ? "EXPIRED"
      : "VALID";
  return {
    id,
    alias: e.alias ?? undefined,
    email: e.email,
    displayName:
      [e.first_name, e.last_name].filter(Boolean).join(" ") || e.email,
    userId: e.user_id || e.principal_id,
    authMode: e.auth_mode,
    authEntryKey: key,
    status,
    active,
    expiresAt: exp,
    lastUsedAt: e.lastUsedAt,
  };
}
async function sync() {
  await ensure();
  const a = await auth();
  let r = await registry();
  const keys = Object.keys(a);
  for (const key of keys) {
    const e = a[key];
    if (!e || typeof e !== "object") continue;
    let x = r.find(
      (x) =>
        x.authEntryKey === key &&
        ((!e.user_id && !e.principal_id) ||
          (x.userId && (x.userId === e.user_id || x.userId === e.principal_id))),
    );
    if (!x) {
      const id = crypto.randomUUID();
      x = { ...entryMeta(id, key, e) };
      r.push(x);
    }
    await fs.writeFile(
      path.join(base, "accounts", x.id + ".json"),
      JSON.stringify({ key, entry: e }, null, 2) + "\n",
      { mode: 0o600 },
    );
  }
  r = r.filter((item, index, all) =>
    all.findIndex((other) =>
      other.authEntryKey === item.authEntryKey &&
      (other.userId || "") === (item.userId || ""),
    ) === index,
  );
  await saveRegistry(r);
  return { a, r };
}
// The official Windows installer exposes Grok as `grok.exe` (not necessarily
// an npm-style `grok.cmd` shim). Keep the executable name aligned with the
// installed CLI so Windows PATH discovery works in both PowerShell and cmd.
const grokExe = process.platform === "win32" ? "grok.exe" : "grok";
const spawnGrok = (argv: string[], options: any = {}) =>
  spawn(grokExe, argv, { ...options, ...(process.platform === "win32" ? { shell: true } : {}) });
async function cliVersion() {
  return new Promise<string>((resolve) => {
    const p = spawnGrok(["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let s = "";
    p.stdout.on("data", (d) => (s += d));
    p.on("close", (c) => resolve(c === 0 ? s.trim() : "not detected"));
    p.on("error", () => resolve("not detected"));
  });
}
async function login() {
  // Preserve the currently active account before Grok replaces auth.json.
  if (await exists(authPath)) await sync();
  const extra = cleanArgs.slice(1);
  const supported = extra.length
    ? ["--device-auth", "--device-code", "--oauth"].includes(extra[0])
    : true;
  if (!supported)
    fail("UNSUPPORTED_FLAG", `Unsupported login flag '${extra[0]}'.`);
  const p = spawnGrok(["login", ...extra], { stdio: "inherit" });
  await new Promise<void>((res, rej) => {
    p.on("close", (c) =>
      c === 0 ? res() : rej(new Error(`grok login exited with code ${c}`)),
    );
    p.on("error", () =>
      rej(
        new Error(
          "Grok CLI was not found. Install Grok and ensure `grok` is in PATH.",
        ),
      ),
    );
  });
  await sync();
  if (!jsonMode)
    console.log(color("1;32", "✓ Login completed and account saved."));
  else out({ success: true });
}
async function main() {
  try {
    const cmd = cleanArgs[0] || "help";
    if (args.includes("--help") || args.includes("-h")) return printHelp();
    if (args.includes("--version") || args.includes("-v")) return out("grok-cli 1.0.0");
    if (cmd === "help") return printHelp();
    if (cmd === "login") return await login();
    if (cmd === "list" || cmd === "status" || cmd === "current") {
      const { a, r } = await sync();
      const activeKey = Object.keys(a)[0];
      const activeEntry = activeKey ? a[activeKey] : undefined;
      const activeUserId = activeEntry?.user_id || activeEntry?.principal_id;
      const accounts = r.map((x) => ({
        ...x,
        active: x.userId === activeUserId && x.authEntryKey === activeKey,
      }));
      const active = (accounts.find((x) => x.active) as any)?.id;
      if (cmd === "list" && !jsonMode) {
        printAccountTable(accounts, active);
        return;
      }
      if (cmd === "current" && !jsonMode) {
        const account: any = accounts.find((x) => x.active);
        if (!account)
          return fail("NO_ACTIVE_ACCOUNT", "No active Grok account was found.");
        console.log(
          color(
            "1;36",
            `Active account: ${account.email || account.displayName || account.id}`,
          ),
        );
        console.log(
          `Auth mode: ${color("33", String(account.authMode || "-").toUpperCase())}`,
        );
        console.log(
          `Status: ${color(account.status === "VALID" ? "32" : "31", String(account.status || "UNKNOWN").toLowerCase())}`,
        );
        return;
      }
      return out(
        cmd === "list"
          ? {
              success: true,
              active,
              accounts,
            }
          : {
              success: true,
              active: accounts.find((x) => x.active) || null,
              grokCli: await cliVersion(),
              authFile: authPath,
              registry: "synchronized",
            },
      );
    }
    if (cmd === "switch") return await switchAccount(cleanArgs[1]);
    if (cmd === "move") return await moveAccount(cleanArgs[1], cleanArgs[2]);
    if (cmd === "alias") return await aliasCmd();
    if (cmd === "remove") return await removeAccount(cleanArgs[1]);
    if (cmd === "export") return await exportCmd(cleanArgs[1]);
    if (cmd === "import") return await importCmd(cleanArgs[1]);
    if (cmd === "clean") return await cleanCmd();
    if (cmd === "repair") return await repairCmd();
    if (cmd === "config") return out({ success: true, grokHome: home, managerHome: base, authFile: authPath, registryFile: registryPath, grokCommand: grokExe });
    if (cmd === "watch") return await watchCmd();
    fail("UNKNOWN_COMMAND", `Unknown command '${cmd}'.`);
  } catch (e: any) {
    if (!e.silent) fail("OPERATION_FAILED", e.message);
  }
}
async function switchAccount(name?: string) {
  const { a, r } = await sync();
  const numericIndex = name && /^\d+$/.test(name) ? Number(name) - 1 : -1;
  const target =
    (numericIndex >= 0 ? r[numericIndex] : undefined) ||
    r.find((x) => x.id === name || x.alias === name || x.email === name);
  if (!target)
    return fail("ACCOUNT_NOT_FOUND", `Account '${name || ""}' was not found`);
  const snap = await readJson(
    path.join(base, "accounts", target.id + ".json"),
    null,
  );
  if (!snap?.entry)
    return fail("CORRUPT_SNAPSHOT", "Selected account snapshot is invalid");
  await fs.mkdir(path.join(base, "backups"), { recursive: true });
  await fs.copyFile(
    authPath,
    path.join(
      base,
      "backups",
      `${new Date().toISOString().replaceAll(":", "-")}-auth.json`,
    ),
  );
  const next: Json = { ...a, [snap.key]: snap.entry };
  for (const k of Object.keys(next))
    if (k !== snap.key && r.some((x) => x.authEntryKey === k)) delete next[k];
  const tmp = authPath + ".tmp-" + process.pid;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2) + "\n", {
    mode: 0o600,
  });
  await fs.rename(tmp, authPath);
  if (!jsonMode)
    console.log(
      color("1;32", `✓ Switched to account: ${target.alias || target.id}`),
    );
  else out({ success: true, active: target.id });
}
async function moveAccount(name?: string, position?: string) {
  const { r } = await sync();
  const index = name && /^\d+$/.test(name) ? Number(name) - 1 : -1;
  const target = (index >= 0 ? r[index] : undefined) || r.find((x) => x.id === name || x.alias === name || x.email === name);
  if (!target) return fail("ACCOUNT_NOT_FOUND", `Account '${name || ""}' was not found`);
  if (position !== "top" && position !== "bottom") return fail("INVALID_POSITION", "Use move <account> top or move <account> bottom.");
  const remaining = r.filter((x) => x !== target);
  position === "top" ? remaining.unshift(target) : remaining.push(target);
  await saveRegistry(remaining);
  out({ success: true, moved: target.id, position });
}
async function aliasCmd() {
  const { r } = await sync();
  const op = cleanArgs[1],
    account = cleanArgs[2],
    alias = cleanArgs[3],
    x = r.find((x) => x.id === account || x.alias === account);
  if (!x)
    return fail("ACCOUNT_NOT_FOUND", `Account '${account}' was not found`);
  if (op === "set") {
    if (!alias || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/.test(alias))
      return fail("INVALID_ALIAS", "Alias must be 1-32 characters using letters, numbers, dots, underscores, or hyphens.");
    if (r.some((y) => y !== x && y.alias === alias))
      return fail(
        "ALIAS_CONFLICT",
        `Alias '${alias}' is already assigned to another account.`,
      );
    x.alias = alias;
  } else if (op === "clear") delete x.alias;
  else
    return fail(
      "INVALID_USAGE",
      "Use alias set <account> <alias> or alias clear <account>",
    );
  await saveRegistry(r);
  out({ success: true });
}
async function removeAccount(name?: string) {
  const { r } = await sync();
  const index = name && /^\d+$/.test(name) ? Number(name) - 1 : -1;
  const x = (index >= 0 ? r[index] : undefined) || r.find((x) => x.id === name || x.alias === name || x.email === name);
  if (!x) return fail("ACCOUNT_NOT_FOUND", `Account '${name}' was not found`);
  if (!yes)
    return fail(
      "CONFIRMATION_REQUIRED",
      "Use --yes to confirm account removal.",
    );
  await fs.rm(path.join(base, "accounts", x.id + ".json"), { force: true });
  await saveRegistry(r.filter((y) => y !== x));
  out({ success: true, removed: x.id });
}
async function exportCmd(file?: string) {
  if (!file) return fail("INVALID_USAGE", "Specify an export file.");
  const { r } = await sync();
  const metadataOnly = !args.includes("--include-credentials");
  if (!metadataOnly && !args.includes("--confirm-sensitive-export"))
    return fail("CONFIRMATION_REQUIRED", "Credential export is sensitive. Re-run with --include-credentials --confirm-sensitive-export.");
  const payload = metadataOnly
    ? { version: 1, accounts: r.map(redact) }
    : {
        version: 1,
        warning: "SENSITIVE CREDENTIAL EXPORT",
        accounts: await Promise.all(
          r.map(async (x) => ({
            ...x,
            credential: await readJson(
              path.join(base, "accounts", x.id + ".json"),
              null,
            ),
          })),
        ),
      };
  await fs.writeFile(
    path.resolve(file),
    JSON.stringify(payload, null, 2) + "\n",
    { mode: 0o600 },
  );
  out({ success: true, file: path.resolve(file), metadataOnly });
}
async function importCmd(file?: string) {
  if (!file) return fail("INVALID_USAGE", "Specify an import file.");
  const p = await readJson(path.resolve(file), null);
  if (!p || p.version !== 1 || !Array.isArray(p.accounts))
    return fail("INVALID_IMPORT", "Unsupported import structure.");
  await ensure();
  const r = await registry();
  let imported = 0;
  for (const x of p.accounts) {
    if (x.credential?.entry) {
      if (!x.credential.key || typeof x.credential.entry !== "object" || Array.isArray(x.credential.entry))
        continue;
      const id = x.id || crypto.randomUUID();
      if (r.some((y) => y.id === id || (x.email && y.email === x.email))) continue;
      await fs.writeFile(
        path.join(base, "accounts", id + ".json"),
        JSON.stringify(x.credential, null, 2) + "\n",
        { mode: 0o600 },
      );
      r.push({ ...x, id });
      imported++;
    }
  }
  await saveRegistry(r);
  out({ success: true, imported, skipped: p.accounts.length - imported, metadataOnlyAccounts: p.accounts.filter((x: Json) => !x.credential?.entry).length });
}
async function repairCmd() {
  await ensure();
  const r = await registry();
  const valid = r.filter((x) => x && typeof x.id === "string" && x.authEntryKey);
  const duplicates = valid.length - new Map(valid.map((x) => [x.id, x])).size;
  const missingSnapshots = (await Promise.all(valid.map(async (x) => !(await exists(path.join(base, "accounts", `${x.id}.json`)))))).filter(Boolean).length;
  return out({ success: true, command: "repair", valid: valid.length, invalid: r.length - valid.length, duplicates, missingSnapshots, changes: [] });
}
async function cleanCmd() {
  await ensure();
  const r = await registry();
  const known = new Set(r.map((x) => `${x.id}.json`));
  const files = await fs.readdir(path.join(base, "accounts"));
  const orphaned = files.filter((x) => x.endsWith(".json") && !known.has(x));
  if (orphaned.length && yes) await Promise.all(orphaned.map((x) => fs.rm(path.join(base, "accounts", x), { force: true })));
  const backupDir = path.join(base, "backups");
  const backupFiles = (await fs.readdir(backupDir)).filter((x) => x.endsWith(".json"));
  const removeBackups = args.includes("--backups");
  if (removeBackups && yes) await Promise.all(backupFiles.map((x) => fs.rm(path.join(backupDir, x), { force: true })));
  return out({ success: true, command: "clean", preview: !yes, orphanedSnapshots: orphaned, removed: yes ? orphaned : [], backups: removeBackups ? (yes ? backupFiles : { preview: backupFiles }) : undefined });
}
async function watchCmd() {
  await ensure();
  if (!await exists(authPath)) return fail("AUTH_FILE_NOT_FOUND", `Grok auth file not found: ${authPath}`);
  if (!jsonMode) console.log(`Watching ${authPath}. Press Ctrl-C to stop.`);
  const watcher = (await import("node:fs")).watch(authPath, async () => { await sync(); out({ success: true, event: "auth-changed", file: authPath }); });
  await new Promise<void>((resolve) => process.once("SIGINT", () => { watcher.close(); resolve(); }));
}
main();
