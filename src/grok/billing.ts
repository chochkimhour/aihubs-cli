export function billingValue(v: any, key: string): number | undefined {
  const x = v?.[key];
  const n = typeof x === "object" ? (x?.val ?? x?.value ?? x?.amount) : x;
  if (typeof n === "number") return n;
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n)))
    return Number(n);
  return undefined;
}

function numericish(value: any): number | undefined {
  if (typeof value === "number") return value;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  if (value && typeof value === "object") {
    return (
      numericish(value.val) ??
      numericish(value.value) ??
      numericish(value.amount) ??
      numericish(value.count)
    );
  }
  return undefined;
}

function deepBillingValue(root: any, patterns: RegExp[]): number | undefined {
  const seen = new Set<any>();
  const queue = [root];
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (!patterns.some((pattern) => pattern.test(key))) {
        if (entry && typeof entry === "object") queue.push(entry);
        continue;
      }
      const numeric = numericish(entry);
      if (typeof numeric === "number") return numeric;
      if (entry && typeof entry === "object") queue.push(entry);
    }
  }
  return undefined;
}

export function parseUsage(data: any) {
  const config = data?.config || data || {};
  const used =
    billingValue(config, "used") ??
    billingValue(config, "usedTokens") ??
    billingValue(config, "used_tokens");
  const deepUsed =
    used ??
    deepBillingValue(config, [
      /^used$/i,
      /used[_-]?tokens?/i,
      /^consumed$/i,
      /^spent$/i,
    ]);
  const limitRaw =
    billingValue(config, "monthlyLimit") ??
    billingValue(config, "monthly_limit") ??
    billingValue(config, "usageLimit") ??
    billingValue(config, "usage_limit") ??
    billingValue(config, "creditLimit") ??
    billingValue(config, "credit_limit") ??
    billingValue(config, "quota") ??
    billingValue(config, "quotaLimit") ??
    billingValue(config, "quota_limit") ??
    billingValue(config, "total") ??
    billingValue(config, "totalTokens") ??
    billingValue(config, "total_tokens") ??
    billingValue(config, "max") ??
    billingValue(config, "limit");
  const deepLimit =
    limitRaw ??
    deepBillingValue(config, [
      /^limit$/i,
      /^quota$/i,
      /monthly[_-]?limit/i,
      /credit[_-]?limit/i,
      /^max$/i,
      /^total$/i,
    ]);
  const limit = deepLimit && deepLimit > 0 ? deepLimit : undefined;
  const usagePercent =
    billingValue(config, "creditUsagePercent") ??
    billingValue(config, "credit_usage_percent") ??
    billingValue(config, "usagePercent") ??
    billingValue(config, "usage_percent") ??
    billingValue(config, "percentUsed") ??
    billingValue(config, "percent_used");
  const prepaid =
    billingValue(config, "prepaidBalance") ??
    billingValue(config, "prepaid_balance") ??
    billingValue(config, "creditBalance") ??
    billingValue(config, "credit_balance") ??
    billingValue(config, "remaining") ??
    billingValue(config, "remainingTokens") ??
    billingValue(config, "remaining_tokens");
  const remaining =
    used !== undefined && limit
      ? Math.max(0, limit - used)
      : prepaid && prepaid > 0
        ? prepaid
        : undefined;
  const resetAt =
    config?.currentPeriod?.end ||
    config?.current_period?.end ||
    config?.billingPeriodEnd ||
    config?.billingResetAt ||
    config?.billing_reset_at ||
    config?.resetAt;
  const computedUsed = deepUsed;
  const computedLimit = deepLimit && deepLimit > 0 ? deepLimit : undefined;
  const computedRemaining =
    computedUsed !== undefined && computedLimit
      ? Math.max(0, computedLimit - computedUsed)
      : remaining;
  return {
    used: computedUsed,
    limit: computedLimit,
    usagePercent,
    remaining: computedRemaining,
    resetAt,
    usageState:
      usagePercent !== undefined || computedLimit !== undefined
        ? "available"
        : "no_api_limit",
  };
}
