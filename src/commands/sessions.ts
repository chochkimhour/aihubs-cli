import { statSync, existsSync, readdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { runProvider } from "../providers/spawn.js";
import { autoSwitch } from "./usage.js";
import type { CliContext } from "../context.js";
import { PROVIDER_COMMANDS } from "../constants.js";

export function findMostRecentProvider(): string | undefined {
  const home = homedir();
  const checks: { provider: string; paths: string[] }[] = [
    {
      provider: "codex",
      paths: [
        path.join(home, ".codex", "history.jsonl"),
        path.join(home, ".codex", "sessions"),
        path.join(home, ".codex", "auth.json"),
      ],
    },
    {
      provider: "grok",
      paths: [
        path.join(home, ".grok", "sessions"),
        path.join(home, ".grok", "active_sessions.json"),
        path.join(home, ".grok", "auth.json"),
      ],
    },
    {
      provider: "claude",
      paths: [
        path.join(home, ".claude", "history.jsonl"),
        path.join(home, ".claude", "sessions"),
        path.join(home, ".claude", ".credentials.json"),
      ],
    },
    {
      provider: "agy",
      paths: [
        path.join(home, ".gemini", "antigravity-cli", "brain"),
        path.join(home, ".gemini", "history"),
        path.join(home, ".antigravity", "auth.json"),
      ],
    },
    {
      provider: "freebuff",
      paths: [path.join(home, ".freebuff", "auth.json")],
    },
  ];

  let newestTime = 0;
  let newestProvider: string | undefined;

  for (const { provider, paths } of checks) {
    for (const p of paths) {
      try {
        if (!existsSync(p)) continue;
        const stat = statSync(p);
        let mtime = stat.mtimeMs;
        if (stat.isDirectory()) {
          try {
            const files = readdirSync(p);
            for (const f of files) {
              const childStat = statSync(path.join(p, f));
              if (childStat.mtimeMs > mtime) {
                mtime = childStat.mtimeMs;
              }
            }
          } catch {}
        }
        if (mtime > newestTime) {
          newestTime = mtime;
          newestProvider = provider;
        }
      } catch {}
    }
  }

  return newestProvider;
}

export function getContinueArgs(
  provider: string | undefined,
  session?: string,
): string[] {
  switch (provider) {
    case "codex":
      return session ? ["resume", session] : ["resume", "--last"];
    case "grok":
      return session ? ["--resume", session] : ["--continue"];
    case "agy":
      return session ? ["--conversation", session] : ["--continue"];
    case "claude":
      return session ? ["--resume", session] : ["--resume"];
    case "freebuff":
      return session ? ["--resume", session] : ["--continue"];
    default:
      return session ? ["--resume", session] : ["--continue"];
  }
}

async function prepareCodexAuth(): Promise<void> {
  const home = homedir();
  const authPath = path.join(home, ".codex", "auth.json");
  const accountsDir = path.join(home, ".codex", "accounts");
  try {
    const auth = JSON.parse(await fs.readFile(authPath, "utf8"));
    // aihubs-cli stores multiple accounts in auth.json, while Codex expects
    // its active account in the native { tokens: ... } format.
    if (auth?.tokens?.access_token) return;
    const first = Object.values(auth).find(
      (value: any) => value && typeof value === "object" && value.account_id,
    ) as any;
    if (!first?.account_id) return;
    const nativePath = path.join(accountsDir, `${first.account_id}.auth.json`);
    if (existsSync(nativePath)) await fs.copyFile(nativePath, authPath);
  } catch {
    // Let Codex report a normal authentication error if repair is impossible.
  }
}

export async function continueCommand(
  ctx: CliContext,
  forcedProvider?: string,
): Promise<void> {
  const isDirectProvider =
    forcedProvider ||
    (PROVIDER_COMMANDS[ctx.positional[0]?.toLowerCase()]
      ? ctx.positional[0].toLowerCase()
      : undefined);

  if (
    ctx.positional[2]?.toLowerCase() === "to" &&
    PROVIDER_COMMANDS[ctx.positional[3]?.toLowerCase()]
  ) {
    return ctx.fail(
      "INVALID_OPTION",
      "Cross-provider continue is not supported. Use 'continue <provider>'.",
    );
  }

  let provider: string | undefined;
  if (isDirectProvider) {
    provider = isDirectProvider;
  } else {
    const specified = PROVIDER_COMMANDS[ctx.positional[1]?.toLowerCase()]
      ? ctx.positional[1].toLowerCase()
      : undefined;
    if (specified) {
      provider = specified;
    } else {
      provider = findMostRecentProvider();
    }
  }

  const command = provider ? PROVIDER_COMMANDS[provider] : undefined;
  await autoSwitch(ctx, true, provider);
  if (provider === "codex") await prepareCodexAuth();
  const argv = getContinueArgs(provider);
  await runProvider(
    argv,
    (code) => `provider continue exited with code ${code}`,
    command,
  );
}

export async function sessionCommand(ctx: CliContext): Promise<void> {
  const provider = PROVIDER_COMMANDS[ctx.positional[1]?.toLowerCase()]
    ? ctx.positional[1].toLowerCase()
    : undefined;
  const command = provider ? PROVIDER_COMMANDS[provider] : undefined;
  const session = provider ? ctx.positional[2] : ctx.positional[1];
  if (session)
    return ctx.fail(
      "INVALID_OPTION",
      "Use 'session' to list sessions, then 'continue <provider>' to continue one.",
    );
  await autoSwitch(ctx, true, provider);
  if (provider === "codex")
    return runProvider(
      ["resume", "--all"],
      (code) => `provider session list exited with code ${code}`,
      command,
    );
  if (provider === "grok")
    return runProvider(
      ["sessions", "list"],
      (code) => `provider session list exited with code ${code}`,
      command,
    );
  if (provider === "claude")
    return runProvider(
      ["--resume"],
      (code) => `provider session list exited with code ${code}`,
      command,
    );
  await runProvider(
    ["sessions", "list"],
    (code) => `provider session list exited with code ${code}`,
    command,
  );
}
