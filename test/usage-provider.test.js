import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ProviderUsageError,
  ProviderUsageProvider,
  mergeProviderUsage,
  normalizeCodexUsage,
  normalizeProviderBilling,
} from "../dist/providers/usage-provider.js";

const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  async json() {
    if (body === "invalid") throw new Error("invalid");
    return body;
  },
});

test("normalizes official credits response and reset period", () => {
  const usage = normalizeProviderBilling({
    config: {
      creditUsagePercent: 42,
      currentPeriod: {
        start: "2026-08-22T00:00:00Z",
        end: "2026-08-29T00:00:00Z",
      },
    },
    subscriptionTier: "Free",
  });
  assert.equal(usage.usagePercent, 42);
  assert.equal(usage.resetAt, "2026-08-29T00:00:00Z");
  assert.equal(usage.subscriptionTier, "Free");
});

test("reads used from the default billing payload without inventing a limit", () => {
  const usage = normalizeProviderBilling({
    config: {
      monthlyLimit: { val: 0 },
      used: { val: 151 },
      billingPeriodStart: "2026-08-01T00:00:00Z",
      billingPeriodEnd: "2026-09-01T00:00:00Z",
    },
  });
  assert.equal(usage.used, 151);
  assert.equal(usage.limit, undefined);
  assert.equal(usage.usagePercent, undefined);
  assert.equal(usage.resetAt, "2026-09-01T00:00:00Z");
});

test("merges weekly credits period with monthly used count", () => {
  const merged = mergeProviderUsage(
    normalizeProviderBilling({
      config: {
        currentPeriod: {
          start: "2026-08-22T00:00:00Z",
          end: "2026-08-29T00:00:00Z",
        },
        onDemandUsed: { val: 0 },
      },
    }),
    normalizeProviderBilling({
      config: { monthlyLimit: { val: 0 }, used: { val: 151 } },
    }),
  );
  assert.equal(merged.used, 151);
  assert.equal(merged.resetAt, "2026-08-29T00:00:00Z");
  assert.equal(merged.usagePercent, undefined);
});

test("supports missing usage and missing reset without inventing values", () => {
  assert.equal(
    normalizeProviderBilling({
      config: { currentPeriod: { end: "2026-08-29T00:00:00Z" } },
    }).usagePercent,
    undefined,
  );
  assert.equal(
    normalizeProviderBilling({ config: { creditUsagePercent: 18 } }).resetAt,
    undefined,
  );
});

test("normalizes Codex primary and weekly windows with Unix resets", () => {
  const usage = normalizeCodexUsage({
    plan_type: "plus",
    rate_limit: {
      primary_window: { used_percent: 98, reset_at: 1780122300 },
      secondary_window: { used_percent: 40, reset_at: 1780125900 },
    },
  });
  assert.equal(usage.plan, "plus");
  assert.equal(usage.fiveHourUsage, "98%");
  assert.equal(usage.weeklyUsage, "40%");
  assert.match(usage.fiveHourResetAt, /2026/);
  assert.match(usage.weeklyResetAt, /2026/);
});

test("supports zero, full, and missing secondary Codex usage", () => {
  assert.equal(
    normalizeCodexUsage({ rate_limit: { primary_window: { used_percent: 0 } } })
      .fiveHourUsage,
    "0%",
  );
  assert.equal(
    normalizeCodexUsage({
      rate_limit: { primary_window: { used_percent: 100 } },
    }).fiveHourUsage,
    "100%",
  );
  assert.equal(
    normalizeCodexUsage({
      rate_limit: { primary_window: { used_percent: 12 } },
    }).weeklyUsage,
    undefined,
  );
});

test("fetches Codex usage with each account token and account id", async () => {
  const seen = [];
  const provider = new ProviderUsageProvider({
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), headers: init.headers });
      return response(
        200,
        seen.length === 1
          ? {
              plan_type: "free",
              rate_limit: {
                primary_window: { used_percent: 10, reset_at: 1780122300 },
              },
            }
          : { accounts: [{ id: "account-1", plan_type: "free" }] },
      );
    },
  });
  const usage = await provider.get(
    "01",
    { access_token: "token-1", account_id: "account-1" },
    false,
    "codex",
  );
  assert.equal(usage.plan, "free");
  assert.equal(usage.fiveHourUsage, "10%");
  assert.equal(seen[0].url, "https://chatgpt.com/backend-api/wham/usage");
  assert.equal(seen[0].headers.Authorization, "Bearer token-1");
  assert.equal(seen[0].headers["ChatGPT-Account-Id"], "account-1");
});

test("uses per-account auth, official URL/headers, and caches only normalized data", async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "provider-usage-"));
  let calls = 0;
  let seen;
  const provider = new ProviderUsageProvider({
    cacheDir,
    proxyBaseUrl: "https://mock.test/v1",
    providerVersion: "provider 1.0.5",
    fetchImpl: async (url, init) => {
      calls++;
      seen = { url, init };
      if (String(url).includes("format=credits"))
        return response(200, {
          config: {
            creditUsagePercent: 18,
            currentPeriod: { end: "2026-08-29T00:00:00Z" },
          },
        });
      return response(200, {
        config: { monthlyLimit: { val: 0 }, used: { val: 151 } },
      });
    },
  });
  const first = await provider.get("01", {
    key: "fake-secret",
    user_id: "user-01",
  });
  const second = await provider.get("01", {
    key: "different-secret",
    user_id: "user-01",
  });
  assert.deepEqual(second, first);
  assert.equal(first.used, 151);
  assert.equal(first.usagePercent, 18);
  assert.equal(calls, 2);
  assert.equal(seen.url, "https://mock.test/v1/billing");
  assert.equal(seen.init.headers.Authorization, "Bearer fake-secret");
  assert.equal(
    seen.init.headers["x-provider-client-version"],
    "provider 1.0.5",
  );
  assert.equal(seen.init.headers["x-provider-client-mode"], "interactive");
});

test("classifies auth, server, and malformed responses safely", async () => {
  for (const [status, kind] of [
    [401, "auth"],
    [403, "auth"],
    [429, "unavailable"],
    [500, "unavailable"],
  ]) {
    const provider = new ProviderUsageProvider({
      fetchImpl: async () => response(status, {}),
    });
    await assert.rejects(
      () => provider.get("01", { key: "fake", user_id: "u" }),
      (error) => error instanceof ProviderUsageError && error.kind === kind,
    );
  }
  for (const [status, expected] of [
    [401, 401],
    [403, 403],
    [429, 429],
    [500, 500],
  ]) {
    const provider = new ProviderUsageProvider({
      fetchImpl: async () => response(status, {}),
    });
    await assert.rejects(
      () =>
        provider.get(
          "01",
          { access_token: "fake", account_id: "u" },
          false,
          "codex",
        ),
      (error) =>
        error instanceof ProviderUsageError && error.statusCode === expected,
    );
  }
  const provider = new ProviderUsageProvider({
    fetchImpl: async () => response(200, "invalid"),
  });
  await assert.rejects(
    () => provider.get("01", { key: "fake", user_id: "u" }),
    (error) =>
      error instanceof ProviderUsageError && error.kind === "unsupported",
  );
});
