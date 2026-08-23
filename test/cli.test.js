import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { parseUsage } from "../dist/providers/billing.js";
import {
  formatTokenLeft,
  formatResetAt,
  formatLastActivity,
  formatUsageUsed,
} from "../dist/lib/format.js";

const run = promisify(execFile);
const cli = path.resolve("dist", "cli.js");

async function invoke(args, env) {
  return run(process.execPath, [cli, ...args], {
    env: { ...process.env, ...env },
  });
}

test("shows help and version", async () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const version = await invoke(["--version"]);
  assert.match(
    version.stdout,
    new RegExp(`aihubs-cli ${pkg.version.replaceAll(".", "\\.")}`),
  );
  const help = await invoke(["--help"]);
  assert.match(help.stdout, /ACCOUNT COMMANDS/);
  const dashboard = await invoke([]);
  assert.match(
    dashboard.stdout,
    new RegExp(`Welcome to aihubs-cli v${pkg.version.replaceAll(".", "\\.")}`),
  );
});

test("lists an empty isolated account store as JSON", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "provider-cli-test-"));
  const result = await invoke(["--json", "list"], {
    PROVIDER_HOME: path.join(root, "provider"),
    PROVIDER_AUTH_HOME: path.join(root, "manager"),
  });
  const body = JSON.parse(result.stdout);
  assert.equal(body.success, true);
  assert.deepEqual(body.accounts, []);
});

test("redacts credentials in metadata export", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "provider-cli-test-"));
  const provider = path.join(root, "provider");
  const manager = path.join(root, "manager");
  await mkdir(provider, { recursive: true });
  await writeFile(
    path.join(provider, "auth.json"),
    JSON.stringify({
      user: { email: "a@example.com", access_token: "secret" },
    }),
  );
  const result = await invoke(
    ["--json", "export", path.join(root, "out.json")],
    { PROVIDER_HOME: provider, PROVIDER_AUTH_HOME: manager },
  );
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
  assert.equal(formatUsageUsed({ used: 151 }), "151 used");
  assert.equal(formatUsageUsed({ used: 250, limit: 500 }), "50% used");
  assert.equal(formatUsageUsed({}), "Unknown");
});

test("saves and clears a manual reset time", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "provider-cli-test-"));
  const provider = path.join(root, "provider");
  const manager = path.join(root, "manager");
  await mkdir(provider, { recursive: true });
  await writeFile(
    path.join(provider, "auth.json"),
    JSON.stringify({
      user: { email: "a@example.com", user_id: "user", access_token: "secret" },
    }),
  );
  const set = await invoke(
    ["--json", "reset", "set", "1", "2026-08-29T07:00:00+07:00"],
    { PROVIDER_HOME: provider, PROVIDER_AUTH_HOME: manager },
  );
  assert.equal(JSON.parse(set.stdout).success, true);
  const list = await invoke(["--json", "list"], {
    PROVIDER_HOME: provider,
    PROVIDER_AUTH_HOME: manager,
  });
  assert.match(
    JSON.parse(list.stdout).accounts[0].manualResetAt,
    /^2026-08-29T00:00:00\.000Z$/,
  );
  const clear = await invoke(["--json", "reset", "clear", "1"], {
    PROVIDER_HOME: provider,
    PROVIDER_AUTH_HOME: manager,
  });
  assert.equal(JSON.parse(clear.stdout).resetAt, null);
});

test("removes several accounts by row number and email in one command", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "provider-cli-test-"));
  const provider = path.join(root, "provider");
  const manager = path.join(root, "manager");
  await mkdir(provider, { recursive: true });
  await writeFile(
    path.join(provider, "auth.json"),
    JSON.stringify({
      k1: { email: "one@example.com", user_id: "u1" },
      k2: { email: "two@example.com", user_id: "u2" },
      k3: { email: "three@example.com", user_id: "u3" },
      k4: { email: "four@example.com", user_id: "u4" },
    }),
  );
  const listed = await invoke(["--json", "list", "--no-usage"], {
    PROVIDER_HOME: provider,
    PROVIDER_AUTH_HOME: manager,
  });
  assert.equal(JSON.parse(listed.stdout).accounts.length, 4);
  const removed = await invoke(
    ["--json", "remove", "01", "03", "four@example.com", "--yes"],
    { PROVIDER_HOME: provider, PROVIDER_AUTH_HOME: manager },
  );
  assert.equal(JSON.parse(removed.stdout).removed.length, 3);
  const after = await invoke(["--json", "list", "--no-usage"], {
    PROVIDER_HOME: provider,
    PROVIDER_AUTH_HOME: manager,
  });
  const emails = JSON.parse(after.stdout).accounts.map((item) => item.email);
  assert.deepEqual(emails, ["two@example.com"]);
});
