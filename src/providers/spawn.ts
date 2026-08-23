import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { PROVIDER_COMMAND, providerNotFoundMessage } from "../constants.js";

export function spawnProvider(
  argv: string[],
  options: SpawnOptions = {},
  command = PROVIDER_COMMAND,
) {
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
  return (async () => {
    if (!(await commandExists(command)))
      throw new Error(providerNotFoundMessage(command));
    const isFreebuffLogin =
      argv[0] === "login" && /freebuff(?:\.cmd)?$/i.test(command);
    const child = isFreebuffLogin
      ? spawnProvider(argv, { stdio: ["inherit", "pipe", "inherit"] }, command)
      : spawnProvider(argv, { stdio: "inherit" }, command);
    if (isFreebuffLogin) pipeFreebuffOutput(child);
    await new Promise<void>((resolve, reject) => {
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(failMessage(code))),
      );
      child.on("error", () =>
        reject(new Error(providerNotFoundMessage(command))),
      );
    });
  })();
}

function commandExists(command: string): Promise<boolean> {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  return new Promise((resolve) => {
    const child = spawn(lookup, [command], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function pipeFreebuffOutput(child: ChildProcess): void {
  let buffered = "";
  child.stdout?.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    process.stdout.write(text);
    buffered += text;
    const match = buffered.match(/https?:\/\/[^\s"'<>]+/);
    if (match) {
      openBrowser(match[0]).catch(() => undefined);
      buffered = "";
    }
  });
}

async function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === "win32"
      ? "cmd"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const browser = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  browser.unref();
}
