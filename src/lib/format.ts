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
    year: "numeric",
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

function formatCompactReset(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 18);
  const day = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
  return day;
}

function formatPlan(value: unknown): string {
  const plan = String(value || "Unknown");
  if (plan === "Unknown") return plan;
  const labels: Record<string, string> = {
    go: "Go",
    free: "Free",
    plus: "Plus",
    pro: "Pro",
    team: "Team",
    business: "Business",
    enterprise: "Enterprise",
  };
  return labels[plan.toLowerCase()] || plan[0].toUpperCase() + plan.slice(1);
}

export function printAccountTable(
  ctx: CliContext,
  accounts: Json[],
  active?: string,
): void {
  const header =
    " ID  ".padEnd(6) +
    "PROVIDER".padEnd(12) +
    "ACCOUNT".padEnd(32) +
    "PLAN".padEnd(10) +
    "TOKEN USAGE".padEnd(24) +
    "LAST ACTIVITY";
  console.log(ctx.color("1;38;5;208", header));
  console.log("-".repeat(header.length));
  for (const [index, account] of accounts.entries()) {
    const marker = account.id === active ? "*" : " ";
    const number = String(index + 1).padStart(2, "0");
    const provider = String(account.provider || "-")
      .slice(0, 11)
      .padEnd(12);
    const name = String(account.email || account.displayName || account.id)
      .slice(0, 31)
      .padEnd(32);
    const plan = formatPlan(account.plan || account.subscriptionTier).padEnd(
      10,
    );
    const fiveHour =
      account.errorStatus ||
      String(
        account.fiveHourUsage || account.usage5h || formatUsageUsed(account),
      );
    const reset = formatCompactReset(
      account.fiveHourResetAt ||
        account.resetAt ||
        account.usageResetAt ||
        account.manualResetAt,
    );
    const fiveHourCell = `${fiveHour}${reset === "-" ? "" : ` | ${reset}`}`
      .slice(0, 23)
      .padEnd(24);
    const last = formatLastActivity(account);
    const row = `${marker} ${number} ${provider}${name}${plan}${fiveHourCell}${last}`;
    console.log(account.id === active ? ctx.color("1;32", row) : row);
  }
  console.log(
    `\n${accounts.length} account${accounts.length === 1 ? "" : "s"}`,
  );
}
