import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { DEFAULT_USAGE_CACHE_TTL_MS } from "./constants.js";
import { readJson, writeJson } from "./lib/json.js";
import { snapshotPath, type AppPaths } from "./paths.js";
import type { Json } from "./types.js";

export class AccountStore {
  constructor(readonly paths: AppPaths) {}

  async ensure(): Promise<void> {
    await fs.mkdir(this.paths.accountsDir, { recursive: true });
    await fs.mkdir(this.paths.backupsDir, { recursive: true });
  }

  async auth(provider = "default"): Promise<Json> {
    if (provider === "agy") return this.agyAccounts();
    if (provider === "freebuff") return this.freebuffAccounts();
    if (provider === "claude") return this.claudeAccounts();
    const value = await readJson(this.paths.authFile, {});
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw new Error("Provider auth.json must contain a JSON object");
    if (provider === "codex") return this.codexAccounts(value);
    return value;
  }

  private async agyAccounts(): Promise<Json> {
    const source = await readJson(
      path.join(homedir(), ".gemini", "google_accounts.json"),
      {},
    );
    const logEmail = await latestAgyLoginEmail();
    const emails = [
      ...(logEmail ? [logEmail] : []),
      ...(typeof source?.active === "string" ? [source.active] : []),
      ...(Array.isArray(source?.old) ? source.old : []),
    ].filter((email): email is string => typeof email === "string" && !!email);
    const result: Json = {};
    for (const email of [...new Set(emails)])
      result[email] = {
        email,
        user_id: email,
        auth_mode: "google",
      };
    return result;
  }

  private async claudeAccounts(): Promise<Json> {
    // Claude Code stores API-based authentication in ~/.claude/settings.json.
    const settings = await readJson(
      path.join(this.paths.providerHome, "settings.json"),
      null,
    );
    const token = settings?.env?.ANTHROPIC_AUTH_TOKEN;
    if (typeof token !== "string" || !token) return {};
    const tokenId = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex")
      .slice(0, 24);
    return {
      claude: {
        email: "Claude API account",
        user_id: `claude-api-${tokenId}`,
        access_token: token,
        auth_mode: "api",
      },
    };
  }

  private async freebuffAccounts(): Promise<Json> {
    // FreeBuff Desktop keeps its signed-in session outside ~/.freebuff.
    const statePath = path.join(
      path.dirname(this.paths.providerHome),
      ".config",
      "freebuff-desktop",
      "state.json",
    );
    const state = await readJson(statePath, null);
    const sessions = state?.authSessions;
    if (!sessions || typeof sessions !== "object") return {};
    const result: Json = {};
    for (const [origin, rawSession] of Object.entries(sessions)) {
      const session = rawSession as Json;
      const user = session?.user as Json | undefined;
      if (!user || typeof user !== "object" || typeof user.id !== "string")
        continue;
      result[origin] = {
        email: typeof user.email === "string" ? user.email : undefined,
        displayName: typeof user.name === "string" ? user.name : undefined,
        user_id: user.id,
        access_token:
          typeof session.token === "string" ? session.token : undefined,
        auth_mode: "freebuff",
      };
    }
    return result;
  }

