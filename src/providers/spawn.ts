import { spawn, type SpawnOptions } from "node:child_process";
import { PROVIDER_COMMAND, providerNotFoundMessage } from "../constants.js";

export function spawnProvider(argv: string[], options: SpawnOptions = {}, command = PROVIDER_COMMAND) {
  const useShell =
    process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
  return spawn(command, argv, { ...options, shell: options.shell ?? useShell });
}

export async function providerVersion(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawnProvider(["--version"], {
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

export function runProvider(
  argv: string[],
  failMessage: (code: number | null) => string,
  command = PROVIDER_COMMAND,
): Promise<void> {
  const child = spawnProvider(argv, { stdio: "inherit" }, command);
  return new Promise((resolve, reject) => {
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(failMessage(code))),
    );
    child.on("error", () => reject(new Error(providerNotFoundMessage(command))));
  });
}
