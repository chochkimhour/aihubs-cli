import { promises as fs } from "node:fs";
import crypto from "node:crypto";
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

  async auth(): Promise<Json> {
    const value = await readJson(this.paths.authFile, {});
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw new Error("Provider auth.json must contain a JSON object");
    return value;
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

  async sync(allowStoredAccounts = false): Promise<{ a: Json; r: Json[] }> {
    await this.ensure();
    let a: Json;
    let r = await this.registry();
    try {
      a = await this.auth();
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
          item.authEntryKey === key &&
          ((!e.user_id && !e.principal_id) ||
            (item.userId &&
              (item.userId === e.user_id || item.userId === e.principal_id))),
      );
      if (!x) {
        const id = crypto.randomUUID();
        x = { ...entryMeta(id, key, e) };
        r.push(x);
      }
      await this.writeSnapshot(x.id, { key, entry: e });
    }
    r = r.filter(
      (item, index, all) =>
        all.findIndex(
          (other) =>
            other.authEntryKey === item.authEntryKey &&
            (other.userId || "") === (item.userId || ""),
        ) === index,
    );
    const active = findActiveFromAuth(a, r);
    if (active) active.lastActiveAt = new Date().toISOString();
    await this.saveRegistry(r);
    return { a, r };
  }
}

export function entryMeta(id: string, key: string, e: Json, active = false) {
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
  return registry.find(
    (account) =>
      account.authEntryKey === activeKey && account.userId === activeUserId,
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
