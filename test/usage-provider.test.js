import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GrokUsageError, GrokUsageProvider, normalizeGrokBilling } from "../dist/grok/usage-provider.js";

const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  async json() { if (body === "invalid") throw new Error("invalid"); return body; },
});

test("normalizes official credits response and reset period", () => {
  const usage = normalizeGrokBilling({
    config: {
      creditUsagePercent: 42,
      currentPeriod: { start: "2026-08-22T00:00:00Z", end: "2026-08-29T00:00:00Z" },
    },
    subscriptionTier: "Free",
  });
  assert.equal(usage.usagePercent, 42);
  assert.equal(usage.resetAt, "2026-08-29T00:00:00Z");
  assert.equal(usage.subscriptionTier, "Free");
});

test("supports missing usage and missing reset without inventing values", () => {
  assert.equal(normalizeGrokBilling({ config: { currentPeriod: { end: "2026-08-29T00:00:00Z" } } }).usagePercent, undefined);
  assert.equal(normalizeGrokBilling({ config: { creditUsagePercent: 18 } }).resetAt, undefined);
});

test("uses per-account auth, official URL/headers, and caches only normalized data", async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "grok-usage-"));
  let calls = 0;
  let seen;
  const provider = new GrokUsageProvider({ cacheDir, proxyBaseUrl: "https://mock.test/v1", grokVersion: "grok 1.0.5", fetchImpl: async (url, init) => {
    calls++;
    seen = { url, init };
    return response(200, { config: { creditUsagePercent: 18, currentPeriod: { end: "2026-08-29T00:00:00Z" } } });
  } });
  const first = await provider.get("01", { key: "fake-secret", user_id: "user-01" });
  const second = await provider.get("01", { key: "different-secret", user_id: "user-01" });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  assert.equal(seen.url, "https://mock.test/v1/billing?format=credits");
  assert.equal(seen.init.headers.Authorization, "Bearer fake-secret");
  assert.equal(seen.init.headers["x-grok-client-version"], "grok 1.0.5");
  assert.equal(seen.init.headers["x-grok-client-mode"], "interactive");
});

test("classifies auth, server, and malformed responses safely", async () => {
  for (const [status, kind] of [[401, "auth"], [500, "unavailable"]]) {
    const provider = new GrokUsageProvider({ fetchImpl: async () => response(status, {}) });
    await assert.rejects(() => provider.get("01", { key: "fake", user_id: "u" }), (error) => error instanceof GrokUsageError && error.kind === kind);
  }
  const provider = new GrokUsageProvider({ fetchImpl: async () => response(200, "invalid") });
  await assert.rejects(() => provider.get("01", { key: "fake", user_id: "u" }), (error) => error instanceof GrokUsageError && error.kind === "unsupported");
});
