import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const cli = path.resolve("dist", "cli.js");

async function invoke(args, env) {
  return run(process.execPath, [cli, ...args], { env: { ...process.env, ...env } });
}

test("shows help and version", async () => {
  const version = await invoke(["--version"]);
  assert.match(version.stdout, /grok-cli 1\.0\.0/);
  const help = await invoke(["--help"]);
  assert.match(help.stdout, /ACCOUNT COMMANDS/);
});

test("lists an empty isolated account store as JSON", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "grok-cli-test-"));
  const result = await invoke(["--json", "list"], {
    GROK_HOME: path.join(root, "grok"),
    GROK_AUTH_HOME: path.join(root, "manager"),
  });
  const body = JSON.parse(result.stdout);
  assert.equal(body.success, true);
  assert.deepEqual(body.accounts, []);
});

test("redacts credentials in metadata export", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "grok-cli-test-"));
  const grok = path.join(root, "grok");
  const manager = path.join(root, "manager");
  await mkdir(grok, { recursive: true });
  await writeFile(path.join(grok, "auth.json"), JSON.stringify({ user: { email: "a@example.com", access_token: "secret" } }));
  const result = await invoke(["--json", "export", path.join(root, "out.json")], { GROK_HOME: grok, GROK_AUTH_HOME: manager });
  assert.equal(JSON.parse(result.stdout).metadataOnly, true);
});
