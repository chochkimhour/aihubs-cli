import { homedir } from "node:os";
import path from "node:path";

export interface AppPaths {
  grokHome: string;
  managerHome: string;
  authFile: string;
  registryFile: string;
  usageCacheDir: string;
  configFile: string;
  accountsDir: string;
  backupsDir: string;
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): AppPaths {
  const grokHome = env.GROK_HOME || path.join(homedir(), ".grok");
  const managerHome = env.GROK_AUTH_HOME || path.join(homedir(), ".grok-auth");
  return {
    grokHome,
    managerHome,
    authFile: path.join(grokHome, "auth.json"),
    registryFile: path.join(managerHome, "registry.json"),
    usageCacheDir: path.join(managerHome, "usage-cache"),
    configFile: path.join(managerHome, "config.json"),
    accountsDir: path.join(managerHome, "accounts"),
    backupsDir: path.join(managerHome, "backups"),
  };
}

export function snapshotPath(paths: AppPaths, accountId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(accountId))
    throw new Error("Invalid account snapshot id");
  return path.join(paths.accountsDir, `${accountId}.json`);
}
