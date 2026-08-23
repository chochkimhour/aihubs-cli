import type { Json } from "../types.js";
import type { CliContext } from "../context.js";

export function formatResetAt(value: unknown): string {
  if (!value) return "-";
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
  return date
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(/,?\s*at\s*/i, ", ");
}

export function formatLastActivity(account: Json): string {
  if (account.active) return "Now";
  if (!account.lastUsedAt) return "-";
  const date = new Date(account.lastUsedAt);
  if (Number.isNaN(date.getTime()))
    return String(account.lastUsedAt).slice(0, 16);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatResetDate(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTokenLeft(account: Json): string {
  const limit =
    typeof account.limit === "number" && account.limit > 0
      ? account.limit
      : undefined;
  if (typeof account.used === "number" && limit)
    return `${Math.max(0, Math.min(100, Math.round(100 - (account.used / limit) * 100)))}%`;
  if (account.remaining !== undefined && limit)
    return `${Math.max(0, Math.min(100, Math.round((account.remaining / limit) * 100)))}%`;
  if (account.usagePercent !== undefined)
    return `${Math.max(0, Math.min(100, Math.round(100 - account.usagePercent)))}%`;
  return account.usageState === "unavailable" ? "UNAVAILABLE" : "NO API LIMIT";
}

export function formatUsageUsed(account: Json): string {
  if (
    typeof account.used === "number" &&
    typeof account.limit === "number" &&
    account.limit > 0
  )
    return `${Math.max(0, Math.min(100, Math.round((account.used / account.limit) * 100)))}% used`;
  if (account.usagePercent !== undefined)
    return `${Math.max(0, Math.min(100, Math.round(Number(account.usagePercent))))}% used`;
  if (account.usageState === "unavailable") return "Unknown";
  return "Unknown";
}

export function printAccountTable(
  ctx: CliContext,
  accounts: Json[],
  active?: string,
): void {
  console.log(
    ctx.color(
      "1;36",
      "     ID  ACCOUNT                       AUTH   STATUS   LAST SELECTED   USAGE        RESET AT",
    ),
  );
  console.log(
    "------------------------------------------------------------------------------------------------",
  );
  for (const [index, account] of accounts.entries()) {
    const marker = account.id === active ? "*" : " ";
    const number = String(index + 1).padStart(2, "0");
    const name = String(
      account.email || account.displayName || account.id,
    ).padEnd(29);
    const authMode = String(account.authMode || "-")
      .toUpperCase()
      .padEnd(7);
    const status = String(account.status || "-").toLowerCase();
    const statusLabel = (
      status === "-" ? status : status[0].toUpperCase() + status.slice(1)
    ).padEnd(8);
    const last = formatLastActivity(account).padEnd(16);
    const tokenLeft = formatUsageUsed(account).padEnd(12);
    const reset = formatResetDate(
      account.resetAt ||
        account.usageResetAt ||
        account.manualResetAt ||
        account.resetIn,
    );
    const row = `${marker} ${number} ${name} ${authMode}${statusLabel}${last}${tokenLeft} ${reset}`;
    console.log(account.id === active ? ctx.color("1;32", row) : row);
  }
  console.log(
    `\n${accounts.length} account${accounts.length === 1 ? "" : "s"}`,
  );
}
