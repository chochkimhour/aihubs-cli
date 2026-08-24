import { promises as fs } from "node:fs";
import path from "node:path";
import { VERSION } from "./constants.js";
import type { CliContext } from "./context.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REGISTRY_URL = "https://registry.npmjs.org/aihubs-cli/latest";

type UpdateCache = { checkedAt: number; latest?: string };

function newerVersion(latest: string): boolean {
  const current = VERSION.split(".").map(Number);
  const next = latest.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((next[i] || 0) !== (current[i] || 0))
      return (next[i] || 0) > (current[i] || 0);
  }
  return false;
}

function showNotice(ctx: CliContext, latest?: string): void {
  if (latest && newerVersion(latest))
    console.error(
      ctx.color(
        "1;38;5;208",
        `\nUpdate available: ${VERSION} → ${latest}\nRun: npm install -g aihubs-cli\n`,
      ),
    );
}

export async function checkForUpdate(ctx: CliContext): Promise<void> {
  if (
    ctx.jsonMode ||
    ctx.hasFlag("--version") ||
    ctx.rawArgs.includes("-v") ||
    ctx.hasFlag("--help") ||
    ctx.rawArgs.includes("-h")
  )
    return;
  const file = path.join(ctx.paths.managerHome, "update-check.json");
  let cache: UpdateCache | undefined;
  try {
    cache = JSON.parse(await fs.readFile(file, "utf8")) as UpdateCache;
  } catch {
    // A missing or invalid cache is refreshed below.
  }
  if (cache && Date.now() - cache.checkedAt < CHECK_INTERVAL_MS) {
    showNotice(ctx, cache.latest);
    return;
  }
  try {
    const response = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(750),
      headers: { Accept: "application/json" },
    });
    const body = (await response.json()) as { version?: string };
    const latest = typeof body.version === "string" ? body.version : undefined;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ checkedAt: Date.now(), latest }) + "\n", {
      mode: 0o600,
    });
    showNotice(ctx, latest);
  } catch {
    // Update checks are best-effort and never affect CLI commands.
  }
}
