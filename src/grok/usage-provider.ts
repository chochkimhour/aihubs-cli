import { promises as fs } from "node:fs";
import path from "node:path";

export interface GrokUsage {
  available: boolean;
  usagePercent?: number;
  periodStart?: string;
  periodEnd?: string;
  resetAt?: string;
  includedUsed?: number;
  onDemandUsed?: number;
  totalUsed?: number;
  remaining?: number;
  currency?: string;
  subscriptionTier?: string;
  source: "grok-billing";
}

export class GrokUsageError extends Error {
  constructor(public readonly kind: "auth" | "unavailable" | "unsupported", message: string) {
    super(message);
    this.name = "GrokUsageError";
  }
}

type AuthEntry = Record<string, any>;
type FetchLike = typeof fetch;
type CacheEnvelope = { fetchedAt: number; usage: GrokUsage };

const DEFAULT_PROXY = "https://cli-chat-proxy.grok.com/v1";
const DEFAULT_TTL = 45_000;

function numberValue(value: any): number | undefined {
  const raw = value && typeof value === "object" ? value.val ?? value.value ?? value.amount : value;
  const number = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function firstNumber(...values: any[]): number | undefined {
  for (const value of values) {
    const result = numberValue(value);
    if (result !== undefined) return result;
  }
  return undefined;
}

export function normalizeGrokBilling(body: any): GrokUsage {
  const config = body?.config && typeof body.config === "object" ? body.config : body;
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new GrokUsageError("unsupported", "Grok returned an unsupported billing response.");

  const period = config.currentPeriod || config.current_period;
  const usagePercent = firstNumber(config.creditUsagePercent, config.credit_usage_percent);
  const periodStart = period?.start || config.billingPeriodStart || config.billing_period_start;
  const periodEnd = period?.end || config.billingPeriodEnd || config.billing_period_end;
  const includedUsed = firstNumber(config.includedUsed, config.included_used, config.used);
  const onDemandUsed = firstNumber(config.onDemandUsed, config.on_demand_used);
  const totalUsed = firstNumber(config.totalUsed, config.total_used);
  const remaining = firstNumber(config.prepaidBalance, config.prepaid_balance);
  const subscriptionTier = body?.subscriptionTier || body?.subscription_tier;

  if (
    usagePercent === undefined && periodStart === undefined && periodEnd === undefined &&
    includedUsed === undefined && onDemandUsed === undefined && totalUsed === undefined && remaining === undefined
  ) throw new GrokUsageError("unsupported", "Grok returned an unsupported billing response.");

  return {
    available: true,
    ...(usagePercent !== undefined ? { usagePercent: Math.max(0, Math.min(100, usagePercent)) } : {}),
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd, resetAt: periodEnd } : {}),
    ...(includedUsed !== undefined ? { includedUsed } : {}),
    ...(onDemandUsed !== undefined ? { onDemandUsed } : {}),
    ...(totalUsed !== undefined ? { totalUsed } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
    ...(typeof subscriptionTier === "string" ? { subscriptionTier } : {}),
    source: "grok-billing",
  };
}

export class GrokUsageProvider {
  constructor(
    private readonly options: {
      cacheDir?: string;
      cacheTtlMs?: number;
      proxyBaseUrl?: string;
      grokVersion?: string;
      fetchImpl?: FetchLike;
    } = {},
  ) {}

  private cachePath(accountId: string) {
    return this.options.cacheDir ? path.join(this.options.cacheDir, `${accountId}.json`) : undefined;
  }

  private async cached(accountId: string) {
    const file = this.cachePath(accountId);
    if (!file) return undefined;
    try {
      const cached = JSON.parse(await fs.readFile(file, "utf8")) as CacheEnvelope;
      const ttl = this.options.cacheTtlMs ?? DEFAULT_TTL;
      return Date.now() - cached.fetchedAt <= ttl ? cached.usage : undefined;
    } catch { return undefined; }
  }

  async get(accountId: string, entry: AuthEntry, force = false): Promise<GrokUsage> {
    if (!force) {
      const cached = await this.cached(accountId);
      if (cached) return cached;
    }
    const token = entry.key || entry.access_token || entry.token;
    const userId = entry.user_id || entry.principal_id;
    if (!token || !userId) throw new GrokUsageError("auth", "The selected Grok authentication is no longer valid.");
    const proxy = (this.options.proxyBaseUrl || process.env.GROK_PRODUCTION_CLI_CHAT_PROXY_BASE_URL || process.env.GROK_CLI_CHAT_PROXY_BASE_URL || DEFAULT_PROXY).replace(/\/$/, "");
    const version = this.options.grokVersion || process.env.GROK_CLIENT_VERSION || "unknown";
    const response = await (this.options.fetchImpl || fetch)(`${proxy}/billing?format=credits`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-XAI-Token-Auth": entry.token_header || "xai-grok-cli",
        "x-userid": userId,
        "x-grok-client-version": version,
        "x-grok-client-mode": "interactive",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403)
      throw new GrokUsageError("auth", "The selected Grok authentication is no longer valid.");
    if (!response.ok) throw new GrokUsageError("unavailable", "The Grok billing service did not return usable usage data.");
    let body: any;
    try { body = await response.json(); } catch { throw new GrokUsageError("unsupported", "Grok returned an unsupported billing response."); }
    const usage = normalizeGrokBilling(body);
    const file = this.cachePath(accountId);
    if (file) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify({ fetchedAt: Date.now(), usage }) + "\n", { mode: 0o600 });
    }
    return usage;
  }
}
