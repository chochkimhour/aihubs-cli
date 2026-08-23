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
  if (typeof account.used === "number") return `${account.used} used`;
  if (account.usageState === "unavailable") return "Unknown";
  return "Unknown";
}

export function printAccountTable(
  ctx: CliContext,
  accounts: Json[],
  active?: string,
): void {
  const header =
    "    ID  " +
    "PROVIDER".padEnd(12) +
    "ACCOUNT".padEnd(30) +
    "STATUS".padEnd(10) +
    "LAST SELECTED".padEnd(16) +
    "USAGE".padEnd(12) +
    "RESET AT";
  console.log(
    ctx.color("1;36", header),
  );
  console.log(
    "------------------------------------------------------------------------------------------------",
  );
  for (const [index, account] of accounts.entries()) {
    const marker = account.id === active ? "*" : " ";
    const number = String(index + 1).padStart(2, "0");
    const name = String(account.email || account.displayName || account.id)
      .slice(0, 29)
      .padEnd(30);
    const provider = String(account.provider || "default")
      .slice(0, 11)
      .padEnd(12);
    const status = String(account.status || "-").toLowerCase();
    const statusLabel = (
      status === "-" ? status : status[0].toUpperCase() + status.slice(1)
    ).padEnd(10);
    const last = formatLastActivity(account).padEnd(16);
    const tokenLeft = formatUsageUsed(account).padEnd(12);
    const reset = formatResetDate(
      account.resetAt ||
        account.usageResetAt ||
        account.manualResetAt ||
        account.resetIn,
    );
    const row = `${marker} ${number}  ${provider}${name}${statusLabel}${last}${tokenLeft}${reset}`;
    console.log(account.id === active ? ctx.color("1;32", row) : row);
  }
  console.log(
    `\n${accounts.length} account${accounts.length === 1 ? "" : "s"}`,
  );
}