  private async codexAccounts(activeAuth: Json): Promise<Json> {
    const directEntries = Object.values(activeAuth).filter(
      (value) => value && typeof value === "object" && !Array.isArray(value),
    ) as Json[];
    const sources: Json[] = directEntries.length ? directEntries : [activeAuth];
    const storedPlans: Record<string, string> = {};
    try {
      const registry = await readJson(
        path.join(this.paths.providerHome, "accounts", "registry.json"),
        null,
      );
      for (const account of registry?.accounts || []) {
        if (
          typeof account?.chatgpt_account_id === "string" &&
          typeof account?.plan === "string"
        )
          storedPlans[account.chatgpt_account_id] = account.plan;
      }
    } catch {
      // The auth/API data remains the source of truth when no Codex registry exists.
    }
    const accountDir = path.join(this.paths.providerHome, "accounts");
    try {
      for (const name of await fs.readdir(accountDir)) {
        if (!name.endsWith(".auth.json")) continue;
        const account = await readJson(path.join(accountDir, name), null);
        if (account && typeof account === "object" && !Array.isArray(account))
          sources.push(account);
      }
    } catch {
      // Older Codex installations do not have a managed accounts directory.
    }
    const knownEmails: Record<string, string> = {};
    for (const source of sources) {
      const tokens = source.tokens || source;
      if (typeof tokens?.account_id !== "string") continue;
      const payload =
        typeof tokens.id_token === "string"
          ? tokens.id_token.split(".")[1]
          : "";
      try {
        const claims = JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        );
        if (typeof claims.email === "string")
          knownEmails[tokens.account_id] = claims.email;
      } catch {
        // Some Codex entries do not include a readable ID token.
      }
    }
    const result: Json = {};
    for (const [sourceIndex, source] of sources.entries()) {
      // Codex versions use both { tokens: {...} } and direct account entries.
      const tokens = source.tokens || source;
      if (!tokens || typeof tokens !== "object") continue;
      const accountId =
        typeof tokens.account_id === "string" ? tokens.account_id : undefined;
      if (
        !accountId ||
        Object.values(result).some((entry) => entry?.user_id === accountId)
      )
        continue;
      let email = knownEmails[accountId] || "Codex account";
      let plan = storedPlans[accountId] || "Unknown";
      try {
        const payload =
          typeof tokens.id_token === "string"
            ? tokens.id_token.split(".")[1]
            : "";
        const claims = JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        );
        if (typeof claims.email === "string") email = claims.email;
        const claimsPlan =
          claims?.["https://api.openai.com/auth"]?.chatgpt_plan_type;
        if (typeof claimsPlan === "string") plan = claimsPlan;
      } catch {
        // The API remains authoritative when the ID token has no readable claims.
      }
      result[sourceIndex === 0 ? "codex" : accountId] = {
        email,
        plan,
        access_token: tokens.access_token,
        account_id: accountId,
        user_id: accountId,
        auth_mode: source.auth_mode || "chatgpt",
      };
    }
    return result;
  }

  async registry(): Promise<Json[]> {
    const value = await readJson(this.paths.registryFile, []);
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    return [];
  }

  async saveRegistry(registry: Json[]): Promise<void> {
    await writeJson(this.paths.registryFile, registry);
  }

  async readSnapshot(accountId: string) {
    return readJson(snapshotPath(this.paths, accountId), null);
  }

  async writeSnapshot(accountId: string, payload: unknown): Promise<void> {
    await writeJson(snapshotPath(this.paths, accountId), payload);
  }

  async removeSnapshot(accountId: string): Promise<void> {
    await fs.rm(snapshotPath(this.paths, accountId), { force: true });
  }

  async sync(
    allowStoredAccounts = false,
    provider = "default",
  ): Promise<{ a: Json; r: Json[] }> {
    await this.ensure();
    let a: Json;
    let r = await this.registry();
    try {
      a = await this.auth(provider);
    } catch (error: any) {
      if (
        allowStoredAccounts &&
        r.length &&
        ["EACCES", "EPERM", "EBUSY"].includes(error?.code)
      )
        return { a: {}, r };
      throw error;
    }
    const keys = Object.keys(a);
    for (const key of keys) {
      const e = a[key];
      if (!e || typeof e !== "object") continue;
      let x = r.find(
        (item) =>
          ((e.user_id || e.principal_id) &&
            item.userId &&
            (item.userId === e.user_id || item.userId === e.principal_id)) ||
          (!(e.user_id || e.principal_id) && item.authEntryKey === key),
      );
      if (!x) {
        const id = crypto.randomUUID();
        x = { ...entryMeta(id, key, e, false, provider) };
        r.push(x);
      } else {
        x.provider ||= provider;
        // Migrate the previous provider label without losing its saved data.
        if (provider === "agy" && x.provider === "antigravity")
          x.provider = "agy";
        if (e.email) x.email = e.email;
        if (e.email) x.displayName = e.email;
        if (e.plan) x.plan = e.plan;
      }
      try {
        await this.writeSnapshot(x.id, { key, entry: e });
      } catch (error: any) {
        if (!(error?.code === "EACCES" || error?.code === "EPERM")) throw error;
      }
    }
    r = r.filter(
      (item, index, all) =>
        all.findIndex((other) =>
          item.userId && other.userId
            ? other.userId === item.userId
            : other.authEntryKey === item.authEntryKey,
        ) === index,
    );
    const active = findActiveFromAuth(a, r);
    if (active) active.lastActiveAt = new Date().toISOString();
    await this.saveRegistry(r);
    return { a, r };
  }
}

