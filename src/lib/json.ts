import { promises as fs } from "node:fs";

export async function readJson(file: string, fallback: any) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e: any) {
    if (e.code === "ENOENT") return fallback;
    if (e instanceof SyntaxError) throw new Error(`Malformed JSON: ${file}`);
    throw e;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(requireParent(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
}

function requireParent(file: string): string {
  // Keep JSON helpers useful for exports and first-run setup without making
  // callers repeat directory creation everywhere.
  return (
    file.slice(0, Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"))) ||
    "."
  );
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
