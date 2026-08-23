import { spawn, type SpawnOptions } from "node:child_process";
import { GROK_COMMAND, GROK_NOT_FOUND } from "../constants.js";

export function spawnGrok(argv: string[], options: SpawnOptions = {}) {
  return spawn(GROK_COMMAND, argv, options);
}

export async function grokVersion(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawnGrok(["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.on("close", (code) =>
      resolve(code === 0 ? output.trim() : "not detected"),
    );
    child.on("error", () => resolve("not detected"));
  });
}

export function runGrok(
  argv: string[],
  failMessage: (code: number | null) => string,
): Promise<void> {
  const child = spawnGrok(argv, { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(failMessage(code))),
    );
    child.on("error", () => reject(new Error(GROK_NOT_FOUND)));
  });
}