async function latestAgyLoginEmail(): Promise<string | undefined> {
  const logDir = path.join(homedir(), ".gemini", "antigravity-cli", "log");
  let files: string[];
  try {
    files = (await fs.readdir(logDir)).filter((name) => name.endsWith(".log"));
  } catch {
    return undefined;
  }
  let latest: { time: number; email: string } | undefined;
  for (const name of files) {
    const file = path.join(logDir, name);
    try {
      const [stat, text] = await Promise.all([
        fs.stat(file),
        fs.readFile(file, "utf8"),
      ]);
      const matches = [
        ...text.matchAll(/authenticated successfully as ([^\s\\]+@[^\s\\]+)/gi),
      ];
      const email = matches.at(-1)?.[1];
      if (email && (!latest || stat.mtimeMs > latest.time))
        latest = { time: stat.mtimeMs, email };
    } catch {
      // Ignore logs that disappear or cannot be read.
    }
  }
  return latest?.email;
}

export function entryMeta(
  id: string,
  key: string,
  e: Json,
  active = false,
  provider = "default",
) {
  const exp = e.expires_at;
  const status =
    exp && !Number.isNaN(Date.parse(exp)) && Date.parse(exp) <= Date.now()
      ? "EXPIRED"
      : "VALID";
  return {
    id,
    provider,
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

export function findAccount(
  registry: Json[],
  name: string | undefined,
  options: { numeric?: boolean; email?: boolean } = {},
): Json | undefined {
  const numeric = options.numeric !== false;
  const email = options.email !== false;
  if (!name) return undefined;
  if (numeric && /^\d+$/.test(name)) {
    const index = Number(name) - 1;
    if (index >= 0 && registry[index]) return registry[index];
  }
  return registry.find(
    (item) =>
      item.id === name || item.alias === name || (email && item.email === name),
  );
}

export function findActiveFromAuth(
  auth: Json,
  registry: Json[],
): Json | undefined {
  const activeKey = Object.keys(auth)[0];
  const activeEntry = activeKey ? auth[activeKey] : undefined;
  const activeUserId = activeEntry?.user_id || activeEntry?.principal_id;
  if (!activeKey || !activeUserId) return undefined;
  return registry.find(
    (account) =>
      account.userId === activeUserId &&
      (account.authEntryKey === activeKey || account.provider === "codex"),
  );
}

export function lastActiveAccount(registry: Json[]): Json | undefined {
  return [...registry]
    .filter((account) => account.lastActiveAt)
    .sort((left, right) =>
      String(right.lastActiveAt).localeCompare(String(left.lastActiveAt)),
    )[0];
}

export function withActiveFlags(auth: Json, registry: Json[]): Json[] {
  const activeKey = Object.keys(auth)[0];
  const activeEntry = activeKey ? auth[activeKey] : undefined;
  const activeUserId = activeEntry?.user_id || activeEntry?.principal_id;
  const storedActive = !activeUserId
    ? lastActiveAccount(registry)?.id
    : undefined;
  return registry.map((item) => ({
    ...item,
    active:
      (item.userId === activeUserId && item.authEntryKey === activeKey) ||
      item.id === storedActive,
  }));
}

export async function usageCacheTtlMs(paths: AppPaths): Promise<number> {
  const config = await readJson(paths.configFile, {});
  const seconds = Number(config?.usageCacheTtlSeconds);
  return Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : DEFAULT_USAGE_CACHE_TTL_MS;
}

export function backupAuthPath(paths: AppPaths, now = new Date()): string {
  return path.join(
    paths.backupsDir,
    `${now.toISOString().replaceAll(":", "-")}-auth.json`,
  );
}
