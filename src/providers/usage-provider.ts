import { promises as fs } from "node:fs";
import path from "node:path";
import { parseUsage } from "./billing.js";

export interface ProviderUsage {
  available: boolean;
  usagePercent?: number;
  periodStart?: string;
  periodEnd?: string;
  resetAt?: string;
  used?: number;
  limit?: number;
  includedUsed?: number;
  onDemandUsed?: number;
  totalUsed?: number;
  remaining?: number;
  currency?: string;
  subscriptionTier?: string;
  source: "provider-billing";
}

export class ProviderUsageError extends Error {
  constructor(
    public readonly kind: "auth" | "unavailable" | "unsupported",
    message: string,
  ) {
    super(message);
    this.name = "ProviderUsageError";
  }
}

type AuthEntry = Record<string, any>;
type FetchLike = typeof fetch;
type CacheEnvelope = { fetchedAt: number; usage: ProviderUsage };

const DEFAULT_PROXY = "https://cli-chat-proxy.provider.com/v1";
const DEFAULT_TTL = 45_000;

function numberValue(value: any): number | undefined {
  const raw =
    value && typeof value === "object"
      ? (value.val ?? value.value ?? value.amount)
      : value;
  const number =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function firstNumber(...values: any[]): number | undefined {
  for (const value of values) {
    const result = numberValue(value);
    if (result !== undefined) return result;
  }
  return undefined;
}

export function normalizeProviderBilling(body: any): ProviderUsage {
  const config =
    body?.config && typeof body.config === "object" ? body.config : body;
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new ProviderUsageError(
      "unsupported",
      "Provider returned an unsupported billing response.",
    );

  const period = config.currentPeriod || config.current_period;
  const usagePercent = firstNumber(
    config.creditUsagePercent,
    config.credit_usage_percent,
  );
  const periodStart =
    period?.start || config.billingPeriodStart || config.billing_period_start;
  const periodEnd =
    period?.end || config.billingPeriodEnd || config.billing_period_end;
  const parsed = parseUsage(body);
  const includedUsed = firstNumber(
    config.includedUsed,
    config.included_used,
    config.used,
  );
  const onDemandUsed = firstNumber(config.onDemandUsed, config.on_demand_used);
  const totalUsed = firstNumber(config.totalUsed, config.total_used);
  const used = parsed.used ?? includedUsed ?? totalUsed;
  const limit = parsed.limit;
  const remaining = parsed.remaining;
  const subscriptionTier = body?.subscriptionTier || body?.subscription_tier;
  let percent = usagePercent ?? parsed.usagePercent;
  if (percent === undefined && used !== undefined && limit)
    percent = Math.round((used / limit) * 100);

  if (
    percent === undefined &&
    used === undefined &&
    periodStart === undefined &&
    periodEnd === undefined &&
    includedUsed === undefined &&
    onDemandUsed === undefined &&
    totalUsed === undefined &&
    remaining === undefined
  )
    throw new ProviderUsageError(
      "unsupported",
      "Provider returned an unsupported billing response.",
    );

  return {
    available: true,
    ...(percent !== undefined
      ? { usagePercent: Math.max(0, Math.min(100, percent)) }
      : {}),
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd, resetAt: periodEnd } : {}),
    ...(used !== undefined ? { used } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(includedUsed !== undefined ? { includedUsed } : {}),
    ...(onDemandUsed !== undefined ? { onDemandUsed } : {}),
    ...(totalUsed !== undefined ? { totalUsed } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
    ...(typeof subscriptionTier === "string" ? { subscriptionTier } : {}),
    source: "provider-billing",
  };
}

export function mergeProviderUsage(primary: ProviderUsage, extra: ProviderUsage): ProviderUsage {
  const merged: ProviderUsage = { available: true, source: "provider-billing" };
  const keys: (keyof ProviderUsage)[] = [
    "usagePercent",
    "periodStart",
    "periodEnd",
    "resetAt",
    "used",
    "limit",
    "includedUsed",
    "onDemandUsed",
    "totalUsed",
    "remaining",
    "currency",
    "subscriptionTier",
  ];
  for (const key of keys) {
    const value = primary[key] ?? extra[key];
    if (value !== undefined) (merged as any)[key] = value;
  }
  return merged;
}

export class ProviderUsageProvider {
  constructor(
    private readonly options: {
      cacheDir?: string;
      cacheTtlMs?: number;
      proxyBaseUrl?: string;
      providerVersion?: string;
      fetchImpl?: FetchLike;
    } = {},
  ) {}

  private cachePath(accountId: string) {
    return this.options.cacheDir
      ? path.join(this.options.cacheDir, `${accountId}.json`)
      : undefined;
  }

  private async cached(accountId: string) {
    const file = this.cachePath(accountId);
    if (!file) return undefined;
    try {
      const cached = JSON.parse(
        await fs.readFile(file, "utf8"),
      ) as CacheEnvelope;
      const ttl = this.options.cacheTtlMs ?? DEFAULT_TTL;
      return Date.now() - cached.fetchedAt <= ttl ? cached.usage : undefined;
    } catch {
      return undefined;
    }
  }

  async get(
    accountId: string,
    entry: AuthEntry,
    force = false,
  ): Promise<ProviderUsage> {
    if (!force) {
      const cached = await this.cached(accountId);
      if (cached) return cached;
    }
    const token = entry.key || entry.access_token || entry.token;
    const userId = entry.user_id || entry.principal_id;
    if (!token || !userId)
      throw new ProviderUsageError(
        "auth",
        "The selected Provider authentication is no longer valid.",
      );
    const proxy = (
      this.options.proxyBaseUrl ||
      process.env.PROVIDER_PRODUCTION_CLI_CHAT_PROXY_BASE_URL ||
      process.env.PROVIDER_CLI_CHAT_PROXY_BASE_URL ||
      DEFAULT_PROXY
    ).replace(/\/$/, "");
    const version =
      this.options.providerVersion || process.env.PROVIDER_CLIENT_VERSION || "unknown";
    const headers = {
      Authorization: `Bearer ${token}`,
      "X-XAI-Token-Auth": entry.token_header || "xai-provider-cli",
      "x-userid": userId,
      "x-provider-client-version": version,
      "x-provider-client-mode": "interactive",
      Accept: "application/json",
    };
    const fetchImpl = this.options.fetchImpl || fetch;
    const request = async (url: string) => {
      const response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 401 || response.status === 403)
        throw new ProviderUsageError(
          "auth",
          "The selected Provider authentication is no longer valid.",
        );
      if (!response.ok)
        throw new ProviderUsageError(
          "unavailable",
          "The Provider billing service did not return usable usage data.",
        );
      try {
        return normalizeProviderBilling(await response.json());
      } catch (error) {
        if (error instanceof ProviderUsageError) throw error;
        throw new ProviderUsageError(
          "unsupported",
          "Provider returned an unsupported billing response.",
        );
      }
    };
    const creditsUrl = `${proxy}/billing?format=credits`;
    const usageUrl = `${proxy}/billing`;
    const [creditsResult, usageResult] = await Promise.allSettled([
      request(creditsUrl),
      request(usageUrl),
    ]);
    const parts = [creditsResult, usageResult]
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    if (!parts.length) {
      const rejected = [creditsResult, usageResult].find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult;
      throw rejected.reason;
    }
    const usage = parts.reduce((merged, part) => mergeProviderUsage(merged, part));
    const file = this.cachePath(accountId);
    if (file) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(
        file,
        JSON.stringify({ fetchedAt: Date.now(), usage }) + "\n",
        { mode: 0o600 },
      );
    }
    return usage;
  }
}
