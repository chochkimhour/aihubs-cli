import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ProviderUsageError,
  ProviderUsageProvider,
  mergeProviderUsage,
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
  assert.equal(seen.init.headers["x-provider-client-version"], "provider 1.0.5");
  assert.equal(seen.init.headers["x-provider-client-mode"], "interactive");
});

test("classifies auth, server, and malformed responses safely", async () => {
  for (const [status, kind] of [
    [401, "auth"],
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
  const provider = new ProviderUsageProvider({
    fetchImpl: async () => response(200, "invalid"),
  });
  await assert.rejects(
    () => provider.get("01", { key: "fake", user_id: "u" }),
    (error) => error instanceof ProviderUsageError && error.kind === "unsupported",
  );
});
