#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { GrokUsageError, GrokUsageProvider, type GrokUsage } from "./grok/usage-provider.js";

type Json = Record<string, any>;
const home = process.env.GROK_HOME || path.join(homedir(), ".grok");
const base = process.env.GROK_AUTH_HOME || path.join(homedir(), ".grok-auth");
const authPath = path.join(home, "auth.json");
const registryPath = path.join(base, "registry.json");
const usageCachePath = path.join(base, "usage-cache");
const configPath = path.join(base, "config.json");
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
export function formatResetAt(value: unknown): string {
  if (!value) return "-";
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).replace(/,?\s*at\s*/i, ", ");
}
export function formatLastActivity(account: Json): string {
  if (account.active) return "Now";
  if (!account.lastUsedAt) return "-";
  const date = new Date(account.lastUsedAt);
  if (Number.isNaN(date.getTime())) return String(account.lastUsedAt).slice(0, 16);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function formatResetDate(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function formatTokenLeft(account: Json): string {
  const limit = typeof account.limit === "number" && account.limit > 0 ? account.limit : undefined;
  if (typeof account.used === "number" && limit)
    return `${Math.max(0, Math.min(100, Math.round(100 - (account.used / limit) * 100)))}%`;
  if (account.remaining !== undefined && limit)
    return `${Math.max(0, Math.min(100, Math.round((account.remaining / limit) * 100)))}%`;
  if (account.usagePercent !== undefined)
    return `${Math.max(0, Math.min(100, Math.round(100 - account.usagePercent)))}%`;
  return account.usageState === "unavailable" ? "UNAVAILABLE" : "NO API LIMIT";
}
function formatUsageUsed(account: Json): string {
  if (typeof account.used === "number" && typeof account.limit === "number" && account.limit > 0)
    return `${Math.max(0, Math.min(100, Math.round((account.used / account.limit) * 100)))}% used`;
  if (account.usagePercent !== undefined)
    return `${Math.max(0, Math.min(100, Math.round(Number(account.usagePercent))))}% used`;
  if (account.usageState === "unavailable") return "Unknown";
  return "Unknown";
}
function printAccountTable(accounts: Json[], active?: string) {
  console.log(
    color(
      "1;36",
      "     ID  ACCOUNT                       AUTH   STATUS   LAST SELECTED   USAGE        RESET AT",
    ),
  );
  console.log("------------------------------------------------------------------------------------------------");
  for (const [index, account] of accounts.entries()) {
    const marker = account.id === active ? "*" : " ";
    const number = String(index + 1).padStart(2, "0");
    const name = String(account.email || account.displayName || account.id).padEnd(29);
    const authMode = String(account.authMode || "-").toUpperCase().padEnd(7);
    const status = String(account.status || "-").toLowerCase();
    const statusLabel = (status === "-" ? status : status[0].toUpperCase() + status.slice(1)).padEnd(8);
    const last = formatLastActivity(account).padEnd(16);
    const tokenLeft = formatUsageUsed(account).padEnd(12);
    const reset = formatResetDate(
      account.resetAt || account.usageResetAt || account.manualResetAt || account.resetIn,
    );
    const row = `${marker} ${number} ${name} ${authMode}${statusLabel}${last}${tokenLeft} ${reset}`;
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
  console.log("  list --no-usage              List accounts without billing requests");
  console.log("  usage                        Show active account Grok credits");
  console.log("  current                      Show the active account");
  console.log(
    "  status                       Show authentication and CLI status",
  );
  console.log(
    "  login [--device-auth]        Sign in through the official Grok CLI",
  );
  console.log("  switch <number|id|email|alias> Switch the active account");
  console.log("  resume [session-id|title]    Resume a Grok session");
  console.log("  session                      List available sessions");
  console.log("  move <account> <top|bottom>  Move an account in the list");
  console.log("  remove <number|email|alias>  Remove a saved account");
  console.log("  alias set <account> <alias>  Assign an account alias");
  console.log("  alias clear <account>        Remove an account alias\n");
  console.log("  reset set <account> <time>   Set a known account reset time");
  console.log("  reset clear <account>        Clear a saved reset time\n");
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
  console.log("  config set usage-cache-ttl <seconds>  Set list usage cache TTL");
  console.log("  watch                        Watch for auth file changes (Ctrl-C to stop)\n");
  console.log(color("1;33", "OPTIONS"));
  console.log("  --json                       Output machine-readable JSON");
  console.log("  --yes                        Confirm destructive operations");
  console.log("  --no-color                   Disable terminal colors");
  console.log("  --version                    Show the version");
  console.log("  --help                       Show this help\n");
}
function printWelcome() {
  console.log(color("1;36", `
   ██████╗ ██████╗  ██████╗ ██╗  ██╗      ██████╗██╗     ██╗
  ██╔════╝ ██╔══██╗██╔═══██╗██║ ██╔╝     ██╔════╝██║     ██║
  ██║  ███╗██████╔╝██║   ██║█████╔╝█████╗██║     ██║     ██║
  ██║   ██║██╔══██╗██║   ██║██╔═██╗ ╚════╝██║     ██║     ██║
  ╚██████╔╝██║  ██║╚██████╔╝██║  ██╗     ╚██████╗███████╗██║
   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝      ╚═════╝╚══════╝╚═╝
`));
  console.log(color("1;32", "  Welcome to grok-cli"));
  console.log("  A simple local manager for your Grok accounts and sessions.\n");
  console.log(color("1;33", "  GET STARTED"));
  console.log("  grok-cli login                 Sign in and save an account");
  console.log("  grok-cli list                  View your saved accounts");
  console.log("  grok-cli switch <account>      Change the active account");
  console.log("  grok-cli status                Check authentication status\n");
  console.log(color("1;90", "  Run grok-cli --help for all commands and options."));
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
    if (e instanceof SyntaxError) throw new Error(`Malformed JSON: ${file}`);
    throw e;
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
async function sync(allowStoredAccounts = false) {
  await ensure();
  let a: Json;
  let r = await registry();
  try {
    a = await auth();
  } catch (error: any) {
    if (allowStoredAccounts && r.length && ["EACCES", "EPERM", "EBUSY"].includes(error?.code))
      return { a: {}, r };
    throw error;
  }
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
  const activeKey = Object.keys(a)[0];
  const activeEntry = activeKey ? a[activeKey] : undefined;
  const activeUserId = activeEntry?.user_id || activeEntry?.principal_id;
  const active = r.find((account) => account.authEntryKey === activeKey && account.userId === activeUserId);
  if (active) active.lastActiveAt = new Date().toISOString();
  await saveRegistry(r);
  return { a, r };
}
// The official Windows installer exposes Grok as `grok.exe`.
const grokExe = process.platform === "win32" ? "grok.exe" : "grok";
const spawnGrok = (argv: string[], options: any = {}) =>
  spawn(grokExe, argv, options);
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
  const { a, r } = await sync();
  const activeKey = Object.keys(a)[0];
  const activeEntry = activeKey ? a[activeKey] : undefined;
  const activeUserId = activeEntry?.user_id || activeEntry?.principal_id;
  const active = r.find((account) => account.authEntryKey === activeKey && account.userId === activeUserId);
  if (active) {
    active.lastUsedAt = new Date().toISOString();
    active.lastActiveAt = active.lastUsedAt;
    await saveRegistry(r);
  }
  if (!jsonMode)
    console.log(color("1;32", "✓ Login completed and account saved."));
  else out({ success: true });
}
async function main() {
  try {
    const hasCommand = cleanArgs.length > 0;
    const cmd = cleanArgs[0] || "help";
    if (args.includes("--help") || args.includes("-h")) return printHelp();
    if (args.includes("--version") || args.includes("-v")) return out("grok-cli 1.0.0");
    if (!hasCommand && !jsonMode) return printWelcome();
    if (cmd === "help") return printHelp();
    if (cmd === "login") return await login();
    if (cmd === "usage") return await usageCmd();
    if (cmd === "list" || cmd === "status" || cmd === "current") {
      const { a, r } = await sync(cmd === "list");
      const activeKey = Object.keys(a)[0];
      const activeEntry = activeKey ? a[activeKey] : undefined;
      const activeUserId = activeEntry?.user_id || activeEntry?.principal_id;
      const storedActive = !activeUserId
        ? [...r]
            .filter((account) => account.lastActiveAt)
            .sort((left, right) => String(right.lastActiveAt).localeCompare(String(left.lastActiveAt)))[0]?.id
        : undefined;
      const accounts = r.map((x) => ({
        ...x,
        active:
          (x.userId === activeUserId && x.authEntryKey === activeKey) ||
          x.id === storedActive,
      }));
      const active = (accounts.find((x) => x.active) as any)?.id;
      if (cmd === "list") {
        const listed = args.includes("--no-usage") ? accounts : await enrichAccountsWithUsage(accounts);
        if (!jsonMode) {
          printAccountTable(listed, active);
          return;
        }
        return out({ success: true, active, accounts: listed });
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
      return out({
        success: true,
        active: accounts.find((x) => x.active) || null,
        grokCli: await cliVersion(),
        authFile: authPath,
        registry: "synchronized",
      });
    }
    if (cmd === "switch") return await switchAccount(cleanArgs[1]);
    if (cmd === "resume") return await resumeCmd(cleanArgs[1]);
    if (cmd === "session") return await sessionCmd(cleanArgs[1]);
    if (cmd === "move") return await moveAccount(cleanArgs[1], cleanArgs[2]);
    if (cmd === "alias") return await aliasCmd();
    if (cmd === "reset") return await resetCmd();
    if (cmd === "remove") return await removeAccount(cleanArgs[1]);
    if (cmd === "export") return await exportCmd(cleanArgs[1]);
    if (cmd === "import") return await importCmd(cleanArgs[1]);
    if (cmd === "clean") return await cleanCmd();
    if (cmd === "repair") return await repairCmd();
    if (cmd === "config") return await configCmd();
    if (cmd === "watch") return await watchCmd();
    fail("UNKNOWN_COMMAND", `Unknown command '${cmd}'.`);
  } catch (e: any) {
    if (!e.silent) fail("OPERATION_FAILED", e.message);
  }
}
async function configCmd() {
  const operation = cleanArgs[1];
  const name = cleanArgs[2];
  const rawValue = cleanArgs[3];
  if (operation === "set" && name === "usage-cache-ttl") {
    const seconds = Number(rawValue);
    if (!Number.isFinite(seconds) || seconds < 0) return fail("INVALID_CONFIG", "usage-cache-ttl must be zero or a positive number of seconds.");
    const current = await readJson(configPath, {});
    await fs.writeFile(configPath, JSON.stringify({ ...current, usageCacheTtlSeconds: seconds }, null, 2) + "\n", { mode: 0o600 });
    return out({ success: true, usageCacheTtlSeconds: seconds });
  }
  if (operation) return fail("INVALID_CONFIG", "Use config set usage-cache-ttl <seconds>.");
  return out({ success: true, grokHome: home, managerHome: base, authFile: authPath, registryFile: registryPath, grokCommand: grokExe, configFile: configPath });
}
async function usageCacheTtlMs() {
  const config = await readJson(configPath, {});
  const seconds = Number(config?.usageCacheTtlSeconds);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 45_000;
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
  target.lastUsedAt = new Date().toISOString();
  target.lastActiveAt = target.lastUsedAt;
  await saveRegistry(r);
  if (!jsonMode)
    console.log(
      color("1;32", `✓ Switched to account: ${target.email || target.alias || target.id}`),
    );
  else out({ success: true, active: target.id });
}
async function usageCmd() {
  const { a, r } = await sync(true);
  const activeKey = Object.keys(a)[0];
  const activeEntry = activeKey ? a[activeKey] : undefined;
  const activeUserId = activeEntry?.user_id || activeEntry?.principal_id;
  const account = r.find((x) => x.authEntryKey === activeKey && x.userId === activeUserId) ||
    [...r].filter((x) => x.lastActiveAt).sort((l, q) => String(q.lastActiveAt).localeCompare(String(l.lastActiveAt)))[0];
  if (!account) return fail("NO_ACTIVE_ACCOUNT", "No active Grok account was found.");
  let usage: GrokUsage;
  try { usage = await usageForAccount(account.id, true); }
  catch (error) {
    if (error instanceof GrokUsageError) {
      if (jsonMode) return fail(error.kind === "auth" ? "AUTH_INVALID" : "BILLING_UNAVAILABLE", error.message);
      if (error.kind === "auth") {
        console.error("✗ Unable to fetch Grok usage.\n\nThe selected Grok authentication is no longer valid.\nRun:\n\ngrok-auth login");
      } else if (error.kind === "unsupported") console.error("✗ Grok returned an unsupported billing response.\n\nNo account data was modified.");
      else console.error("✗ Grok usage is currently unavailable.\n\nThe Grok billing service did not return usable usage data.");
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  const payload = { id: account.id, email: account.email };
  if (jsonMode) return out({ success: true, account: payload, usage });
  const fmt = (value?: string) => value ? formatResetAt(value) : "-";
  console.log("Grok Usage\n");
  console.log(`Account: ${account.email || account.id}`);
  console.log(`Plan: ${usage.subscriptionTier || "Unknown"}\n`);
  console.log("Credit Usage");
  console.log(`  Used:       ${usage.usagePercent === undefined ? "Unknown" : `${usage.usagePercent}%`}`);
  console.log(`  Remaining:  ${usage.usagePercent === undefined ? "Unknown" : `${Math.max(0, 100 - usage.usagePercent)}%`}\n`);
  console.log("Current Period");
  console.log(`  Start:      ${fmt(usage.periodStart)}`);
  console.log(`  Reset At:   ${fmt(usage.resetAt)}\n`);
  console.log("Source: Grok billing");
}
export function billingValue(v: any, key: string): number | undefined {
  const x = v?.[key];
  const n = typeof x === "object" ? x?.val ?? x?.value ?? x?.amount : x;
  if (typeof n === "number") return n;
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n)))
    return Number(n);
  return undefined;
}
function numericish(value: any): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    return Number(value);
  if (value && typeof value === "object") {
    return (
      numericish(value.val) ??
      numericish(value.value) ??
      numericish(value.amount) ??
      numericish(value.count)
    );
  }
  return undefined;
}
function deepBillingValue(root: any, patterns: RegExp[]): number | undefined {
  const seen = new Set<any>();
  const queue = [root];
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (!patterns.some((pattern) => pattern.test(key))) {
        if (entry && typeof entry === "object") queue.push(entry);
        continue;
      }
      const numeric = numericish(entry);
      if (typeof numeric === "number") return numeric;
      if (entry && typeof entry === "object") queue.push(entry);
    }
  }
  return undefined;
}
async function resumeCmd(session?: string) {
  await autoSwitchCmd(true);
  const argv = session ? ["--resume", session] : ["--continue"];
  const child = spawnGrok(argv, { stdio: "inherit" });
  await new Promise<void>((resolve, reject) => {
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`grok resume exited with code ${code}`)));
    child.on("error", () => reject(new Error("Grok CLI was not found. Install Grok and ensure `grok` is in PATH.")));
  });
}
async function sessionCmd(session?: string) {
  if (session) return fail("INVALID_OPTION", "Use 'session' to list sessions, then 'resume <session-id>' to continue one.");
  await autoSwitchCmd(true);
  const child = spawnGrok(["sessions", "list"], { stdio: "inherit" });
  await new Promise<void>((resolve, reject) => {
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`grok session list exited with code ${code}`)));
    child.on("error", () => reject(new Error("Grok CLI was not found. Install Grok and ensure `grok` is in PATH.")));
  });
}
async function accountUsage(entry: Json) {
  // Grok's auth.json stores the bearer token under `key` for OIDC accounts.
  const token = entry.access_token || entry.token || entry.key;
  if (!token) return null;
  const baseUrl = (process.env.GROK_CLI_CHAT_PROXY_BASE_URL || "https://cli-chat-proxy.grok.com/v1").replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${token}`, "X-XAI-Token-Auth": "xai-grok-cli", "x-userid": entry.user_id || entry.principal_id || "", Accept: "application/json" };
  const [plain, credits] = await Promise.all([
    fetch(`${baseUrl}/billing`, { headers }),
    fetch(`${baseUrl}/billing?format=credits`, { headers }),
  ]);
  if (!plain.ok && !credits.ok)
    throw new Error(`Billing request failed with HTTP ${plain.status || credits.status}`);
  const plainJson = plain.ok ? await plain.json() : {};
  const creditsJson = credits.ok ? await credits.json() : {};
  return {
    config: {
      ...(plainJson.config || plainJson),
      ...(creditsJson.config || creditsJson),
    },
  };
}
export function parseUsage(data: any) {
  const config = data?.config || data || {};
  const used =
    billingValue(config, "used") ??
    billingValue(config, "usedTokens") ??
    billingValue(config, "used_tokens");
  const deepUsed =
    used ??
    deepBillingValue(config, [/^used$/i, /used[_-]?tokens?/i, /^consumed$/i, /^spent$/i]);
  const limitRaw =
    billingValue(config, "monthlyLimit") ??
    billingValue(config, "monthly_limit") ??
    billingValue(config, "usageLimit") ??
    billingValue(config, "usage_limit") ??
    billingValue(config, "creditLimit") ??
    billingValue(config, "credit_limit") ??
    billingValue(config, "quota") ??
    billingValue(config, "quotaLimit") ??
    billingValue(config, "quota_limit") ??
    billingValue(config, "total") ??
    billingValue(config, "totalTokens") ??
    billingValue(config, "total_tokens") ??
    billingValue(config, "max") ??
    billingValue(config, "limit");
  const deepLimit =
    limitRaw ??
    deepBillingValue(config, [/^limit$/i, /^quota$/i, /monthly[_-]?limit/i, /credit[_-]?limit/i, /^max$/i, /^total$/i]);
  const limit = deepLimit && deepLimit > 0 ? deepLimit : undefined;
  const usagePercent =
    billingValue(config, "creditUsagePercent") ??
    billingValue(config, "credit_usage_percent") ??
    billingValue(config, "usagePercent") ??
    billingValue(config, "usage_percent") ??
    billingValue(config, "percentUsed") ??
    billingValue(config, "percent_used");
  const prepaid =
    billingValue(config, "prepaidBalance") ??
    billingValue(config, "prepaid_balance") ??
    billingValue(config, "creditBalance") ??
    billingValue(config, "credit_balance") ??
    billingValue(config, "remaining") ??
    billingValue(config, "remainingTokens") ??
    billingValue(config, "remaining_tokens");
  const remaining =
    used !== undefined && limit
      ? Math.max(0, limit - used)
      : prepaid && prepaid > 0
        ? prepaid
        : undefined;
  const resetAt =
    config?.currentPeriod?.end ||
    config?.current_period?.end ||
    config?.billingPeriodEnd ||
    config?.billingResetAt ||
    config?.billing_reset_at ||
    config?.resetAt;
  const computedUsed = deepUsed;
  const computedLimit = deepLimit && deepLimit > 0 ? deepLimit : undefined;
  const computedRemaining =
    computedUsed !== undefined && computedLimit
      ? Math.max(0, computedLimit - computedUsed)
      : remaining;
  return {
    used: computedUsed,
    limit: computedLimit,
    usagePercent,
    remaining: computedRemaining,
    resetAt,
    usageState:
      usagePercent !== undefined || computedLimit !== undefined
        ? "available"
        : "no_api_limit",
  };
}
async function usageForAccount(id: string, force = false): Promise<GrokUsage> {
  const snap = await readJson(path.join(base, "accounts", `${id}.json`), null);
  if (!snap?.entry) throw new GrokUsageError("auth", "The selected Grok authentication is no longer valid.");
  return new GrokUsageProvider({
    cacheDir: usageCachePath,
    cacheTtlMs: await usageCacheTtlMs(),
    grokVersion: await cliVersion(),
  }).get(id, snap.entry, force);
}
async function enrichAccountsWithUsage(accounts: Json[]) {
  return Promise.all(
    accounts.map(async (account) => {
      try {
        const usage = await usageForAccount(account.id);
        return { ...account, ...usage };
      } catch {
        return { ...account, usageState: "unknown" };
      }
    }),
  );
}
async function autoSwitchCmd(silent = false) {
  const { a, r } = await sync();
  const activeKey = Object.keys(a)[0];
  const activeEntry = activeKey ? a[activeKey] : undefined;
  const activeUserId = activeEntry?.user_id || activeEntry?.principal_id;
  const active = r.find((x) => x.userId === activeUserId && x.authEntryKey === activeKey);
  if (!active) return fail("NO_ACTIVE_ACCOUNT", "No active Grok account was found.");
  const usageFor = (id: string) => usageForAccount(id);
  let current;
  try {
    current = await usageFor(active.id);
  } catch {
    if (!silent) return out({ success: true, switched: false, active: active.id, usageUnavailable: true });
    return;
  }
  const currentExhausted =
    current.usagePercent !== undefined
      ? current.usagePercent >= 100
      : false;
  if (current.usagePercent === undefined) {
    if (!silent) return out({ success: true, switched: false, active: active.id, usageUnavailable: true });
    return;
  }
  if (!currentExhausted) {
    if (!silent) return out({ success: true, switched: false, active: active.id, ...current });
    return;
  }
  for (const candidate of r.filter((x) => x.id !== active.id)) {
    const next = await usageFor(candidate.id);
    const available =
      next.usagePercent !== undefined
        ? next.usagePercent < 100
        : false;
    if (available) {
      await switchAccount(candidate.id);
      if (!silent) return out({ success: true, switched: true, previous: active.id, active: candidate.id, ...current });
      return;
    }
  }
  return fail("NO_AVAILABLE_ACCOUNT", "The active account is exhausted and no other account has available usage.");
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
async function resetCmd() {
  const { r } = await sync(true);
  const operation = cleanArgs[1];
  const accountName = cleanArgs[2];
  const value = cleanArgs[3];
  const index = accountName && /^\d+$/.test(accountName) ? Number(accountName) - 1 : -1;
  const account =
    (index >= 0 ? r[index] : undefined) ||
    r.find((item) => item.id === accountName || item.alias === accountName || item.email === accountName);
  if (!account)
    return fail("ACCOUNT_NOT_FOUND", `Account '${accountName || ""}' was not found`);
  if (operation === "clear") {
    delete account.manualResetAt;
  } else if (operation === "set") {
    const time = value ? new Date(value) : new Date("");
    if (Number.isNaN(time.getTime()))
      return fail("INVALID_RESET_TIME", "Use an ISO time, for example 2026-08-29T07:00:00+07:00.");
    account.manualResetAt = time.toISOString();
  } else {
    return fail("INVALID_USAGE", "Use reset set <account> <ISO-time> or reset clear <account>.");
  }
  await saveRegistry(r);
  out({ success: true, account: account.id, resetAt: account.manualResetAt || null });
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
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main();
