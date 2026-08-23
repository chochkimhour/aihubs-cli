import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseUsage, formatTokenLeft, formatResetAt, formatLastActivity } from "../dist/cli.js";

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

test("parses usage data without requiring every field", () => {
  const parsed = parseUsage({
    config: {
      used_tokens: "120",
      monthlyLimit: 500,
      currentPeriod: { end: "2026-08-23T12:34:56Z" },
    },
  });
  assert.equal(parsed.used, 120);
  assert.equal(parsed.limit, 500);
  assert.equal(parsed.remaining, 380);
  assert.equal(parsed.resetAt, "2026-08-23T12:34:56Z");
  assert.equal(parsed.usageState, "available");
});

test("finds nested usage values", () => {
  const parsed = parseUsage({
    config: {
      billing: {
        stats: {
          consumed: { val: "250" },
          quota: { value: "500" },
        },
      },
    },
  });
  assert.equal(parsed.used, 250);
  assert.equal(parsed.limit, 500);
  assert.equal(parsed.remaining, 250);
  assert.equal(parsed.usageState, "available");
});

test("formats token and reset fields defensively", () => {
  assert.equal(formatTokenLeft({ used: 250, limit: 500 }), "50%");
  assert.equal(formatTokenLeft({ remaining: 25, limit: 100 }), "25%");
  assert.equal(formatTokenLeft({ usagePercent: 80 }), "20%");
  assert.equal(formatTokenLeft({ used: 123 }), "NO API LIMIT");
  assert.equal(formatTokenLeft({ usageState: "unavailable" }), "UNAVAILABLE");
  assert.equal(formatResetAt("not-a-date"), "not-a-date");
  assert.match(formatResetAt("2026-08-29T07:30:00Z"), /Aug 29, 2026/);
  assert.equal(formatLastActivity({ active: true }), "Now");
  assert.equal(formatLastActivity({}), "-");
});

test("saves and clears a manual reset time", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "grok-cli-test-"));
  const grok = path.join(root, "grok");
  const manager = path.join(root, "manager");
  await mkdir(grok, { recursive: true });
  await writeFile(path.join(grok, "auth.json"), JSON.stringify({ user: { email: "a@example.com", user_id: "user", access_token: "secret" } }));
  const set = await invoke(["--json", "reset", "set", "1", "2026-08-29T07:00:00+07:00"], { GROK_HOME: grok, GROK_AUTH_HOME: manager });
  assert.equal(JSON.parse(set.stdout).success, true);
  const list = await invoke(["--json", "list"], { GROK_HOME: grok, GROK_AUTH_HOME: manager });
  assert.match(JSON.parse(list.stdout).accounts[0].manualResetAt, /^2026-08-29T00:00:00\.000Z$/);
  const clear = await invoke(["--json", "reset", "clear", "1"], { GROK_HOME: grok, GROK_AUTH_HOME: manager });
  assert.equal(JSON.parse(clear.stdout).resetAt, null);
});
