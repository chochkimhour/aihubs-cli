import test from "node:test";
import assert from "node:assert/strict";
import {
  findAccount,
  lastActiveAccount,
  withActiveFlags,
} from "../dist/store.js";

test("finds accounts by row number, id, email, and alias", () => {
  const registry = [
    { id: "a1", email: "one@example.com", alias: "personal" },
    { id: "a2", email: "two@example.com" },
  ];
  assert.equal(findAccount(registry, "1")?.id, "a1");
  assert.equal(findAccount(registry, "a2")?.id, "a2");
  assert.equal(findAccount(registry, "one@example.com")?.id, "a1");
  assert.equal(findAccount(registry, "personal")?.id, "a1");
  assert.equal(findAccount(registry, "missing"), undefined);
  assert.equal(
    findAccount(registry, "1", { numeric: false, email: false }),
    undefined,
  );
});

test("marks the auth-backed account as active", () => {
  const registry = [
    {
      id: "a1",
      userId: "u1",
      authEntryKey: "user",
      lastActiveAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "a2",
      userId: "u2",
      authEntryKey: "user",
      lastActiveAt: "2026-08-01T00:00:00.000Z",
    },
  ];
  const flagged = withActiveFlags({ user: { user_id: "u1" } }, registry);
  assert.equal(flagged[0].active, true);
  assert.equal(flagged[1].active, false);
  assert.equal(lastActiveAccount(registry)?.id, "a2");
});
